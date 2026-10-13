using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyWrapped.Stats;

internal sealed class ServerStats
{
    public int Users { get; set; }

    public int Rank { get; set; }

    /// <summary>Gets or sets the "top X%" figure (1-100).</summary>
    public int TopPercent { get; set; }
}
