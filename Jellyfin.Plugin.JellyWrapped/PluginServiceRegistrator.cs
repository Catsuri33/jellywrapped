using Jellyfin.Plugin.JellyWrapped.Data;
using Jellyfin.Plugin.JellyWrapped.Sharing;
using Jellyfin.Plugin.JellyWrapped.Stats;
using Jellyfin.Plugin.JellyWrapped.Tracking;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.JellyWrapped;

/// <summary>
/// Registers the plugin's services.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<PlayHistoryStore>();
        serviceCollection.AddSingleton<ShareStore>();
        serviceCollection.AddSingleton<WrappedService>();
        serviceCollection.AddHostedService<PlaybackTracker>();
    }
}
