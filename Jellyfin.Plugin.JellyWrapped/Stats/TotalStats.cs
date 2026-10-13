using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyWrapped.Stats;

internal sealed class TotalStats
{
    public int Minutes { get; set; }

    public int Plays { get; set; }

    public int DistinctItems { get; set; }

    public int ActiveDays { get; set; }

    public int MusicMinutes { get; set; }

    public int MovieMinutes { get; set; }

    public int SeriesMinutes { get; set; }
}
