# Reinstall/update the bridge keepalive scheduled task.
# Usage: powershell.exe -NoProfile -ExecutionPolicy Bypass -File install-task.ps1
# Generates the task XML at runtime (no machine-specific file is committed),
 # registering as the current user without elevation via schtasks.
$ErrorActionPreference = 'Stop'
$keepaliveRoot = $PSScriptRoot
$taskName = 'WorkBuddyZCode-BridgeKeepalive'

$nodePath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodePath) { throw 'node.exe was not found on PATH. Install Node.js 22+ first.' }
$keepaliveScript = Join-Path $keepaliveRoot 'keepalive.mjs'
if (-not (Test-Path -LiteralPath $keepaliveScript)) { throw "keepalive.mjs not found: $keepaliveScript" }

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$userSid = $identity.User.Value
$userName = $identity.Name
$escScript = $keepaliveScript.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')
$escNode = $nodePath.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')
$escUser = $userName.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')
$now = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Date>$now</Date>
    <Author>$escUser</Author>
    <URI>\$taskName</URI>
    <Description>Keeps the WorkBuddy local bridges (see bridges.json) running and the ZCode provider model lists in sync.</Description>
  </RegistrationInfo>
  <Principals>
    <Principal id="Author">
      <UserId>$userSid</UserId>
      <LogonType>InteractiveToken</LogonType>
    </Principal>
  </Principals>
  <Settings>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <ExecutionTimeLimit>PT10M</ExecutionTimeLimit>
    <IdleSettings>
      <Duration>PT10M</Duration>
      <WaitTimeout>PT1H</WaitTimeout>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
  </Settings>
  <Triggers>
    <TimeTrigger>
      <StartBoundary>$now</StartBoundary>
      <Repetition>
        <Interval>PT5M</Interval>
      </Repetition>
    </TimeTrigger>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>$escUser</UserId>
    </LogonTrigger>
  </Triggers>
  <Actions Context="Author">
    <Exec>
      <Command>$escNode</Command>
      <Arguments>"$escScript"</Arguments>
    </Exec>
  </Actions>
</Task>
"@

$xmlPath = Join-Path $env:TEMP "$taskName.xml"
[System.IO.File]::WriteAllText($xmlPath, $xml, [System.Text.Encoding]::Unicode)
try {
    schtasks.exe /Create /TN $taskName /XML "$xmlPath" /F
    if ($LASTEXITCODE -ne 0) { throw "schtasks failed with exit code $LASTEXITCODE" }
} finally {
    Remove-Item -LiteralPath $xmlPath -Force -ErrorAction SilentlyContinue
}
Write-Output "Scheduled task '$taskName' installed (every 5 minutes + at logon; node: $nodePath)."
