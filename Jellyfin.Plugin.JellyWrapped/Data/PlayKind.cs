using System;

namespace Jellyfin.Plugin.JellyWrapped.Data;

/// <summary>
/// Kind of media a play refers to.
/// </summary>
internal enum PlayKind
{
    Audio,
    Movie,
    Episode
}
