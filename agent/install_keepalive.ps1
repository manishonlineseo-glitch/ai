<#
  Keeps the Jarvis laptop agent running. Run it ONCE yourself, as your normal user (no admin needed):

      powershell -ExecutionPolicy Bypass -File C:\xampp\htdocs\ai\agent\install_keepalive.ps1

  It creates ONE per-user Scheduled Task, "JarvisAgent KeepAlive":
    * starts JarvisAgent.exe when you sign in to Windows;
    * every 5 minutes checks again and starts it if it is not running (the app refuses a second copy by itself, so this is safe);
    * if the task fails it is restarted (up to 99 times, 1 minute apart); no time limit; also runs on battery.

  Options
    -DryRun          only builds and prints the task, changes nothing (used by the tests)
    -NoSleepOnPower  ALSO sets "never sleep" and "lid close = do nothing" while plugged in (changes your power plan; asks you to type YES)
    -Remove          deletes the task again
    -Exe <path>      where JarvisAgent.exe is (default C:\JarvisAgent\JarvisAgent.exe)

  Why this is needed: a laptop that sleeps, or an app that was closed, is an offline agent. While the agent runs on mains power it
  already asks Windows not to sleep; the lid and a closed app are what this task and -NoSleepOnPower cover.
#>
param(
    [string]$Exe = 'C:\JarvisAgent\JarvisAgent.exe',
    [switch]$DryRun,
    [switch]$NoSleepOnPower,
    [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$name = 'JarvisAgent KeepAlive'

if ($Remove) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed the task '$name'."
    return
}
if (-not $DryRun -and -not (Test-Path $Exe)) { throw "JarvisAgent.exe not found at $Exe (use -Exe <path>)" }

$action = New-ScheduledTaskAction -Execute $Exe
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$every5 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

if ($DryRun) {
    Write-Host "DRYRUN task '$name': run '$Exe' at logon and every 5 minutes as $env:USERNAME (interactive, not elevated), restart 99 x 1 min, no time limit"
} else {
    Register-ScheduledTask -TaskName $name -Action $action -Trigger @($atLogon, $every5) -Settings $settings -Principal $principal -Force | Out-Null
    Write-Host "Task '$name' created. It starts Jarvis at sign-in and every 5 minutes if it is not running."
}

if ($NoSleepOnPower) {
    Write-Host ''
    Write-Host 'This will change your Windows power plan: while PLUGGED IN the laptop will never sleep and closing the lid will do nothing.'
    if ($DryRun) {
        Write-Host 'DRYRUN: would run powercfg /change standby-timeout-ac 0 and set the lid action (plugged in) to 0.'
    } elseif ((Read-Host 'Type YES to apply') -eq 'YES') {
        powercfg /change standby-timeout-ac 0
        powercfg /change hibernate-timeout-ac 0
        powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
        powercfg /setactive SCHEME_CURRENT
        Write-Host 'Done. Undo any time in Settings > System > Power.'
    } else {
        Write-Host 'Skipped.'
    }
}
