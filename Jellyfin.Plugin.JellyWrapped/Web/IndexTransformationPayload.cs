using System;

namespace Jellyfin.Plugin.JellyWrapped.Web;

/// <summary>
/// Payload sent by the File Transformation plugin.
/// </summary>
public class IndexTransformationPayload
{
    /// <summary>
    /// Gets or sets the file contents.
    /// </summary>
    public string Contents { get; set; } = string.Empty;
}
