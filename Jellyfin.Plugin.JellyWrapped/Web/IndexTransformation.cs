using System;

namespace Jellyfin.Plugin.JellyWrapped.Web;

/// <summary>
/// Transformation applied to the web client's index.html by the File Transformation plugin.
/// </summary>
public static class IndexTransformation
{
    private const string Script = "<script src=\"../JellyWrapped/App/inject.js\" defer></script>";

    /// <summary>
    /// Adds the JellyWrapped script to index.html.
    /// </summary>
    /// <param name="payload">The file being served.</param>
    /// <returns>The transformed file.</returns>
    public static string Transform(IndexTransformationPayload payload)
    {
        var contents = payload.Contents;
        if (contents.Contains(Script, StringComparison.Ordinal))
        {
            return contents;
        }

        var index = contents.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        return index < 0 ? contents + Script : contents.Insert(index, Script);
    }
}
