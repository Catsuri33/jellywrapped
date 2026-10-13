using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Mime;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyWrapped.Data;
using Jellyfin.Plugin.JellyWrapped.Sharing;
using Jellyfin.Plugin.JellyWrapped.Stats;
using Jellyfin.Plugin.JellyWrapped.Tracking;
using Jellyfin.Plugin.JellyWrapped.Web;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.JellyWrapped.Api;

/// <summary>
/// JellyWrapped API and web app.
/// </summary>
[ApiController]
[Route("JellyWrapped")]
public class WrappedController : ControllerBase
{
    private static readonly Dictionary<string, string> _assets = new(StringComparer.Ordinal)
    {
        ["app.js"] = "text/javascript",
        ["app.css"] = "text/css",
        ["inject.js"] = "text/javascript"
    };

    private readonly WrappedService _wrappedService;
    private readonly ShareStore _shareStore;
    private readonly PlayHistoryStore _historyStore;
    private readonly IAuthorizationContext _authorizationContext;
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;

    /// <summary>
    /// Initializes a new instance of the <see cref="WrappedController"/> class.
    /// </summary>
    /// <param name="services">The service provider (the plugin services are internal).</param>
    /// <param name="authorizationContext">The authorization context.</param>
    /// <param name="libraryManager">The library manager.</param>
    /// <param name="userManager">The user manager.</param>
    public WrappedController(IServiceProvider services, IAuthorizationContext authorizationContext, ILibraryManager libraryManager, IUserManager userManager)
    {
        _wrappedService = services.GetRequiredService<WrappedService>();
        _shareStore = services.GetRequiredService<ShareStore>();
        _historyStore = services.GetRequiredService<PlayHistoryStore>();
        _authorizationContext = authorizationContext;
        _libraryManager = libraryManager;
        _userManager = userManager;
    }

    private static bool SharingEnabled => Plugin.Instance?.Configuration.AllowPublicSharing ?? false;

    /// <summary>
    /// Serves the web app.
    /// </summary>
    /// <returns>The app page.</returns>
    [HttpGet("")]
    [HttpGet("App")]
    [AllowAnonymous]
    [ApiExplorerSettings(IgnoreApi = true)]
    public ActionResult GetApp()
    {
        var path = Request.Path.Value ?? string.Empty;
        if (!path.EndsWith("/App/", StringComparison.OrdinalIgnoreCase))
        {
            var root = path.TrimEnd('/');
            if (root.EndsWith("/App", StringComparison.OrdinalIgnoreCase))
            {
                root = root[..^4];
            }

            return Redirect(Request.PathBase + root + "/App/" + Request.QueryString);
        }

        return Asset("app.html", MediaTypeNames.Text.Html);
    }

    /// <summary>
    /// Serves a static file of the web app.
    /// </summary>
    /// <param name="file">The file name.</param>
    /// <returns>The file.</returns>
    [HttpGet("App/{file}")]
    [AllowAnonymous]
    [ApiExplorerSettings(IgnoreApi = true)]
    public ActionResult GetAsset([FromRoute] string file)
        => _assets.TryGetValue(file, out var contentType) ? Asset(file, contentType) : NotFound();

    /// <summary>
    /// Lists the years the current user can see a recap for.
    /// </summary>
    /// <param name="tz">IANA time zone of the viewer.</param>
    /// <returns>The available years and the one to show by default.</returns>
    [HttpGet("Years")]
    [Authorize]
    public async Task<ActionResult> GetYears([FromQuery] string? tz)
    {
        if (await GetUserId().ConfigureAwait(false) is not { } userId)
        {
            return Unauthorized();
        }

        var years = _wrappedService.GetYears(userId, ResolveTimeZone(tz));
        var now = DateTime.UtcNow;

        // In January, last year's recap is the interesting one.
        var defaultYear = now.Month == 1 && years.Contains(now.Year - 1) ? now.Year - 1 : years.FirstOrDefault(now.Year);
        return Ok(new { Years = years, Default = defaultYear, SharingEnabled });
    }

    /// <summary>
    /// Gets the current user's recap.
    /// </summary>
    /// <param name="year">The year.</param>
    /// <param name="tz">IANA time zone of the viewer.</param>
    /// <returns>The recap.</returns>
    [HttpGet("Report/{year:int}")]
    [Authorize]
    public async Task<ActionResult> GetReport([FromRoute] int year, [FromQuery] string? tz)
    {
        if (await GetUserId().ConfigureAwait(false) is not { } userId)
        {
            return Unauthorized();
        }

        var report = _wrappedService.GetReport(userId, year, ResolveTimeZone(tz));
        if (report is null)
        {
            return NotFound();
        }

        var share = _shareStore.ForUser(userId).FirstOrDefault(s => s.Year == year);
        return Ok(new { Report = report, ShareToken = SharingEnabled ? share?.Token : null, SharingEnabled });
    }

    /// <summary>
    /// Creates (or refreshes) a public share link for the current user's recap.
    /// </summary>
    /// <param name="year">The year.</param>
    /// <param name="tz">IANA time zone of the viewer.</param>
    /// <returns>The share token.</returns>
    [HttpPost("Shares/{year:int}")]
    [Authorize]
    public async Task<ActionResult> CreateShare([FromRoute] int year, [FromQuery] string? tz)
    {
        if (!SharingEnabled)
        {
            return Forbid();
        }

        if (await GetUserId().ConfigureAwait(false) is not { } userId)
        {
            return Unauthorized();
        }

        if (_wrappedService.GetReport(userId, year, ResolveTimeZone(tz)) is not { HasData: true } report)
        {
            return NotFound();
        }

        var entry = _shareStore.Upsert(userId, year, report);
        return Ok(new { entry.Token });
    }

    /// <summary>
    /// Deletes the public share link of the current user's recap.
    /// </summary>
    /// <param name="year">The year.</param>
    /// <returns>No content.</returns>
    [HttpDelete("Shares/{year:int}")]
    [Authorize]
    public async Task<ActionResult> DeleteShare([FromRoute] int year)
    {
        if (await GetUserId().ConfigureAwait(false) is not { } userId)
        {
            return Unauthorized();
        }

        _shareStore.Remove(userId, year);
        return NoContent();
    }

    /// <summary>
    /// Gets a shared recap. Does not require authentication.
    /// </summary>
    /// <param name="token">The share token.</param>
    /// <returns>The recap snapshot.</returns>
    [HttpGet("Shared/{token}")]
    [AllowAnonymous]
    public ActionResult GetShared([FromRoute] string token)
    {
        if (!SharingEnabled || _shareStore.Get(token) is not { } entry)
        {
            return NotFound();
        }

        return Ok(new { entry.Report });
    }

    /// <summary>
    /// Tells the injected web script whether to show the home page banner.
    /// </summary>
    /// <returns>The year the banner announces, or null when it is hidden.</returns>
    [HttpGet("Banner")]
    [AllowAnonymous]
    public ActionResult GetBanner()
        => Ok(new { Year = Plugin.Instance is { } plugin ? BannerSchedule.GetYear(plugin.Configuration, DateTime.Now) : null });

    /// <summary>
    /// Lists every user with a summary of their recap for a year (admin dashboard).
    /// </summary>
    /// <param name="year">The year; defaults to the current one.</param>
    /// <param name="tz">IANA time zone of the viewer.</param>
    /// <returns>The years with data and one summary per user.</returns>
    [HttpGet("Admin/Users")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult GetUsersOverview([FromQuery] int? year, [FromQuery] string? tz)
    {
        var timeZone = ResolveTimeZone(tz);
        var selectedYear = year ?? DateTime.Now.Year;
        var years = _historyStore.CountByYear().Keys.Append(DateTime.Now.Year).Distinct().OrderDescending().ToList();
        var users = _userManager.GetUsers()
            .OrderBy(u => u.Username, StringComparer.OrdinalIgnoreCase)
            .Select(u => (User: u, Report: _wrappedService.GetReport(u.Id, selectedYear, timeZone)))
            .Select(x => new
            {
                UserId = x.User.Id,
                UserName = x.User.Username,
                HasData = x.Report?.HasData ?? false,
                x.Report?.ContainsEstimates,
                x.Report?.Totals,
                TopArtist = x.Report?.Music?.TopArtists.FirstOrDefault()?.Name,
                TopTrack = x.Report?.Music?.TopTracks.FirstOrDefault()?.Name,
                TopMovie = x.Report?.Movies?.TopMovies.FirstOrDefault()?.Name,
                TopSeries = x.Report?.Series?.TopSeries.FirstOrDefault()?.Name,
                x.Report?.Persona,
                Shared = _shareStore.ForUser(x.User.Id).Any(s => s.Year == selectedYear)
            })
            .ToList();
        return Ok(new { Year = selectedYear, Years = years, Users = users });
    }

    /// <summary>
    /// Gets any user's recap (admin dashboard).
    /// </summary>
    /// <param name="userId">The user.</param>
    /// <param name="year">The year.</param>
    /// <param name="tz">IANA time zone of the viewer.</param>
    /// <returns>The recap.</returns>
    [HttpGet("Admin/Report/{userId:guid}/{year:int}")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult GetUserReport([FromRoute] Guid userId, [FromRoute] int year, [FromQuery] string? tz)
    {
        var report = _wrappedService.GetReport(userId, year, ResolveTimeZone(tz));
        return report is null ? NotFound() : Ok(new { Report = report });
    }

    /// <summary>
    /// Gets the state of the play history.
    /// </summary>
    /// <returns>The status.</returns>
    [HttpGet("Status")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult GetStatus()
        => Ok(new
        {
            _historyStore.TrackingSinceUtc,
            PlaysByYear = _historyStore.CountByYear(),
            WebLinkInjected = WebInjectionTask.Injected
        });

    /// <summary>
    /// Imports plays recorded by the Playback Reporting plugin before JellyWrapped was installed.
    /// </summary>
    /// <param name="rows">Rows of Playback Reporting's PlaybackActivity table.</param>
    /// <returns>The number of imported and skipped rows.</returns>
    [HttpPost("Import/PlaybackReporting")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult ImportPlaybackReporting([FromBody] IReadOnlyList<PlaybackReportingRow> rows)
    {
        var trackingSince = _historyStore.TrackingSinceUtc;
        var records = new List<PlayRecord>();
        var items = new Dictionary<Guid, BaseItem?>();
        foreach (var row in rows)
        {
            if (!DateTime.TryParse(row.DateCreated, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal | DateTimeStyles.AdjustToUniversal, out var startedUtc)
                || startedUtc >= trackingSince // Already recorded live by JellyWrapped.
                || !Guid.TryParse(row.UserId, out var userId)
                || !Guid.TryParse(row.ItemId, out var itemId)
                || GetItem(itemId) is not { } item)
            {
                continue;
            }

            var id = $"pr:{userId:N}:{itemId:N}:{startedUtc.Ticks}";
            var seconds = (int)Math.Clamp(row.PlayDuration, 0, int.MaxValue);
            if (PlayRecordFactory.Create(item, userId, startedUtc, seconds, PlaySource.PlaybackReporting, id) is { } record)
            {
                records.Add(record);
            }
        }

        var imported = _historyStore.Add(records);
        return Ok(new { Imported = imported, Skipped = rows.Count - imported });

        BaseItem? GetItem(Guid id)
        {
            if (!items.TryGetValue(id, out var item))
            {
                item = _libraryManager.GetItemById(id);
                items[id] = item;
            }

            return item;
        }
    }

    private static TimeZoneInfo ResolveTimeZone(string? tz)
        => !string.IsNullOrEmpty(tz) && TimeZoneInfo.TryFindSystemTimeZoneById(tz, out var zone) ? zone : TimeZoneInfo.Local;

    private async Task<Guid?> GetUserId()
    {
        var info = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        return info.User?.Id ?? (info.UserId == Guid.Empty ? null : info.UserId);
    }

    private FileStreamResult Asset(string name, string contentType)
    {
        var stream = GetType().Assembly.GetManifestResourceStream($"{typeof(Plugin).Namespace}.Web.{name}")
            ?? throw new FileNotFoundException(name);
        Response.Headers.CacheControl = "no-cache";
        return File(stream, contentType + "; charset=utf-8");
    }
}
