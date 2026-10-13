using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyWrapped.Stats;

internal sealed class HabitStats
{
    public int[] MinutesByMonth { get; set; } = new int[12];

    public int[] MinutesByHour { get; set; } = new int[24];

    /// <summary>Gets or sets minutes per weekday, Monday first.</summary>
    public int[] MinutesByWeekday { get; set; } = new int[7];

    /// <summary>Gets or sets the busiest month, 1-12.</summary>
    public int? PeakMonth { get; set; }

    public string? PeakDay { get; set; }

    public int PeakDayMinutes { get; set; }

    public int LongestStreakDays { get; set; }

    public string? LongestStreakStart { get; set; }

    public string? TopClient { get; set; }
}
