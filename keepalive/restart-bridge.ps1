param(
    [int]$Port,
    [string]$BridgeRoot
)
$ErrorActionPreference = 'Stop'
# Kill whatever is listening on the bridge port, then start one clean instance.
$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
}
if ($listeners) { Start-Sleep -Seconds 2 }
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
Start-Process -FilePath $nodePath -ArgumentList ('"' + (Join-Path $BridgeRoot 'bridge.mjs') + '"') -WorkingDirectory $BridgeRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $BridgeRoot 'bridge-stdout.log') -RedirectStandardError (Join-Path $BridgeRoot 'bridge-error.log')
Write-Output "Bridge (port $Port) restart requested: $BridgeRoot"
