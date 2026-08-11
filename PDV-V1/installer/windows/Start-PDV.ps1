param(
    [ValidateSet("Local", "Network", "Client")]
    [string]$Mode = "Local"
)

$ErrorActionPreference = "Stop"

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiExe = Join-Path $appDir "PDV.Api.exe"
$settingsFile = Join-Path $appDir "PDV.Launcher.settings.json"
$logRoot = Join-Path $env:LOCALAPPDATA "PDV Control Hub\logs"
$stdoutLog = Join-Path $logRoot "pdv-api.out.log"
$stderrLog = Join-Path $logRoot "pdv-api.err.log"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic

function Show-Message([string]$text, [string]$title = "PDV Control Hub") {
    [System.Windows.Forms.MessageBox]::Show($text, $title) | Out-Null
}

function Open-UrlInApp([string]$url) {
    $browserLauncher = Find-BrowserAppLauncher
    if ($browserLauncher) {
        Start-Process -FilePath $browserLauncher -ArgumentList "--app=$url"
        return
    }

    Start-Process $url
}

function Find-BrowserAppLauncher {
    $candidates = @(
        "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

function Get-LauncherSettings {
    if (-not (Test-Path $settingsFile)) {
        return [pscustomobject]@{
            requiresDotNetRuntime = $true
            defaultPort = 5080
            localListenHost = "127.0.0.1"
            networkListenHost = "0.0.0.0"
            clientDefaultHost = ""
            startupTimeoutSeconds = 35
            fallbackPorts = @(5080, 5081, 5082, 5083, 5090)
        }
    }

    try {
        return Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json
    }
    catch {
        Show-Message "Nao foi possivel ler o arquivo PDV.Launcher.settings.json. Verifique a instalacao do PDV."
        exit 1
    }
}

function Get-InstalledRuntimeLines {
    try {
        return & dotnet --list-runtimes 2>$null
    }
    catch {
        return @()
    }
}

function Assert-DotNetRuntimeInstalled($settings) {
    if (-not $settings.requiresDotNetRuntime) {
        return
    }

    $runtimeLines = Get-InstalledRuntimeLines
    $hasNetCore = $runtimeLines | Where-Object { $_ -match '^Microsoft\.NETCore\.App 9\.' }
    $hasAspNet = $runtimeLines | Where-Object { $_ -match '^Microsoft\.AspNetCore\.App 9\.' }

    if ($hasNetCore -and $hasAspNet) {
        return
    }

    Show-Message "Este pacote do PDV precisa do .NET 9 Desktop/ASP.NET Runtime instalado nesta maquina. Instale o runtime e tente novamente."
    Start-Process "https://dotnet.microsoft.com/download/dotnet/9.0"
    exit 1
}

function Ensure-LogDirectory {
    if (-not (Test-Path $logRoot)) {
        New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
    }
}

function Clear-PreviousLogs {
    foreach ($file in @($stdoutLog, $stderrLog)) {
        if (Test-Path $file) {
            Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
        }
    }
}

function Get-ApiProcessFromInstall {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -ieq "PDV.Api.exe" -and
            $_.ExecutablePath -and
            ([System.IO.Path]::GetFullPath($_.ExecutablePath) -eq [System.IO.Path]::GetFullPath($apiExe))
        }
}

function Build-BaseUrl([string]$host, [int]$port) {
    return "http://${host}:${port}"
}

function Build-LoginUrl([string]$host, [int]$port) {
    return "$(Build-BaseUrl $host $port)/login"
}

function Test-PdvReady([string]$url) {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

function Test-PortAvailable([int]$port) {
    $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    return -not ($listeners | Where-Object { $_.Port -eq $port })
}

function Get-PortCandidates($settings) {
    $ports = New-Object System.Collections.Generic.List[int]
    if ($settings.defaultPort) {
        $ports.Add([int]$settings.defaultPort)
    }

    $fallbackPorts = @()
    if ($settings.PSObject.Properties.Name -contains 'fallbackPorts' -and $settings.fallbackPorts) {
        $fallbackPorts = @($settings.fallbackPorts)
    }

    foreach ($item in $fallbackPorts) {
        $port = [int]$item
        if (-not $ports.Contains($port)) {
            $ports.Add($port)
        }
    }

    if ($ports.Count -eq 0) {
        $ports.Add(5080)
    }

    return $ports.ToArray()
}

function Find-ReadyEndpoint([string]$browserHost, [int[]]$ports) {
    foreach ($port in $ports) {
        $loginUrl = Build-LoginUrl $browserHost $port
        if (Test-PdvReady $loginUrl) {
            return [pscustomobject]@{
                Port = $port
                LoginUrl = $loginUrl
            }
        }
    }

    return $null
}

function Resolve-AvailablePort([int[]]$ports) {
    foreach ($port in $ports) {
        if (Test-PortAvailable $port) {
            return $port
        }
    }

    return $null
}

function Get-LanIpv4Address {
    try {
        $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -and
                $_.IPAddress -notlike '127.*' -and
                $_.IPAddress -notlike '169.254.*' -and
                $_.PrefixOrigin -ne 'WellKnown'
            } |
            Sort-Object -Property InterfaceMetric |
            Select-Object -First 1 -ExpandProperty IPAddress

        if ($ip) {
            return $ip
        }
    }
    catch {
    }

    return $env:COMPUTERNAME
}

function Get-LastLogSnippet {
    $lines = @()
    foreach ($file in @($stderrLog, $stdoutLog)) {
        if (Test-Path $file) {
            $lines += Get-Content -LiteralPath $file -Tail 20 -ErrorAction SilentlyContinue
        }
    }

    $snippet = ($lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 8) -join [Environment]::NewLine
    return $snippet.Trim()
}

function Start-Backend([string]$listenUrl) {
    Ensure-LogDirectory
    Clear-PreviousLogs

    Start-Process `
        -FilePath $apiExe `
        -ArgumentList "--urls=$listenUrl" `
        -WorkingDirectory $appDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog
}

function Wait-UntilReady([string]$loginUrl, [int]$timeoutSeconds) {
    $maxAttempts = [Math]::Max(10, [int]([Math]::Ceiling(($timeoutSeconds * 1000) / 750)))
    for ($attempt = 0; $attempt -lt $maxAttempts; $attempt++) {
        Start-Sleep -Milliseconds 750
        if (Test-PdvReady $loginUrl) {
            return $true
        }
    }

    return $false
}

function Prompt-RemoteHost($settings) {
    $defaultHost = ""
    if ($settings.PSObject.Properties.Name -contains 'clientDefaultHost' -and $settings.clientDefaultHost) {
        $defaultHost = [string]$settings.clientDefaultHost
    }
    $input = [Microsoft.VisualBasic.Interaction]::InputBox(
        "Informe o IP ou nome do computador que esta com o PDV servidor aberto na rede.`nExemplo: 192.168.15.4",
        "Conectar ao PDV da rede",
        $defaultHost)

    if ($null -eq $input) {
        return ""
    }

    return $input.Trim()
}

function Resolve-RemoteLoginUrl([string]$remoteHost, [int]$defaultPort) {
    if ($remoteHost -match '^https?://') {
        return $remoteHost.TrimEnd('/') + "/login"
    }

    if ($remoteHost -match ':\d+$') {
        return "http://$remoteHost/login"
    }

    return "http://${remoteHost}:${defaultPort}/login"
}

$settings = Get-LauncherSettings

if ($Mode -eq "Client") {
    $remoteHost = Prompt-RemoteHost $settings
    if ([string]::IsNullOrWhiteSpace($remoteHost)) {
        exit 0
    }

    $remoteUrl = Resolve-RemoteLoginUrl $remoteHost ([int]$settings.defaultPort)
    Open-UrlInApp $remoteUrl
    exit 0
}

Assert-DotNetRuntimeInstalled $settings

$portCandidates = Get-PortCandidates $settings
$browserHost = "127.0.0.1"
$listenHost = if ($Mode -eq "Network") { [string]$settings.networkListenHost } else { [string]$settings.localListenHost }
if ([string]::IsNullOrWhiteSpace($listenHost)) {
    $listenHost = if ($Mode -eq "Network") { "0.0.0.0" } else { "127.0.0.1" }
}

$readyEndpoint = Find-ReadyEndpoint $browserHost $portCandidates
if ($readyEndpoint) {
    Open-UrlInApp $readyEndpoint.LoginUrl
    if ($Mode -eq "Network") {
        $lanHost = Get-LanIpv4Address
        Show-Message "Servidor PDV ja estava em execucao.`n`nAcesse neste computador: $($readyEndpoint.LoginUrl)`nAcesse em outro computador: http://${lanHost}:$($readyEndpoint.Port)/login"
    }
    exit 0
}

$selectedPort = Resolve-AvailablePort $portCandidates
if (-not $selectedPort) {
    Show-Message "Nenhuma porta livre foi encontrada para iniciar o PDV. Feche outros programas que estejam usando as portas 5080-5090 e tente novamente."
    exit 1
}

$listenUrl = Build-BaseUrl $listenHost $selectedPort
$loginUrl = Build-LoginUrl $browserHost $selectedPort
$existing = Get-ApiProcessFromInstall
if (-not $existing) {
    Start-Backend $listenUrl
}

$timeoutSeconds = if ($settings.startupTimeoutSeconds) { [int]$settings.startupTimeoutSeconds } else { 35 }
if (-not (Wait-UntilReady $loginUrl $timeoutSeconds)) {
    $details = Get-LastLogSnippet
    $message = "O servidor do PDV nao respondeu a tempo.`n`nPorta tentada: $selectedPort`nLogs: $logRoot"
    if ($details) {
        $message += "`n`nUltimos detalhes:`n$details"
    }

    Show-Message $message
    exit 1
}

Open-UrlInApp $loginUrl
if ($Mode -eq "Network") {
    $lanHost = Get-LanIpv4Address
    Show-Message "PDV aberto com acesso em rede.`n`nNeste computador: $loginUrl`nEm outro computador: http://${lanHost}:${selectedPort}/login"
}
