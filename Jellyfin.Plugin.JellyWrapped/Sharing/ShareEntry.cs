using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using Jellyfin.Plugin.JellyWrapped.Stats;
using MediaBrowser.Common.Configuration;

namespace Jellyfin.Plugin.JellyWrapped.Sharing;

internal sealed class ShareEntry
{
    public string Token { get; set; } = string.Empty;

    public Guid UserId { get; set; }

    public int Year { get; set; }

    public DateTime CreatedUtc { get; set; }

    public WrappedReport Report { get; set; } = new();
}
