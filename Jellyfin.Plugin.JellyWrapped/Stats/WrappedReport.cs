using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyWrapped.Stats;

/// <summary>
/// A user's recap for one year. Serialized as-is to the web app and into share snapshots.
/// </summary>
internal sealed class WrappedReport
{
    public int Year { get; set; }

    public string UserName { get; set; } = string.Empty;

    public DateTime GeneratedUtc { get; set; }

    public bool HasData { get; set; }

    /// <summary>Gets or sets a value indicating whether some plays were estimated from "last played" dates.</summary>
    public bool ContainsEstimates { get; set; }

    public DateTime TrackingSinceUtc { get; set; }

    public TotalStats Totals { get; set; } = new();

    public MusicStats? Music { get; set; }

    public MovieStats? Movies { get; set; }

    public SeriesStats? Series { get; set; }

    public HabitStats Habits { get; set; } = new();

    public ServerStats? Server { get; set; }

    /// <summary>Gets or sets the persona key, translated by the web app.</summary>
    public string Persona { get; set; } = "eclectic";
}
