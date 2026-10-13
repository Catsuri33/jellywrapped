using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyWrapped.Stats;

internal sealed class MovieStats
{
    public int Minutes { get; set; }

    public int Plays { get; set; }

    public int DistinctMovies { get; set; }

    public List<RankedEntry> TopMovies { get; set; } = [];

    public List<RankedEntry> TopGenres { get; set; } = [];

    public List<RankedEntry> TopActors { get; set; } = [];

    /// <summary>Gets or sets the decade the user watched the most, e.g. 1990.</summary>
    public int? FavoriteDecade { get; set; }

    public RankedEntry? Longest { get; set; }
}
