using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Text.Json;
using Microsoft.VisualBasic;

namespace PDV.Launcher;

internal static class Program
{
    private const string AppTitle = "PDV Control Hub";

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            var mode = ParseMode(args);
            var appDir = AppContext.BaseDirectory;
            var apiExePath = Path.Combine(appDir, "PDV.Api.exe");
            var settingsPath = Path.Combine(appDir, "PDV.Launcher.settings.json");
            var stateRoot = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "PDV Control Hub");
            var logRoot = Path.Combine(stateRoot, "logs");
            var stdoutLogPath = Path.Combine(logRoot, "pdv-api.out.log");
            var stderrLogPath = Path.Combine(logRoot, "pdv-api.err.log");
            var pidFilePath = Path.Combine(stateRoot, "pdv-api.pid");

            if (!File.Exists(apiExePath))
            {
                ShowMessage("Nao foi possivel localizar o executavel principal do PDV. Reinstale o software.");
                return 1;
            }

            var settings = LauncherSettings.Load(settingsPath);
            if (mode == LaunchMode.Client)
            {
                var remoteHost = PromptRemoteHost(settings.ClientDefaultHost);
                if (string.IsNullOrWhiteSpace(remoteHost))
                {
                    return 0;
                }

                OpenUrlInApp(ResolveRemoteLoginUrl(remoteHost, settings.DefaultPort));
                return 0;
            }

            if (mode == LaunchMode.Stop)
            {
                StopBackend(apiExePath, pidFilePath);
                return 0;
            }

            AssertDotNetRuntimeInstalled(settings);

            EnsureDirectory(logRoot);

            var portCandidates = settings.GetPortCandidates();
            var readyEndpoint = FindReadyEndpoint("127.0.0.1", portCandidates);
            if (readyEndpoint is not null)
            {
                OpenUrlInApp(readyEndpoint.LoginUrl);
                if (mode == LaunchMode.Network)
                {
                    var lanHost = GetLanIpv4Address();
                    ShowMessage(
                        $"Servidor PDV ja estava em execucao.{Environment.NewLine}{Environment.NewLine}" +
                        $"Neste computador: {readyEndpoint.LoginUrl}{Environment.NewLine}" +
                        $"Em outro computador: http://{lanHost}:{readyEndpoint.Port}/login");
                }

                return 0;
            }

            var selectedPort = ResolveAvailablePort(portCandidates);
            if (selectedPort is null)
            {
                ShowMessage("Nenhuma porta livre foi encontrada para iniciar o PDV. Feche outros programas que estejam usando as portas 5080-5090 e tente novamente.");
                return 1;
            }

            var listenHost = mode == LaunchMode.Network
                ? settings.NetworkListenHost
                : settings.LocalListenHost;
            if (string.IsNullOrWhiteSpace(listenHost))
            {
                listenHost = mode == LaunchMode.Network ? "0.0.0.0" : "127.0.0.1";
            }

            var listenUrl = BuildBaseUrl(listenHost, selectedPort.Value);
            var loginUrl = BuildLoginUrl("127.0.0.1", selectedPort.Value);
            var existingProcess = TryGetInstalledApiProcess(apiExePath, pidFilePath);
            if (existingProcess is not null)
            {
                TryStopProcess(existingProcess, pidFilePath);
            }

            existingProcess = StartBackend(apiExePath, appDir, listenUrl, stdoutLogPath, stderrLogPath, pidFilePath);

            if (!WaitUntilReady(loginUrl, settings.StartupTimeoutSeconds))
            {
                var message = $"O servidor do PDV nao respondeu a tempo.{Environment.NewLine}{Environment.NewLine}" +
                              $"Porta tentada: {selectedPort}{Environment.NewLine}" +
                              $"Logs: {logRoot}";
                var details = GetLastLogSnippet(stdoutLogPath, stderrLogPath);
                if (!string.IsNullOrWhiteSpace(details))
                {
                    message += $"{Environment.NewLine}{Environment.NewLine}Ultimos detalhes:{Environment.NewLine}{details}";
                }

                ShowMessage(message);
                return 1;
            }

            OpenUrlInApp(loginUrl);
            if (mode == LaunchMode.Network)
            {
                var lanHost = GetLanIpv4Address();
                ShowMessage(
                    $"PDV aberto com acesso em rede.{Environment.NewLine}{Environment.NewLine}" +
                    $"Neste computador: {loginUrl}{Environment.NewLine}" +
                    $"Em outro computador: http://{lanHost}:{selectedPort}/login");
            }

            return 0;
        }
        catch (Exception error)
        {
            ShowMessage(error.Message);
            return 1;
        }
    }

    private static LaunchMode ParseMode(IEnumerable<string> args)
    {
        var normalized = args
            .Select(static item => item.Trim())
            .FirstOrDefault(static item => !string.IsNullOrWhiteSpace(item))
            ?.TrimStart('-', '/')
            .ToLowerInvariant();

        return normalized switch
        {
            "network" or "rede" => LaunchMode.Network,
            "client" or "cliente" => LaunchMode.Client,
            "stop" or "parar" => LaunchMode.Stop,
            _ => LaunchMode.Local
        };
    }

    private static void ShowMessage(string text)
    {
        MessageBox.Show(text, AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private static void EnsureDirectory(string path)
    {
        if (!Directory.Exists(path))
        {
            Directory.CreateDirectory(path);
        }
    }

    private static void OpenUrlInApp(string url)
    {
        var browserLauncher = FindBrowserAppLauncher();
        if (!string.IsNullOrWhiteSpace(browserLauncher))
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = browserLauncher,
                Arguments = $"--app={url}",
                UseShellExecute = true
            });
            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = url,
            UseShellExecute = true
        });
    }

    private static string? FindBrowserAppLauncher()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe")
        };

        return candidates.FirstOrDefault(File.Exists);
    }

    private static void AssertDotNetRuntimeInstalled(LauncherSettings settings)
    {
        if (!settings.RequiresDotNetRuntime)
        {
            return;
        }

        var runtimeLines = GetInstalledRuntimeLines();
        var hasNetCore = runtimeLines.Any(static item => item.StartsWith("Microsoft.NETCore.App 9.", StringComparison.OrdinalIgnoreCase));
        var hasAspNet = runtimeLines.Any(static item => item.StartsWith("Microsoft.AspNetCore.App 9.", StringComparison.OrdinalIgnoreCase));
        if (hasNetCore && hasAspNet)
        {
            return;
        }

        ShowMessage("Este pacote do PDV precisa do .NET 9 Desktop/ASP.NET Runtime instalado nesta maquina. Instale o runtime e tente novamente.");
        Process.Start(new ProcessStartInfo
        {
            FileName = "https://dotnet.microsoft.com/download/dotnet/9.0",
            UseShellExecute = true
        });
        Environment.Exit(1);
    }

    private static IReadOnlyList<string> GetInstalledRuntimeLines()
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = "dotnet",
                Arguments = "--list-runtimes",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            });

            if (process is null)
            {
                return [];
            }

            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit(4000);
            return output
                .Split(Environment.NewLine, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        }
        catch
        {
            return [];
        }
    }

    private static ReadyEndpoint? FindReadyEndpoint(string browserHost, IEnumerable<int> ports)
    {
        foreach (var port in ports)
        {
            var loginUrl = BuildLoginUrl(browserHost, port);
            if (TestPdvReady(loginUrl))
            {
                return new ReadyEndpoint(port, loginUrl);
            }
        }

        return null;
    }

    private static bool TestPdvReady(string url)
    {
        try
        {
            using var client = new HttpClient
            {
                Timeout = TimeSpan.FromSeconds(2)
            };
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            using var response = client.Send(request);
            return (int)response.StatusCode is >= 200 and < 500;
        }
        catch
        {
            return false;
        }
    }

    private static int? ResolveAvailablePort(IEnumerable<int> ports)
    {
        var listeners = IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners();
        foreach (var port in ports)
        {
            if (listeners.All(item => item.Port != port))
            {
                return port;
            }
        }

        return null;
    }

    private static Process StartBackend(
        string apiExePath,
        string workingDirectory,
        string listenUrl,
        string stdoutLogPath,
        string stderrLogPath,
        string pidFilePath)
    {
        ClearPreviousLog(stdoutLogPath);
        ClearPreviousLog(stderrLogPath);

        var process = Process.Start(new ProcessStartInfo
        {
            FileName = apiExePath,
            Arguments = $"--urls={listenUrl}",
            WorkingDirectory = workingDirectory,
            CreateNoWindow = true,
            UseShellExecute = false,
            WindowStyle = ProcessWindowStyle.Hidden,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        }) ?? throw new InvalidOperationException("Nao foi possivel iniciar o executavel principal do PDV.");

        process.OutputDataReceived += (_, eventArgs) =>
        {
            if (eventArgs.Data is not null)
            {
                AppendLogLine(stdoutLogPath, eventArgs.Data);
            }
        };
        process.ErrorDataReceived += (_, eventArgs) =>
        {
            if (eventArgs.Data is not null)
            {
                AppendLogLine(stderrLogPath, eventArgs.Data);
            }
        };

        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        File.WriteAllText(pidFilePath, process.Id.ToString());
        return process;
    }

    private static bool WaitUntilReady(string loginUrl, int timeoutSeconds)
    {
        var deadline = DateTime.UtcNow.AddSeconds(Math.Max(10, timeoutSeconds));
        while (DateTime.UtcNow < deadline)
        {
            Thread.Sleep(750);
            if (TestPdvReady(loginUrl))
            {
                return true;
            }
        }

        return false;
    }

    private static void StopBackend(string apiExePath, string pidFilePath)
    {
        var process = TryGetInstalledApiProcess(apiExePath, pidFilePath);
        if (process is null)
        {
            ShowMessage("Nenhuma instancia local do PDV foi encontrada em execucao.");
            return;
        }

        try
        {
            TryStopProcess(process, pidFilePath);
        }
        catch
        {
            ShowMessage("Nao foi possivel encerrar o PDV local agora. Feche manualmente se ele ainda estiver aberto.");
            return;
        }

        ShowMessage("PDV local encerrado com sucesso.");
    }

    private static void TryStopProcess(Process process, string pidFilePath)
    {
        process.Kill(true);
        process.WaitForExit(5000);
        TryDeleteFile(pidFilePath);
    }

    private static Process? TryGetInstalledApiProcess(string apiExePath, string pidFilePath)
    {
        var normalizedApiPath = Path.GetFullPath(apiExePath);
        var pid = TryReadPid(pidFilePath);
        if (pid is not null)
        {
            try
            {
                var process = Process.GetProcessById(pid.Value);
                var processPath = SafeReadMainModulePath(process);
                if (string.Equals(processPath, normalizedApiPath, StringComparison.OrdinalIgnoreCase) && !process.HasExited)
                {
                    return process;
                }
            }
            catch
            {
            }
        }

        foreach (var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(apiExePath)))
        {
            var processPath = SafeReadMainModulePath(process);
            if (string.Equals(processPath, normalizedApiPath, StringComparison.OrdinalIgnoreCase) && !process.HasExited)
            {
                return process;
            }
        }

        return null;
    }

    private static int? TryReadPid(string pidFilePath)
    {
        try
        {
            if (!File.Exists(pidFilePath))
            {
                return null;
            }

            return int.TryParse(File.ReadAllText(pidFilePath).Trim(), out var pid)
                ? pid
                : null;
        }
        catch
        {
            return null;
        }
    }

    private static string? SafeReadMainModulePath(Process process)
    {
        try
        {
            return process.MainModule?.FileName is { Length: > 0 } path
                ? Path.GetFullPath(path)
                : null;
        }
        catch
        {
            return null;
        }
    }

    private static void ClearPreviousLog(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
        }
    }

    private static void AppendLogLine(string path, string line)
    {
        try
        {
            File.AppendAllText(path, line + Environment.NewLine);
        }
        catch
        {
        }
    }

    private static string GetLastLogSnippet(string stdoutLogPath, string stderrLogPath)
    {
        var lines = new List<string>();
        lines.AddRange(ReadTail(stderrLogPath, 8));
        lines.AddRange(ReadTail(stdoutLogPath, 8));
        return string.Join(Environment.NewLine, lines
            .Where(static item => !string.IsNullOrWhiteSpace(item))
            .TakeLast(8));
    }

    private static IReadOnlyList<string> ReadTail(string path, int take)
    {
        try
        {
            if (!File.Exists(path))
            {
                return [];
            }

            return File.ReadLines(path)
                .TakeLast(take)
                .ToArray();
        }
        catch
        {
            return [];
        }
    }

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
        }
    }

    private static string PromptRemoteHost(string? defaultHost)
    {
        return Interaction.InputBox(
            "Informe o IP ou nome do computador que esta com o PDV servidor aberto na rede." +
            $"{Environment.NewLine}Exemplo: 192.168.15.4",
            "Conectar ao PDV da rede",
            defaultHost ?? string.Empty).Trim();
    }

    private static string ResolveRemoteLoginUrl(string remoteHost, int defaultPort)
    {
        if (remoteHost.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            || remoteHost.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            return remoteHost.TrimEnd('/') + "/login";
        }

        if (remoteHost.Contains(':'))
        {
            return $"http://{remoteHost}/login";
        }

        return $"http://{remoteHost}:{defaultPort}/login";
    }

    private static string GetLanIpv4Address()
    {
        try
        {
            var interfaces = NetworkInterface.GetAllNetworkInterfaces()
                .Where(static item =>
                    item.OperationalStatus == OperationalStatus.Up
                    && item.NetworkInterfaceType != NetworkInterfaceType.Loopback);

            foreach (var networkInterface in interfaces)
            {
                var ip = networkInterface
                    .GetIPProperties()
                    .UnicastAddresses
                    .Select(static item => item.Address)
                    .FirstOrDefault(static address =>
                        address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork
                        && !IPAddress.IsLoopback(address)
                        && !address.ToString().StartsWith("169.254.", StringComparison.Ordinal));

                if (ip is not null)
                {
                    return ip.ToString();
                }
            }
        }
        catch
        {
        }

        return Dns.GetHostName();
    }

    private static string BuildBaseUrl(string host, int port) => $"http://{host}:{port}";

    private static string BuildLoginUrl(string host, int port) => $"{BuildBaseUrl(host, port)}/login";

    private enum LaunchMode
    {
        Local,
        Network,
        Client,
        Stop
    }

    private sealed record ReadyEndpoint(int Port, string LoginUrl);
}

internal sealed class LauncherSettings
{
    public bool RequiresDotNetRuntime { get; init; } = true;
    public int DefaultPort { get; init; } = 5080;
    public string LocalListenHost { get; init; } = "127.0.0.1";
    public string NetworkListenHost { get; init; } = "0.0.0.0";
    public string ClientDefaultHost { get; init; } = string.Empty;
    public int StartupTimeoutSeconds { get; init; } = 35;
    public int[] FallbackPorts { get; init; } = [5080, 5081, 5082, 5083, 5090];

    public static LauncherSettings Load(string settingsPath)
    {
        try
        {
            if (!File.Exists(settingsPath))
            {
                return new LauncherSettings();
            }

            return JsonSerializer.Deserialize<LauncherSettings>(File.ReadAllText(settingsPath))
                ?? new LauncherSettings();
        }
        catch
        {
            return new LauncherSettings();
        }
    }

    public IReadOnlyList<int> GetPortCandidates()
    {
        var ports = new List<int>();
        if (DefaultPort > 0)
        {
            ports.Add(DefaultPort);
        }

        foreach (var port in FallbackPorts)
        {
            if (port > 0 && !ports.Contains(port))
            {
                ports.Add(port);
            }
        }

        return ports.Count > 0 ? ports : [5080];
    }
}
