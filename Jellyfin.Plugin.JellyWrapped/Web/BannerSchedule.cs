using System;
using Jellyfin.Plugin.JellyWrapped.Configuration;

namespace Jellyfin.Plugin.JellyWrapped.Web;

/// <summary>
/// Decides when the home page banner is shown, and which year's recap it announces.
/// </summary>
internal static class BannerSchedule
{
    /// <summary>
    /// Gets the year whose recap the banner announces today, or null when the banner is hidden.
    /// </summary>
    /// <param name="config">The plugin configuration.</param>
    /// <param name="today">Today's date.</param>
    /// <returns>The year, or null.</returns>
    public static int? GetYear(PluginConfiguration config, DateTime today)
    {
        if (!config.ShowHomeBanner)
        {
            return null;
        }

        var start = Key(config.BannerStartMonth, config.BannerStartDay);
        var end = Key(config.BannerEndMonth, config.BannerEndDay);
        var now = Key(today.Month, today.Day);

        if (start <= end)
        {
            return now >= start && now <= end ? today.Year : null;
        }

        // The period spans New Year: in January, the banner is about the year that just ended.
        if (now >= start)
        {
            return today.Year;
        }

        return now <= end ? today.Year - 1 : null;
    }

    private static int Key(int month, int day) => (Math.Clamp(month, 1, 12) * 100) + Math.Clamp(day, 1, 31);
}
