using System;

namespace Jellyfin.Plugin.JellyWrapped.Data;

/// <summary>
/// A single play of an item by a user. Metadata is snapshotted at record time so that
/// statistics survive the item being removed from the library.
/// </summary>
internal sealed class PlayRecord
{
    public string Id { get; set; } = string.Empty;

    public Guid UserId { get; set; }

    public Guid ItemId { get; set; }

    public PlayKind Kind { get; set; }

    public PlaySource Source { get; set; }

    public DateTime StartedUtc { get; set; }

    public int Seconds { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Gets or sets the album (audio) or series (episode) id.</summary>
    public Guid? ParentId { get; set; }

    /// <summary>Gets or sets the album (audio) or series (episode) name.</summary>
    public string? ParentName { get; set; }

    public string[] Artists { get; set; } = [];

    public string[] Genres { get; set; } = [];

    public int? RuntimeSeconds { get; set; }

    public int? ProductionYear { get; set; }

    public string? ClientName { get; set; }
}
