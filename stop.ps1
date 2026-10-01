$runtimePath = Join-Path $PSScriptRoot 'state\runtime.json'
if (!(Test-Path $runtimePath)) { exit 0 }
$bridgeRuntime = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
$bridgeProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($bridgeRuntime.pid)" -ErrorAction SilentlyContinue
if ($bridgeProcess -and $bridgeProcess.CommandLine.Contains((Join-Path $PSScriptRoot 'bridge.mjs'))) {
    Stop-Process -Id $bridgeRuntime.pid
    Write-Output 'Bridge stopped.'
}
