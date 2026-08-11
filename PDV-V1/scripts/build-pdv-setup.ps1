param(
    [string]$Configuration = "Release",
    [string]$OutputRoot = ".\artifacts\pdv-setup",
    [switch]$SelfContained,
    [string]$Runtime = "win-x64",
    [string]$ApiBuildDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$webDir = Join-Path $repoRoot "src\PDV.Web"
$apiDir = Join-Path $repoRoot "src\PDV.Api"
$launcherDir = Join-Path $repoRoot "src\PDV.Launcher"
$distDir = Join-Path $webDir "dist"
$webRootDir = Join-Path $apiDir "wwwroot"
$apiAppDataRoot = Join-Path $apiDir ".app-data"
$apiDownloadsDir = Join-Path $apiAppDataRoot "downloads"
$installerDir = Join-Path $repoRoot "installer\windows"
$outputRootResolved = Join-Path (Resolve-Path $repoRoot) $OutputRoot
$publishDir = Join-Path $outputRootResolved "app"
$setupDir = Join-Path $outputRootResolved "setup"
$projectFile = Join-Path $apiDir "PDV.Api.csproj"
$launcherProjectFile = Join-Path $launcherDir "PDV.Launcher.csproj"
$codeSignPfxPath = $env:PDV_SIGN_PFX
$codeSignPfxPassword = $env:PDV_SIGN_PFX_PASSWORD
$codeSignTimestampUrl = if ($env:PDV_SIGN_TIMESTAMP_URL) { $env:PDV_SIGN_TIMESTAMP_URL } else { "http://timestamp.digicert.com" }
$signtoolPath = @(
    "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe",
    "C:\Program Files\Microsoft SDKs\ClickOnce\SignTool\signtool.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
$isccPath = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $isccPath) {
    $isccCommand = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($isccCommand) {
        $isccPath = $isccCommand.Source
    }
}

if (-not $isccPath) {
    throw "Inno Setup nao encontrado. Instale o ISCC.exe para gerar o setup."
}

if (-not $signtoolPath) {
    $signtoolCommand = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($signtoolCommand) {
        $signtoolPath = $signtoolCommand.Source
    }
}

$packageJson = Get-Content -LiteralPath (Join-Path $webDir "package.json") -Raw | ConvertFrom-Json
$appVersion = if ($packageJson.version) { [string]$packageJson.version } else { "0.1.0" }

function Invoke-OptionalCodeSign([string]$targetPath) {
    if ([string]::IsNullOrWhiteSpace($codeSignPfxPath) -or [string]::IsNullOrWhiteSpace($codeSignPfxPassword)) {
        return
    }

    if (-not (Test-Path $targetPath)) {
        return
    }

    if (-not $signtoolPath) {
        throw "Certificado informado, mas o signtool.exe nao foi encontrado nesta maquina."
    }

    Write-Host "==> Assinando digitalmente $targetPath..."
    & $signtoolPath sign /fd SHA256 /f $codeSignPfxPath /p $codeSignPfxPassword /tr $codeSignTimestampUrl /td SHA256 $targetPath
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao assinar digitalmente $targetPath."
    }
}

Write-Host "==> Buildando frontend..."
Push-Location $webDir
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao buildar o frontend."
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path $webRootDir)) {
    New-Item -ItemType Directory -Path $webRootDir | Out-Null
}

Write-Host "==> Copiando frontend para a API..."
Get-ChildItem -LiteralPath $webRootDir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $distDir "*") -Destination $webRootDir -Recurse -Force

if (Test-Path $outputRootResolved) {
    Remove-Item -LiteralPath $outputRootResolved -Recurse -Force
}

New-Item -ItemType Directory -Path $publishDir -Force | Out-Null
New-Item -ItemType Directory -Path $setupDir -Force | Out-Null

if ($SelfContained) {
    Write-Host "==> Restaurando dependencias do runtime $Runtime..."
    dotnet restore $projectFile -r $Runtime
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao restaurar dependencias da API."
    }

    dotnet restore $launcherProjectFile -r $Runtime
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao restaurar dependencias do launcher."
    }

    Write-Host "==> Publicando API self-contained..."
    dotnet publish $projectFile `
        -c $Configuration `
        -r $Runtime `
        --self-contained true `
        --no-restore `
        /p:PublishSingleFile=true `
        /p:IncludeNativeLibrariesForSelfExtract=true `
        -o $publishDir

    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao gerar os binarios da API."
    }

    Write-Host "==> Publicando launcher self-contained..."
    dotnet publish $launcherProjectFile `
        -c $Configuration `
        -r $Runtime `
        --self-contained true `
        --no-restore `
        /p:PublishSingleFile=true `
        /p:IncludeNativeLibrariesForSelfExtract=true `
        -o $publishDir
}
else {
    Write-Host "==> Restaurando launcher..."
    dotnet restore $launcherProjectFile
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao restaurar dependencias do launcher."
    }

    if ($ApiBuildDir -and (Test-Path $ApiBuildDir)) {
        Write-Host "==> Reaproveitando binarios da API em $ApiBuildDir..."
        Copy-Item -Path (Join-Path $ApiBuildDir "*") -Destination $publishDir -Recurse -Force
        $LASTEXITCODE = 0
    }
    else {
        Write-Host "==> Gerando binarios da API framework-dependent..."
        dotnet build $projectFile `
            -c $Configuration `
            --no-restore `
            -o $publishDir
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao gerar os binarios da API."
    }

    Write-Host "==> Publicando launcher nativo do Windows..."
    dotnet publish $launcherProjectFile `
        -c $Configuration `
        --no-restore `
        -o $publishDir
}

if ($LASTEXITCODE -ne 0) {
    throw "Falha ao gerar os binarios do launcher."
}

Write-Host "==> Copiando shell web para a pasta final..."
$publishWebRoot = Join-Path $publishDir "wwwroot"
if (Test-Path $publishWebRoot) {
    Remove-Item -LiteralPath $publishWebRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $publishWebRoot -Force | Out-Null
Copy-Item -Path (Join-Path $distDir "*") -Destination $publishWebRoot -Recurse -Force

Write-Host "==> Copiando launcher do Windows..."
Copy-Item -Path (Join-Path $installerDir "Iniciar PDV.vbs") -Destination $publishDir -Force
Copy-Item -Path (Join-Path $installerDir "Iniciar PDV Rede.vbs") -Destination $publishDir -Force
Copy-Item -Path (Join-Path $installerDir "Abrir PDV da Rede.vbs") -Destination $publishDir -Force
Copy-Item -Path (Join-Path $installerDir "Parar PDV.vbs") -Destination $publishDir -Force
Copy-Item -Path (Join-Path $installerDir "Start-PDV.ps1") -Destination $publishDir -Force
Copy-Item -Path (Join-Path $installerDir "Stop-PDV.ps1") -Destination $publishDir -Force
Copy-Item -Path (Join-Path $installerDir "appsettings.Override.json") -Destination $publishDir -Force
Copy-Item -Path (Join-Path $installerDir "LEIA-ME-REDE.txt") -Destination $publishDir -Force

$launcherSettingsPath = Join-Path $installerDir "PDV.Launcher.settings.json"
$launcherSettings = Get-Content -LiteralPath $launcherSettingsPath -Raw | ConvertFrom-Json
$launcherSettings.requiresDotNetRuntime = -not $SelfContained.IsPresent
$launcherSettings | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $publishDir "PDV.Launcher.settings.json") -Encoding UTF8

Invoke-OptionalCodeSign (Join-Path $publishDir "PDV.Api.exe")
Invoke-OptionalCodeSign (Join-Path $publishDir "PDV.Launcher.exe")

$issFile = Join-Path $installerDir "PDV-Control-Hub.iss"
Write-Host "==> Gerando setup.exe com Inno Setup..."
& $isccPath "/DSourceDir=$publishDir" "/DAppVersion=$appVersion" "/O$setupDir" $issFile
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao compilar o instalador Inno Setup."
}

$generatedSetupPath = Join-Path $setupDir "PDV-Control-Hub-Setup.exe"
if (Test-Path $generatedSetupPath) {
    Invoke-OptionalCodeSign $generatedSetupPath
    New-Item -ItemType Directory -Path $apiDownloadsDir -Force | Out-Null
    Copy-Item -Path $generatedSetupPath -Destination (Join-Path $apiDownloadsDir "PDV-Control-Hub-Setup.exe") -Force
    Write-Host "==> Instalador publicado para download direto em $apiDownloadsDir"
}

Write-Host ""
Write-Host "Setup gerado em: $setupDir" -ForegroundColor Green
