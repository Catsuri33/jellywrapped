using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyWrapped.Stats;

internal sealed class SeriesStats
{
    public int Minutes { get; set; }

    public int Episodes { get; set; }

    public int DistinctSeries { get; set; }

    public List<RankedEntry> TopSeries { get; set; } = [];

    public List<RankedEntry> TopGenres { get; set; } = [];

    public BingeStats? Binge { get; set; }
}
