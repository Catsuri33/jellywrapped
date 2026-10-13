using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.Loader;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyWrapped.Web;

/// <summary>
/// At startup, asks the File Transformation plugin (if installed) to add JellyWrapped's
/// script to the Jellyfin web client, which adds a "Wrapped" entry to the menu.
/// </summary>
public class WebInjectionTask : IScheduledTask, IConfigurableScheduledTask
{
    private static readonly Guid _transformationId = Guid.Parse("5b0c5e2e-6f3a-4f43-9d39-2c5f0e8f1a77");

    private readonly ILogger<WebInjectionTask> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="WebInjectionTask"/> class.
    /// </summary>
    /// <param name="logger">The logger.</param>
    public WebInjectionTask(ILogger<WebInjectionTask> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Gets a value indicating whether the script was registered with File Transformation.
    /// </summary>
    public static bool Injected { get; private set; }

    /// <inheritdoc />
    public string Name => "JellyWrapped web integration";

    /// <inheritdoc />
    public string Key => "JellyWrappedWebInjection";

    /// <inheritdoc />
    public string Description => "Adds the JellyWrapped link to the web client using the File Transformation plugin.";

    /// <inheritdoc />
    public string Category => "JellyWrapped";

    /// <inheritdoc />
    public bool IsHidden => true;

    /// <inheritdoc />
    public bool IsEnabled => true;

    /// <inheritdoc />
    public bool IsLogged => false;

    /// <inheritdoc />
    public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
        => [new TaskTriggerInfo { Type = TaskTriggerInfoType.StartupTrigger }];

    /// <inheritdoc />
    public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
    {
        if (!(Plugin.Instance?.Configuration.InjectWebLink ?? true))
        {
            return Task.CompletedTask;
        }

        try
        {
            // File Transformation lives in another load context: it can only be reached by reflection.
            var assembly = AssemblyLoadContext.All
                .SelectMany(context => context.Assemblies)
                .FirstOrDefault(a => a.FullName?.Contains(".FileTransformation", StringComparison.Ordinal) ?? false);
            var register = assembly?.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface")?.GetMethod("RegisterTransformation");
            if (register is null)
            {
                _logger.LogInformation("File Transformation plugin not found: the JellyWrapped menu link won't be added to the web client");
                return Task.CompletedTask;
            }

            var json = JsonSerializer.Serialize(new Dictionary<string, string?>
            {
                ["id"] = _transformationId.ToString(),
                ["fileNamePattern"] = "index.html",
                ["callbackAssembly"] = GetType().Assembly.FullName,
                ["callbackClass"] = typeof(IndexTransformation).FullName,
                ["callbackMethod"] = nameof(IndexTransformation.Transform)
            });

            // The payload is a Newtonsoft JObject: build it with that type's own Parse method.
            var payloadType = register.GetParameters()[0].ParameterType;
            var payload = payloadType.GetMethod("Parse", [typeof(string)])!.Invoke(null, [json]);
            register.Invoke(null, [payload]);
            Injected = true;
            _logger.LogInformation("JellyWrapped link registered with File Transformation");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not register the JellyWrapped web integration");
        }

        return Task.CompletedTask;
    }
}
