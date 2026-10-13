using System;
using System.Collections.Generic;
using System.Globalization;
using Jellyfin.Plugin.JellyWrapped.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.JellyWrapped;

/// <summary>
/// The main plugin.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Instance of the <see cref="IApplicationPaths"/> interface.</param>
    /// <param name="xmlSerializer">Instance of the <see cref="IXmlSerializer"/> interface.</param>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    /// <inheritdoc />
    public override string Name => "JellyWrapped";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("8f868969-3282-4493-878a-3e89e2f79d3a");

    /// <inheritdoc />
    public override string Description => "Un récapitulatif annuel façon « Wrapped » de vos musiques, films et séries.";

    /// <summary>
    /// Gets the current plugin instance.
    /// </summary>
    public static Plugin? Instance { get; private set; }

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        return
        [
            new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = string.Format(CultureInfo.InvariantCulture, "{0}.Configuration.configPage.html", GetType().Namespace)
            },
            new PluginPageInfo
            {
                Name = "JellyWrappedUsers",
                DisplayName = "Wrapped des utilisateurs",
                EmbeddedResourcePath = string.Format(CultureInfo.InvariantCulture, "{0}.Configuration.usersPage.html", GetType().Namespace),
                EnableInMainMenu = true,
                MenuIcon = "auto_awesome"
            }
        ];
    }
}
