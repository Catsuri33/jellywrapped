using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyWrapped.Stats;

internal sealed class MusicStats
{
    public int Minutes { get; set; }

    public int Plays { get; set; }

    public int DistinctTracks { get; set; }

    public int DistinctArtists { get; set; }

    public List<RankedEntry> TopTracks { get; set; } = [];

    public List<RankedEntry> TopArtists { get; set; } = [];

    public List<RankedEntry> TopAlbums { get; set; } = [];

    public List<RankedEntry> TopGenres { get; set; } = [];

    public RankedEntry? FirstTrack { get; set; }
}
