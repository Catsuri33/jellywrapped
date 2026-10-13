namespace Jellyfin.Plugin.JellyWrapped.Api;

/// <summary>
/// A row of the Playback Reporting plugin's <c>PlaybackActivity</c> table.
/// </summary>
public class PlaybackReportingRow
{
    /// <summary>
    /// Gets or sets the play date, in the server's local time.
    /// </summary>
    public string DateCreated { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the user id.
    /// </summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the item id.
    /// </summary>
    public string ItemId { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the play duration, in seconds.
    /// </summary>
    public long PlayDuration { get; set; }
}
