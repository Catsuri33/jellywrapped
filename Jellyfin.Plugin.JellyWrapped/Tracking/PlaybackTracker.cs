using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyWrapped.Data;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyWrapped.Tracking;

/// <summary>
/// Listens to playback events and records how long each item was actually played.
/// Play time is accumulated between progress reports while not paused, so seeking,
/// pauses and idle sessions don't inflate the numbers.
/// </summary>
internal sealed class PlaybackTracker : IHostedService
{
    // Clients report progress every ~10s; a longer gap means the client went away.
    private static readonly TimeSpan _maxGap = TimeSpan.FromSeconds(90);
    private static readonly TimeSpan _staleAfter = TimeSpan.FromHours(6);

    private readonly ISessionManager _sessionManager;
    private readonly PlayHistoryStore _store;
    private readonly ILogger<PlaybackTracker> _logger;
    private readonly ConcurrentDictionary<string, ActivePlay> _active = new(StringComparer.Ordinal);

    public PlaybackTracker(ISessionManager sessionManager, PlayHistoryStore store, ILogger<PlaybackTracker> logger)
    {
        _sessionManager = sessionManager;
        _store = store;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _sessionManager.PlaybackStart += OnPlaybackStart;
        _sessionManager.PlaybackProgress += OnPlaybackProgress;
        _sessionManager.PlaybackStopped += OnPlaybackStopped;
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _sessionManager.PlaybackStart -= OnPlaybackStart;
        _sessionManager.PlaybackProgress -= OnPlaybackProgress;
        _sessionManager.PlaybackStopped -= OnPlaybackStopped;

        // Server shutting down: keep what has been played so far.
        foreach (var key in _active.Keys)
        {
            if (_active.TryRemove(key, out var play))
            {
                Finish(play, DateTime.UtcNow);
            }
        }

        return Task.CompletedTask;
    }

    private static string? Key(PlaybackProgressEventArgs e)
        => e.Item is null ? null : $"{e.Session?.Id ?? e.DeviceId}|{e.Item.Id:N}";

    private void OnPlaybackStart(object? sender, PlaybackProgressEventArgs e)
    {
        try
        {
            PruneStale();
            if (Key(e) is { } key && PlayRecordFactory.GetKind(e.Item) is not null && e.Users.Count > 0)
            {
                _active[key] = new ActivePlay(e.Item, e.Users.Select(u => u.Id).ToArray(), e.ClientName, DateTime.UtcNow, e.IsPaused);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error while handling playback start");
        }
    }

    private void OnPlaybackProgress(object? sender, PlaybackProgressEventArgs e)
    {
        try
        {
            if (Key(e) is not { } key)
            {
                return;
            }

            var now = DateTime.UtcNow;
            if (_active.TryGetValue(key, out var play))
            {
                play.Tick(now, e.IsPaused);
            }
            else if (PlayRecordFactory.GetKind(e.Item) is not null && e.Users.Count > 0)
            {
                // Playback started before the plugin was loaded: start counting from now.
                _active[key] = new ActivePlay(e.Item, e.Users.Select(u => u.Id).ToArray(), e.ClientName, now, e.IsPaused);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error while handling playback progress");
        }
    }

    private void OnPlaybackStopped(object? sender, PlaybackStopEventArgs e)
    {
        try
        {
            if (Key(e) is { } key && _active.TryRemove(key, out var play))
            {
                Finish(play, DateTime.UtcNow);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error while handling playback stop");
        }
    }

    private void PruneStale()
    {
        var now = DateTime.UtcNow;
        foreach (var (key, play) in _active)
        {
            if (now - play.LastTickUtc > _staleAfter && _active.TryRemove(key, out _))
            {
                Finish(play, play.LastTickUtc);
            }
        }
    }

    private void Finish(ActivePlay play, DateTime nowUtc)
    {
        var seconds = play.Complete(nowUtc);
        var config = Plugin.Instance?.Configuration;
        var minSeconds = PlayRecordFactory.GetKind(play.Item) == PlayKind.Audio
            ? config?.MinAudioSeconds ?? 30
            : config?.MinVideoSeconds ?? 120;
        if (seconds < minSeconds)
        {
            return;
        }

        var records = new List<PlayRecord>();
        foreach (var userId in play.UserIds)
        {
            var id = $"live:{userId:N}:{play.Item.Id:N}:{play.StartedUtc.Ticks}";
            if (PlayRecordFactory.Create(play.Item, userId, play.StartedUtc, seconds, PlaySource.Live, id, play.ClientName) is { } record)
            {
                records.Add(record);
            }
        }

        _store.Add(records);
        _logger.LogDebug("Recorded {Seconds}s of {Item} for {Count} user(s)", seconds, play.Item.Name, records.Count);
    }

    private sealed class ActivePlay
    {
        private readonly Lock _lock = new();
        private double _seconds;
        private bool _paused;
        private int _ticks;

        public ActivePlay(BaseItem item, Guid[] userIds, string? clientName, DateTime startedUtc, bool paused)
        {
            Item = item;
            UserIds = userIds;
            ClientName = clientName;
            StartedUtc = startedUtc;
            LastTickUtc = startedUtc;
            _paused = paused;
        }

        public BaseItem Item { get; }

        public Guid[] UserIds { get; }

        public string? ClientName { get; }

        public DateTime StartedUtc { get; }

        public DateTime LastTickUtc { get; private set; }

        public void Tick(DateTime nowUtc, bool paused)
        {
            lock (_lock)
            {
                TickCore(nowUtc, paused);
            }
        }

        public int Complete(DateTime nowUtc)
        {
            lock (_lock)
            {
                var runtime = Item.RunTimeTicks is { } ticks && ticks > 0 ? TimeSpan.FromTicks(ticks).TotalSeconds : (double?)null;
                double seconds;
                if (_ticks < 2)
                {
                    // Some clients never report progress: fall back to wall-clock time.
                    seconds = (nowUtc - StartedUtc).TotalSeconds;
                }
                else
                {
                    TickCore(nowUtc, true);
                    seconds = _seconds;
                }

                if (runtime is { } r)
                {
                    seconds = Math.Min(seconds, r * 1.25);
                }

                return (int)Math.Max(0, seconds);
            }
        }

        private void TickCore(DateTime nowUtc, bool paused)
        {
            if (!_paused)
            {
                var gap = nowUtc - LastTickUtc;
                _seconds += (gap < _maxGap ? gap : _maxGap).TotalSeconds;
            }

            LastTickUtc = nowUtc;
            _paused = paused;
            _ticks++;
        }
    }
}
