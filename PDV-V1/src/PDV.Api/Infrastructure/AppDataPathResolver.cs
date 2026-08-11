namespace PDV.Api.Infrastructure;

public static class AppDataPathResolver
{
    public static string ResolveRootPath(IHostEnvironment environment, IConfiguration configuration)
    {
        var configuredRoot = configuration["AppData:RootPath"];
        if (!string.IsNullOrWhiteSpace(configuredRoot))
        {
            return Path.GetFullPath(Environment.ExpandEnvironmentVariables(configuredRoot));
        }

        if (environment.IsDevelopment())
        {
            return Path.Combine(environment.ContentRootPath, ".app-data");
        }

        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(localAppData, "PDV Control Hub");
    }

    public static string ResolveConfigRootPath(IHostEnvironment environment, IConfiguration configuration)
        => Path.Combine(ResolveRootPath(environment, configuration), "config");

    public static string ResolveUploadsRootPath(IHostEnvironment environment, IConfiguration configuration)
        => Path.Combine(ResolveRootPath(environment, configuration), "uploads");

    public static string ResolveDataProtectionKeysRootPath(IHostEnvironment environment, IConfiguration configuration)
        => Path.Combine(ResolveRootPath(environment, configuration), ".data-protection-keys");

    public static string ResolveDownloadsRootPath(IHostEnvironment environment, IConfiguration configuration)
    {
        var configuredRoot = configuration["AppData:DownloadsRootPath"];
        if (!string.IsNullOrWhiteSpace(configuredRoot))
        {
            return Path.GetFullPath(Environment.ExpandEnvironmentVariables(configuredRoot));
        }

        if (environment.IsDevelopment())
        {
            return Path.Combine(ResolveRootPath(environment, configuration), "downloads");
        }

        var commonAppData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
        return Path.Combine(commonAppData, "PDV Control Hub", "downloads");
    }
}
