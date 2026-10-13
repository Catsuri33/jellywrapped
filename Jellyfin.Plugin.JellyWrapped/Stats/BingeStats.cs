using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyWrapped.Stats;

internal sealed class BingeStats
{
    public string SeriesName { get; set; } = string.Empty;

    public Guid? ImageId { get; set; }

    public int Episodes { get; set; }

    public string Date { get; set; } = string.Empty;
}
