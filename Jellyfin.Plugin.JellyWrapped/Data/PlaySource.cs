using System;

namespace Jellyfin.Plugin.JellyWrapped.Data;

/// <summary>
/// Where a play record comes from.
/// </summary>
internal enum PlaySource
{
    /// <summary>Recorded live by JellyWrapped.</summary>
    Live,

    /// <summary>Imported from the Playback Reporting plugin.</summary>
    PlaybackReporting,

    /// <summary>Estimated from Jellyfin's "last played" user data. Never persisted.</summary>
    Estimated
}
