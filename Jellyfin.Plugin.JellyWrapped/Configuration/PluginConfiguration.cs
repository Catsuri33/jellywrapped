using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.JellyWrapped.Configuration;

/// <summary>
/// Plugin configuration.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets the minimum listening time, in seconds, for a track to count as a play.
    /// </summary>
    public int MinAudioSeconds { get; set; } = 30;

    /// <summary>
    /// Gets or sets the minimum watching time, in seconds, for a movie or episode to count as a play.
    /// </summary>
    public int MinVideoSeconds { get; set; } = 120;

    /// <summary>
    /// Gets or sets a value indicating whether movies and episodes marked as played, but not recorded
    /// by JellyWrapped, are added to recaps using their "last played" date.
    /// </summary>
    public bool IncludeEstimatedHistory { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether users can create public share links for their recap.
    /// </summary>
    public bool AllowPublicSharing { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether recaps compare the user with the rest of the server.
    /// </summary>
    public bool ShowServerComparison { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether a "Wrapped" entry is injected in the Jellyfin web
    /// menu. Requires the File Transformation plugin.
    /// </summary>
    public bool InjectWebLink { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether a banner announcing the recap is shown on the home page
    /// during the configured period. Requires the File Transformation plugin.
    /// </summary>
    public bool ShowHomeBanner { get; set; } = true;

    /// <summary>
    /// Gets or sets the month (1-12) the banner starts being shown.
    /// </summary>
    public int BannerStartMonth { get; set; } = 12;

    /// <summary>
    /// Gets or sets the day of month the banner starts being shown.
    /// </summary>
    public int BannerStartDay { get; set; } = 1;

    /// <summary>
    /// Gets or sets the month (1-12) of the last day the banner is shown. When the end is before the start,
    /// the period spans New Year and the banner announces the previous year's recap in January.
    /// </summary>
    public int BannerEndMonth { get; set; } = 1;

    /// <summary>
    /// Gets or sets the day of month of the last day the banner is shown.
    /// </summary>
    public int BannerEndDay { get; set; } = 31;
}
