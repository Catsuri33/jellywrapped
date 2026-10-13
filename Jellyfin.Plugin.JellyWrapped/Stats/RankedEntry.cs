using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyWrapped.Stats;

/// <summary>
/// An entry in a top list (track, artist, movie, genre...).
/// </summary>
internal sealed class RankedEntry
{
    public string Name { get; set; } = string.Empty;

    public string? Subtitle { get; set; }

    /// <summary>Gets or sets the id of the item whose primary image illustrates this entry.</summary>
    public Guid? ImageId { get; set; }

    public int Minutes { get; set; }

    public int Plays { get; set; }
}
