using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.JellyWrapped.Data;
using Jellyfin.Plugin.JellyWrapped.Tracking;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;

namespace Jellyfin.Plugin.JellyWrapped.Stats;

/// <summary>
/// Computes <see cref="WrappedReport"/>s from the play history.
/// </summary>
internal sealed class WrappedService
{
    private const int TopCount = 5;
    private static readonly TimeSpan _cacheDuration = TimeSpan.FromMinutes(10);

    private readonly PlayHistoryStore _store;
    private readonly IUserManager _userManager;
    private readonly ILibraryManager _libraryManager;
    private readonly IUserDataManager _userDataManager;
    private readonly ConcurrentDictionary<string, (long Version, DateTime At, WrappedReport Report)> _cache = new(StringComparer.Ordinal);

    public WrappedService(PlayHistoryStore store, IUserManager userManager, ILibraryManager libraryManager, IUserDataManager userDataManager)
    {
        _store = store;
        _userManager = userManager;
        _libraryManager = libraryManager;
        _userDataManager = userDataManager;

        // "Marked as played" changes feed the estimated history: drop that user's cached recaps.
        _userDataManager.UserDataSaved += (_, e) =>
        {
            var prefix = e.UserId.ToString("N") + "|";
            foreach (var key in _cache.Keys.Where(k => k.StartsWith(prefix, StringComparison.Ordinal)))
            {
                _cache.TryRemove(key, out var _);
            }
        };
    }

    /// <summary>
    /// Returns the years for which the user has recorded plays, most recent first.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="timeZone">The viewer's time zone.</param>
    /// <returns>The years.</returns>
    public List<int> GetYears(Guid userId, TimeZoneInfo timeZone)
    {
        var years = _store.CountByYear().Keys.ToArray();
        var result = _store.GetYears(years)
            .Where(r => r.UserId == userId)
            .Select(r => ToLocal(r.StartedUtc, timeZone).Year)
            .ToHashSet();

        // Movies/episodes marked as played can still produce an estimated recap for the current year.
        result.Add(DateTime.UtcNow.Year);
        return result.OrderDescending().ToList();
    }

    public WrappedReport? GetReport(Guid userId, int year, TimeZoneInfo timeZone)
    {
        var key = string.Create(CultureInfo.InvariantCulture, $"{userId:N}|{year}|{timeZone.Id}");
        if (_cache.TryGetValue(key, out var cached) && cached.Version == _store.Version && DateTime.UtcNow - cached.At < _cacheDuration)
        {
            return cached.Report;
        }

        var version = _store.Version;
        var report = Build(userId, year, timeZone);
        if (report is not null)
        {
            _cache[key] = (version, DateTime.UtcNow, report);
        }

        return report;
    }

    private static DateTime ToLocal(DateTime utc, TimeZoneInfo timeZone)
        => TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), timeZone);

    private static int Minutes(IEnumerable<Play> plays) => (int)Math.Round(plays.Sum(p => p.Record.Seconds) / 60.0);

    private static string Day(DateTime date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static List<RankedEntry> Rank(IEnumerable<Play> plays, Func<Play, string?> keySelector, Func<IGrouping<string, Play>, RankedEntry> build, bool byPlays = false)
    {
        var entries = plays
            .Where(p => keySelector(p) is not null)
            .GroupBy(p => keySelector(p)!)
            .Select(build);
        return (byPlays
                ? entries.OrderByDescending(e => e.Plays).ThenByDescending(e => e.Minutes)
                : entries.OrderByDescending(e => e.Minutes).ThenByDescending(e => e.Plays))
            .Take(TopCount)
            .ToList();
    }

    private static List<RankedEntry> RankGenres(IEnumerable<Play> plays)
        => Rank(
            plays.SelectMany(p => p.Record.Genres.Select(g => (Genre: g, Play: p))).Select(x => x.Play with { Tag = x.Genre }),
            p => p.Tag,
            g => new RankedEntry { Name = g.Key, Minutes = Minutes(g), Plays = g.Count() });

    private WrappedReport? Build(Guid userId, int year, TimeZoneInfo timeZone)
    {
        if (_userManager.GetUserById(userId) is not { } user)
        {
            return null;
        }

        var config = Plugin.Instance?.Configuration;

        // UTC years overlapping the local year, then filter on the local date.
        var all = _store.GetYears(year - 1, year, year + 1)
            .Select(r => new Play(r, ToLocal(r.StartedUtc, timeZone)))
            .Where(p => p.Local.Year == year)
            .ToList();
        var plays = all.Where(p => p.Record.UserId == userId).ToList();

        if (config?.IncludeEstimatedHistory ?? true)
        {
            plays.AddRange(Estimate(user, year, timeZone, plays));
        }

        plays.Sort((a, b) => a.Local.CompareTo(b.Local));

        var report = new WrappedReport
        {
            Year = year,
            UserName = user.Username,
            GeneratedUtc = DateTime.UtcNow,
            HasData = plays.Count > 0,
            ContainsEstimates = plays.Any(p => p.Record.Source == PlaySource.Estimated),
            TrackingSinceUtc = _store.TrackingSinceUtc
        };
        if (plays.Count == 0)
        {
            return report;
        }

        var music = plays.Where(p => p.Record.Kind == PlayKind.Audio).ToList();
        var movies = plays.Where(p => p.Record.Kind == PlayKind.Movie).ToList();
        var episodes = plays.Where(p => p.Record.Kind == PlayKind.Episode).ToList();

        report.Totals = new TotalStats
        {
            Minutes = Minutes(plays),
            Plays = plays.Count,
            DistinctItems = plays.Select(p => p.Record.ItemId).Distinct().Count(),
            ActiveDays = plays.Select(p => p.Local.Date).Distinct().Count(),
            MusicMinutes = Minutes(music),
            MovieMinutes = Minutes(movies),
            SeriesMinutes = Minutes(episodes)
        };
        report.Music = music.Count > 0 ? BuildMusic(music) : null;
        report.Movies = movies.Count > 0 ? BuildMovies(movies) : null;
        report.Series = episodes.Count > 0 ? BuildSeries(episodes) : null;
        report.Habits = BuildHabits(plays);
        report.Persona = PickPersona(report);

        if (config?.ShowServerComparison ?? true)
        {
            report.Server = BuildServer(all, userId);
        }

        return report;
    }

    /// <summary>
    /// Movies and episodes marked as played this year that JellyWrapped never saw being played
    /// (e.g. watched before the plugin was installed): count them once, at their full runtime.
    /// </summary>
    private IEnumerable<Play> Estimate(Jellyfin.Database.Implementations.Entities.User user, int year, TimeZoneInfo timeZone, List<Play> known)
    {
        var knownItems = known.Select(p => p.Record.ItemId).ToHashSet();
        var items = _libraryManager.GetItemList(new InternalItemsQuery(user)
        {
            IncludeItemTypes = [BaseItemKind.Movie, BaseItemKind.Episode],
            Recursive = true,
            IsPlayed = true
        });
        if (items.Count == 0)
        {
            yield break;
        }

        var userData = _userDataManager.GetUserDataBatch(items, user);
        foreach (var item in items)
        {
            if (knownItems.Contains(item.Id)
                || !userData.TryGetValue(item.Id, out var data)
                || data.LastPlayedDate is not { } lastPlayed)
            {
                continue;
            }

            var local = ToLocal(lastPlayed, timeZone);
            if (local.Year != year || item.RunTimeTicks is not { } ticks || ticks <= 0)
            {
                continue;
            }

            var seconds = (int)TimeSpan.FromTicks(ticks).TotalSeconds;
            if (PlayRecordFactory.Create(item, user.Id, lastPlayed, seconds, PlaySource.Estimated, "estimated:" + item.Id.ToString("N")) is { } record)
            {
                yield return new Play(record, local);
            }
        }
    }

    private MusicStats BuildMusic(List<Play> music)
    {
        var first = music[0].Record;
        return new MusicStats
        {
            Minutes = Minutes(music),
            Plays = music.Count,
            DistinctTracks = music.Select(p => p.Record.ItemId).Distinct().Count(),
            DistinctArtists = music.SelectMany(p => p.Record.Artists).Distinct(StringComparer.OrdinalIgnoreCase).Count(),
            TopTracks = Rank(
                music,
                p => p.Record.ItemId.ToString("N"),
                g => new RankedEntry
                {
                    Name = g.First().Record.Name,
                    Subtitle = string.Join(", ", g.First().Record.Artists),
                    ImageId = g.First().Record.ParentId ?? g.First().Record.ItemId,
                    Minutes = Minutes(g),
                    Plays = g.Count()
                },
                byPlays: true),
            TopArtists = Rank(
                    music.SelectMany(p => p.Record.Artists.Select(a => p with { Tag = a })),
                    p => p.Tag,
                    g => new RankedEntry { Name = g.Key, Minutes = Minutes(g), Plays = g.Count() })
                .Select(e =>
                {
                    e.ImageId = FindItemId(BaseItemKind.MusicArtist, e.Name);
                    return e;
                })
                .ToList(),
            TopAlbums = Rank(
                music.Where(p => !string.IsNullOrEmpty(p.Record.ParentName)),
                p => p.Record.ParentId?.ToString("N") ?? p.Record.ParentName,
                g => new RankedEntry
                {
                    Name = g.First().Record.ParentName!,
                    Subtitle = g.SelectMany(p => p.Record.Artists).GroupBy(a => a, StringComparer.OrdinalIgnoreCase).MaxBy(a => a.Count())?.Key,
                    ImageId = g.First().Record.ParentId ?? g.First().Record.ItemId,
                    Minutes = Minutes(g),
                    Plays = g.Count()
                }),
            TopGenres = RankGenres(music),
            FirstTrack = new RankedEntry
            {
                Name = first.Name,
                Subtitle = music[0].Local.ToString("O", CultureInfo.InvariantCulture),
                ImageId = first.ParentId ?? first.ItemId
            }
        };
    }

    private MovieStats BuildMovies(List<Play> movies)
    {
        var stats = new MovieStats
        {
            Minutes = Minutes(movies),
            Plays = movies.Count,
            DistinctMovies = movies.Select(p => p.Record.ItemId).Distinct().Count(),
            TopMovies = Rank(
                movies,
                p => p.Record.ItemId.ToString("N"),
                g => new RankedEntry
                {
                    Name = g.First().Record.Name,
                    Subtitle = g.First().Record.ProductionYear?.ToString(CultureInfo.InvariantCulture),
                    ImageId = g.First().Record.ItemId,
                    Minutes = Minutes(g),
                    Plays = g.Count()
                }),
            TopGenres = RankGenres(movies),
            FavoriteDecade = movies
                .Where(p => p.Record.ProductionYear is not null)
                .GroupBy(p => p.Record.ProductionYear!.Value / 10 * 10)
                .MaxBy(g => g.Sum(p => p.Record.Seconds))?.Key
        };

        var longest = movies.Where(p => p.Record.RuntimeSeconds is not null).MaxBy(p => p.Record.RuntimeSeconds)?.Record;
        if (longest is not null)
        {
            stats.Longest = new RankedEntry { Name = longest.Name, ImageId = longest.ItemId, Minutes = longest.RuntimeSeconds!.Value / 60 };
        }

        // Actors: rank by number of distinct movies seen, then by time spent with them.
        var minutesByMovie = movies.GroupBy(p => p.Record.ItemId).ToDictionary(g => g.Key, g => Minutes(g));
        var people = _libraryManager.GetPeopleByItems(minutesByMovie.Keys.ToList());
        stats.TopActors = people
            .SelectMany(kv => kv.Value.Where(p => p.Type == PersonKind.Actor).Select(person => (Movie: kv.Key, Person: person)))
            .GroupBy(x => x.Person.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g => new RankedEntry
            {
                Name = g.First().Person.Name,
                ImageId = g.First().Person.Id == Guid.Empty ? null : g.First().Person.Id,
                Plays = g.Select(x => x.Movie).Distinct().Count(),
                Minutes = g.Select(x => x.Movie).Distinct().Sum(m => minutesByMovie[m])
            })
            .OrderByDescending(e => e.Plays)
            .ThenByDescending(e => e.Minutes)
            .Take(TopCount)
            .ToList();

        return stats;
    }

    private static SeriesStats BuildSeries(List<Play> episodes)
    {
        var stats = new SeriesStats
        {
            Minutes = Minutes(episodes),
            Episodes = episodes.Count,
            DistinctSeries = episodes.Select(p => p.Record.ParentName).Distinct(StringComparer.OrdinalIgnoreCase).Count(),
            TopSeries = Rank(
                episodes,
                p => p.Record.ParentId?.ToString("N") ?? p.Record.ParentName,
                g => new RankedEntry
                {
                    Name = g.First().Record.ParentName ?? g.First().Record.Name,
                    ImageId = g.First().Record.ParentId,
                    Minutes = Minutes(g),
                    Plays = g.Select(p => p.Record.ItemId).Distinct().Count()
                }),
            TopGenres = RankGenres(episodes)
        };

        var binge = episodes
            .Where(p => p.Record.ParentName is not null)
            .GroupBy(p => (Series: p.Record.ParentName!, Day: p.Local.Date))
            .MaxBy(g => g.Select(p => p.Record.ItemId).Distinct().Count());
        if (binge is not null)
        {
            stats.Binge = new BingeStats
            {
                SeriesName = binge.Key.Series,
                ImageId = binge.First().Record.ParentId,
                Episodes = binge.Select(p => p.Record.ItemId).Distinct().Count(),
                Date = Day(binge.Key.Day)
            };
        }

        return stats;
    }

    private static HabitStats BuildHabits(List<Play> plays)
    {
        var habits = new HabitStats();
        var secondsByMonth = new double[12];
        var secondsByHour = new double[24];
        var secondsByWeekday = new double[7];
        foreach (var play in plays)
        {
            secondsByMonth[play.Local.Month - 1] += play.Record.Seconds;
            secondsByHour[play.Local.Hour] += play.Record.Seconds;
            secondsByWeekday[((int)play.Local.DayOfWeek + 6) % 7] += play.Record.Seconds;
        }

        habits.MinutesByMonth = secondsByMonth.Select(s => (int)Math.Round(s / 60)).ToArray();
        habits.MinutesByHour = secondsByHour.Select(s => (int)Math.Round(s / 60)).ToArray();
        habits.MinutesByWeekday = secondsByWeekday.Select(s => (int)Math.Round(s / 60)).ToArray();
        habits.PeakMonth = Array.IndexOf(secondsByMonth, secondsByMonth.Max()) + 1;

        var peakDay = plays.GroupBy(p => p.Local.Date).MaxBy(g => g.Sum(p => p.Record.Seconds))!;
        habits.PeakDay = Day(peakDay.Key);
        habits.PeakDayMinutes = Minutes(peakDay);

        var days = plays.Select(p => p.Local.Date).Distinct().Order().ToList();
        var streakStart = days[0];
        var bestStart = days[0];
        var best = 1;
        for (var i = 1; i < days.Count; i++)
        {
            if (days[i] != days[i - 1].AddDays(1))
            {
                streakStart = days[i];
            }

            var length = (int)(days[i] - streakStart).TotalDays + 1;
            if (length > best)
            {
                best = length;
                bestStart = streakStart;
            }
        }

        habits.LongestStreakDays = best;
        habits.LongestStreakStart = Day(bestStart);
        habits.TopClient = plays
            .Where(p => !string.IsNullOrEmpty(p.Record.ClientName))
            .GroupBy(p => p.Record.ClientName!, StringComparer.OrdinalIgnoreCase)
            .MaxBy(g => g.Sum(p => p.Record.Seconds))?.Key;
        return habits;
    }

    private static string PickPersona(WrappedReport report)
    {
        var totals = report.Totals;
        double total = Math.Max(1, totals.Minutes);
        var hours = report.Habits.MinutesByHour;
        var night = hours[22] + hours[23] + hours[0] + hours[1] + hours[2] + hours[3] + hours[4];
        var morning = hours[5] + hours[6] + hours[7] + hours[8];
        var weekend = report.Habits.MinutesByWeekday[5] + report.Habits.MinutesByWeekday[6];

        if (report.Series?.Binge?.Episodes >= 6 && totals.SeriesMinutes / total > 0.4)
        {
            return "binge-watcher";
        }

        if (night / total > 0.35)
        {
            return "night-owl";
        }

        if (morning / total > 0.25)
        {
            return "early-bird";
        }

        if (totals.MusicMinutes / total > 0.6)
        {
            return report.Music!.DistinctArtists >= 100 ? "explorer" : "music-lover";
        }

        if (totals.MovieMinutes / total > 0.5)
        {
            return "cinephile";
        }

        if (totals.SeriesMinutes / total > 0.5)
        {
            return "series-addict";
        }

        if (weekend / total > 0.55)
        {
            return "weekend-warrior";
        }

        return "eclectic";
    }

    private static ServerStats? BuildServer(List<Play> all, Guid userId)
    {
        var totals = all
            .GroupBy(p => p.Record.UserId)
            .Select(g => (User: g.Key, Seconds: g.Sum(p => (long)p.Record.Seconds)))
            .OrderByDescending(x => x.Seconds)
            .ToList();
        var index = totals.FindIndex(x => x.User == userId);
        if (totals.Count < 3 || index < 0)
        {
            return null;
        }

        return new ServerStats
        {
            Users = totals.Count,
            Rank = index + 1,
            TopPercent = (int)Math.Ceiling(100.0 * (index + 1) / totals.Count)
        };
    }

    private Guid? FindItemId(BaseItemKind kind, string name)
    {
        var items = _libraryManager.GetItemList(new InternalItemsQuery
        {
            IncludeItemTypes = [kind],
            Name = name,
            Limit = 1
        });
        return items.Count > 0 ? items[0].Id : null;
    }

    private sealed record Play(PlayRecord Record, DateTime Local, string? Tag = null);
}
