using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyWrapped.Data;

/// <summary>
/// Append-only play history, stored as one JSON Lines file per (UTC) year.
/// </summary>
internal sealed class PlayHistoryStore
{
    private readonly string _historyDir;
    private readonly string _statePath;
    private readonly ILogger<PlayHistoryStore> _logger;
    private readonly Lock _lock = new();
    private readonly Dictionary<int, List<PlayRecord>> _years = [];
    private readonly Dictionary<int, HashSet<string>> _ids = [];
    private readonly StoreState _state;

    public PlayHistoryStore(IApplicationPaths applicationPaths, ILogger<PlayHistoryStore> logger)
    {
        _logger = logger;
        var root = Path.Combine(applicationPaths.DataPath, "jellywrapped");
        _historyDir = Path.Combine(root, "history");
        _statePath = Path.Combine(root, "state.json");
        Directory.CreateDirectory(_historyDir);

        _state = ReadJson<StoreState>(_statePath) ?? new StoreState { TrackingSinceUtc = DateTime.UtcNow };
        WriteJson(_statePath, _state);
    }

    /// <summary>
    /// Gets the moment JellyWrapped started recording plays on this server.
    /// </summary>
    public DateTime TrackingSinceUtc => _state.TrackingSinceUtc;

    /// <summary>
    /// Gets a counter incremented on every write, usable as a cache key.
    /// </summary>
    public long Version { get; private set; }

    public int Add(IEnumerable<PlayRecord> records)
    {
        var added = 0;
        lock (_lock)
        {
            foreach (var group in records.GroupBy(r => r.StartedUtc.Year))
            {
                var list = LoadYear(group.Key);
                var ids = _ids[group.Key];
                var lines = new List<string>();
                foreach (var record in group)
                {
                    if (ids.Add(record.Id))
                    {
                        list.Add(record);
                        lines.Add(JsonSerializer.Serialize(record));
                    }
                }

                if (lines.Count > 0)
                {
                    File.AppendAllLines(YearPath(group.Key), lines);
                    added += lines.Count;
                }
            }

            if (added > 0)
            {
                Version++;
            }
        }

        return added;
    }

    /// <summary>
    /// Returns the plays whose UTC start falls in one of the given years.
    /// </summary>
    /// <param name="years">The UTC years.</param>
    /// <returns>A copy of the matching plays.</returns>
    public List<PlayRecord> GetYears(params int[] years)
    {
        lock (_lock)
        {
            return years.SelectMany(LoadYear).ToList();
        }
    }

    public SortedDictionary<int, int> CountByYear()
    {
        var result = new SortedDictionary<int, int>();
        lock (_lock)
        {
            foreach (var year in ListYearFiles())
            {
                result[year] = LoadYear(year).Count;
            }
        }

        return result;
    }

    private IEnumerable<int> ListYearFiles()
    {
        foreach (var file in Directory.EnumerateFiles(_historyDir, "*.jsonl"))
        {
            if (int.TryParse(Path.GetFileNameWithoutExtension(file), NumberStyles.None, CultureInfo.InvariantCulture, out var year))
            {
                yield return year;
            }
        }
    }

    private string YearPath(int year) => Path.Combine(_historyDir, year.ToString(CultureInfo.InvariantCulture) + ".jsonl");

    private List<PlayRecord> LoadYear(int year)
    {
        if (_years.TryGetValue(year, out var cached))
        {
            return cached;
        }

        var list = new List<PlayRecord>();
        var path = YearPath(year);
        if (File.Exists(path))
        {
            foreach (var line in File.ReadLines(path))
            {
                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                try
                {
                    if (JsonSerializer.Deserialize<PlayRecord>(line) is { } record)
                    {
                        list.Add(record);
                    }
                }
                catch (JsonException ex)
                {
                    _logger.LogWarning(ex, "Ignoring corrupted line in {Path}", path);
                }
            }
        }

        _years[year] = list;
        _ids[year] = list.Select(r => r.Id).ToHashSet(StringComparer.Ordinal);
        return list;
    }

    private T? ReadJson<T>(string path)
    {
        try
        {
            return File.Exists(path) ? JsonSerializer.Deserialize<T>(File.ReadAllText(path)) : default;
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Could not read {Path}", path);
            return default;
        }
    }

    private static void WriteJson<T>(string path, T value) => File.WriteAllText(path, JsonSerializer.Serialize(value));

    private sealed class StoreState
    {
        public DateTime TrackingSinceUtc { get; set; }
    }
}
