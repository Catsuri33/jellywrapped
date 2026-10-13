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

/// <summary>
/// Public share links. Each link points to a frozen snapshot of the recap taken when it was
/// created, so the shared page never exposes more than what the user chose to share.
/// </summary>
internal sealed class ShareStore
{
    private readonly string _path;
    private readonly Lock _lock = new();
    private readonly List<ShareEntry> _shares;

    public ShareStore(IApplicationPaths applicationPaths)
    {
        var root = Path.Combine(applicationPaths.DataPath, "jellywrapped");
        Directory.CreateDirectory(root);
        _path = Path.Combine(root, "shares.json");
        _shares = File.Exists(_path)
            ? JsonSerializer.Deserialize<List<ShareEntry>>(File.ReadAllText(_path)) ?? []
            : [];
    }

    public ShareEntry? Get(string token)
    {
        lock (_lock)
        {
            return _shares.FirstOrDefault(s => CryptographicOperations.FixedTimeEquals(
                System.Text.Encoding.UTF8.GetBytes(s.Token),
                System.Text.Encoding.UTF8.GetBytes(token)));
        }
    }

    public List<ShareEntry> ForUser(Guid userId)
    {
        lock (_lock)
        {
            return _shares.Where(s => s.UserId == userId).ToList();
        }
    }

    /// <summary>
    /// Creates the share link for a user's year, or refreshes its snapshot if it already exists.
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="year">The year.</param>
    /// <param name="report">The recap to freeze.</param>
    /// <returns>The share entry.</returns>
    public ShareEntry Upsert(Guid userId, int year, WrappedReport report)
    {
        lock (_lock)
        {
            var entry = _shares.FirstOrDefault(s => s.UserId == userId && s.Year == year);
            if (entry is null)
            {
                entry = new ShareEntry
                {
                    Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(18)).Replace('+', '-').Replace('/', '_'),
                    UserId = userId,
                    Year = year
                };
                _shares.Add(entry);
            }

            entry.CreatedUtc = DateTime.UtcNow;
            entry.Report = report;
            Save();
            return entry;
        }
    }

    public bool Remove(Guid userId, int year)
    {
        lock (_lock)
        {
            var removed = _shares.RemoveAll(s => s.UserId == userId && s.Year == year) > 0;
            if (removed)
            {
                Save();
            }

            return removed;
        }
    }

    private void Save()
    {
        var tmp = _path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(_shares));
        File.Move(tmp, _path, overwrite: true);
    }
}
