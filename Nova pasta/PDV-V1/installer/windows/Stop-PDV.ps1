Add-Type -AssemblyName System.Windows.Forms

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiExe = Join-Path $appDir "PDV.Api.exe"

$processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Name -ieq "PDV.Api.exe" -and
        $_.ExecutablePath -and
        ([System.IO.Path]::GetFullPath($_.ExecutablePath) -eq [System.IO.Path]::GetFullPath($apiExe))
    }

if (-not $processes) {
    [System.Windows.Forms.MessageBox]::Show("Nenhum processo local do PDV estava em execucao.", "PDV Control Hub") | Out-Null
    exit 0
}

foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

[System.Windows.Forms.MessageBox]::Show("Servidor local do PDV encerrado com sucesso.", "PDV Control Hub") | Out-Null
