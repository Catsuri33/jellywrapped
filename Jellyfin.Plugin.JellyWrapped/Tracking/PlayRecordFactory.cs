using System;
using System.Linq;
using Jellyfin.Plugin.JellyWrapped.Data;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using AudioItem = MediaBrowser.Controller.Entities.Audio.Audio;

namespace Jellyfin.Plugin.JellyWrapped.Tracking;

/// <summary>
/// Builds <see cref="PlayRecord"/>s from library items.
/// </summary>
internal static class PlayRecordFactory
{
    public static PlayKind? GetKind(BaseItem item) => item switch
    {
        AudioItem => PlayKind.Audio,
        Movie => PlayKind.Movie,
        Episode => PlayKind.Episode,
        _ => null
    };

    public static PlayRecord? Create(BaseItem item, Guid userId, DateTime startedUtc, int seconds, PlaySource source, string id, string? clientName = null)
    {
        if (GetKind(item) is not { } kind)
        {
            return null;
        }

        var record = new PlayRecord
        {
            Id = id,
            UserId = userId,
            ItemId = item.Id,
            Kind = kind,
            Source = source,
            StartedUtc = startedUtc,
            Seconds = seconds,
            Name = item.Name ?? string.Empty,
            Genres = item.Genres ?? [],
            RuntimeSeconds = item.RunTimeTicks is { } ticks ? (int)TimeSpan.FromTicks(ticks).TotalSeconds : null,
            ProductionYear = item.ProductionYear,
            ClientName = clientName
        };

        switch (item)
        {
            case AudioItem audio:
                record.Artists = (audio.Artists.Count > 0 ? audio.Artists : audio.AlbumArtists).ToArray();
                record.ParentName = audio.Album;
                record.ParentId = audio.AlbumEntity?.Id;
                break;
            case Episode episode:
                record.ParentId = episode.SeriesId == Guid.Empty ? null : episode.SeriesId;
                record.ParentName = episode.SeriesName;
                if (record.Genres.Length == 0 && episode.Series is { } series)
                {
                    record.Genres = series.Genres ?? [];
                }

                break;
        }

        return record;
    }
}
