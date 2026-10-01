$ErrorActionPreference = 'Stop'
$bridgeRoot = $PSScriptRoot
$null = Get-Command node -ErrorAction Stop
$null = Get-Command npm.cmd -ErrorAction Stop
if ([int]((& node -p 'process.versions.node.split(".")[0]')) -lt 22) { throw 'Install Node.js 22 or newer.' }
$settingsPath = Join-Path $bridgeRoot 'settings.local.json'
if (-not (Test-Path -LiteralPath $settingsPath)) {
    Write-Output 'Install and sign in to WorkBuddy AI (international). Open ZCode once, then save and close it.'
    $zcodePath = (Read-Host 'Full path to ZCode.exe').Trim().Trim('"')
    $workbuddyPath = (Read-Host 'Full path to WorkBuddyAI.exe').Trim().Trim('"')
    foreach ($appPath in @($zcodePath, $workbuddyPath)) {
        if (-not (Test-Path -LiteralPath $appPath -PathType Leaf)) { throw "Application not found: $appPath" }
    }
    @{ zcodePath = $zcodePath; workbuddyElectronPath = $workbuddyPath } | ConvertTo-Json | Set-Content -LiteralPath $settingsPath -Encoding UTF8
}
$statePath = Join-Path $bridgeRoot 'state'
$null = New-Item -ItemType Directory -Path $statePath -Force
$userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $statePath /inheritance:r /grant:r "*${userSid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict credential directory permissions.' }
Push-Location $bridgeRoot
try {
    & npm.cmd ci --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
} finally { Pop-Location }
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktopPath 'WorkBuddy ZCode Bridge.lnk'))
$shortcut.TargetPath = Join-Path $bridgeRoot 'Start Bridge.cmd'
$shortcut.WorkingDirectory = $bridgeRoot
$shortcut.Save()
Write-Output 'Desktop shortcut created. Starting bridge and restarting ZCode.'
& (Join-Path $bridgeRoot 'start.ps1')
