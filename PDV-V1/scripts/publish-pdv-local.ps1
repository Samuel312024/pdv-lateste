param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [string]$OutputDir = ".\artifacts\pdv-local"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$webDir = Join-Path $repoRoot "src\PDV.Web"
$apiDir = Join-Path $repoRoot "src\PDV.Api"
$distDir = Join-Path $webDir "dist"
$webRootDir = Join-Path $apiDir "wwwroot"
$publishDir = Join-Path (Resolve-Path $repoRoot) $OutputDir

Write-Host "==> Buildando frontend PWA..."
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

if (Test-Path $publishDir) {
    Remove-Item -LiteralPath $publishDir -Recurse -Force
}

Write-Host "==> Publicando API self-contained..."
$projectFile = Join-Path $apiDir "PDV.Api.csproj"
Write-Host "==> Restaurando dependencias do .NET para $Runtime..."
dotnet restore $projectFile -r $Runtime
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao restaurar dependencias da API."
}

dotnet publish $projectFile `
    -c $Configuration `
    -r $Runtime `
    --self-contained true `
    --no-restore `
    /p:PublishSingleFile=true `
    /p:IncludeNativeLibrariesForSelfExtract=true `
    -o $publishDir
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao publicar a API."
}

$publishWebRoot = Join-Path $publishDir "wwwroot"
if (Test-Path $publishWebRoot) {
    Remove-Item -LiteralPath $publishWebRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $publishWebRoot -Force | Out-Null
Copy-Item -Path (Join-Path $distDir "*") -Destination $publishWebRoot -Recurse -Force

$launcherPath = Join-Path $publishDir "Iniciar PDV.cmd"
$launcherContent = @"
@echo off
setlocal
set APPDIR=%~dp0
set URL=http://127.0.0.1:5080
start "" /min "%APPDIR%PDV.Api.exe" --urls=%URL%
timeout /t 3 /nobreak >nul
start "" "%URL%/login"
echo PDV iniciado. Para instalar como aplicativo, abra o menu do navegador e escolha "Instalar app do PDV".
"@
Set-Content -LiteralPath $launcherPath -Value $launcherContent -Encoding ASCII

$readmePath = Join-Path $publishDir "LEIA-ME-PDV.txt"
$readmeContent = @"
PDV local gerado com sucesso.

1. Execute "Iniciar PDV.cmd"
2. O navegador vai abrir em http://127.0.0.1:5080/login
3. Para usar como software instalado, no Edge/Chrome clique em "Instalar app do PDV"
4. O app instalado passa a abrir em janela propria, como aplicativo do Windows

Credenciais iniciais:
- master@pdv.local / Master@123
- admin@pdv.local / Admin@123
- operador@pdv.local / Operador@123
"@
Set-Content -LiteralPath $readmePath -Value $readmeContent -Encoding UTF8

Write-Host ""
Write-Host "Pacote local gerado em: $publishDir" -ForegroundColor Green
Write-Host "Use 'Iniciar PDV.cmd' para abrir e instalar o app." -ForegroundColor Green
