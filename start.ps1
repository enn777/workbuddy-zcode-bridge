$ErrorActionPreference = 'Stop'
$bridgeRoot = $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
function Test-BridgeHealth {
    if (-not (Test-Path -LiteralPath $keyPath)) { return $false }
    try {
        $bridgeKey = (Get-Content -LiteralPath $keyPath -Raw).Trim()
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:18347/health' -Headers @{Authorization="Bearer $bridgeKey"} -TimeoutSec 3
        return $health.ok -eq $true
    } catch { return $false }
}
function Update-ZCodeProvider {
    & $nodePath (Join-Path $bridgeRoot 'keepalive\configure-zcode.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Unable to configure ZCode.' }
}
$settingsPath = Join-Path $bridgeRoot 'settings.local.json'
if (-not (Test-Path -LiteralPath $settingsPath)) { throw 'Run Setup.cmd first to configure application paths.' }
$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
$zcodePath = $settings.zcodePath
if (-not (Test-Path -LiteralPath $zcodePath)) { throw "ZCode not found: $zcodePath" }
$zcodeProcesses = @(Get-Process -Name ZCode -ErrorAction SilentlyContinue)
if ($zcodeProcesses.Count -gt 0) {
    Write-Output 'Restarting ZCode. Running tasks will be interrupted; save your work before using this launcher.'
    foreach ($zcodeProcess in $zcodeProcesses) {
        if ($zcodeProcess.MainWindowHandle -ne 0) { $null = $zcodeProcess.CloseMainWindow() }
    }
    $closeDeadline = (Get-Date).AddSeconds(5)
    do {
        Start-Sleep -Milliseconds 500
        $remaining = @(Get-Process -Name ZCode -ErrorAction SilentlyContinue)
    } while ($remaining.Count -gt 0 -and (Get-Date) -lt $closeDeadline)
    if ($remaining.Count -gt 0) {
        $remaining | Stop-Process -Force -ErrorAction SilentlyContinue
        $exitDeadline = (Get-Date).AddSeconds(10)
        while (@(Get-Process -Name ZCode -ErrorAction SilentlyContinue).Count -gt 0 -and (Get-Date) -lt $exitDeadline) {
            Start-Sleep -Milliseconds 500
        }
        if (@(Get-Process -Name ZCode -ErrorAction SilentlyContinue).Count -gt 0) {
            throw 'Unable to stop ZCode. Close it manually and run this launcher again.'
        }
    }
}
$null = Start-Process -FilePath $zcodePath -WorkingDirectory (Split-Path -Parent $zcodePath)
Write-Output 'ZCode opened.'
$keyPath = Join-Path $bridgeRoot 'state\bridge.key'
if (Test-BridgeHealth) {
    Update-ZCodeProvider
    Write-Output 'Bridge already running. ZCode provider configured.'
    exit 0
}
$bridgeArgs = '"' + (Join-Path $bridgeRoot 'bridge.mjs') + '"'
$bridgeProcess = Start-Process -FilePath $nodePath -ArgumentList $bridgeArgs -WorkingDirectory $bridgeRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $bridgeRoot 'bridge-stdout.log') -RedirectStandardError (Join-Path $bridgeRoot 'bridge-error.log') -PassThru
Write-Output "Bridge starting (PID $($bridgeProcess.Id))."
$readyDeadline = (Get-Date).AddSeconds(45)
do {
    Start-Sleep -Milliseconds 500
    if ($bridgeProcess.HasExited) { throw 'Bridge exited. Check bridge-error.log.' }
    if (Test-BridgeHealth) {
        Update-ZCodeProvider
        Write-Output 'Bridge ready. Select WorkBuddy AI (Local) in ZCode.'
        exit 0
    }
} while ((Get-Date) -lt $readyDeadline)
throw 'Bridge did not become ready within 45 seconds. Check bridge-error.log.'
