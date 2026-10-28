# Copies the newest server database backup to THIS PC (an off-server copy: if the hosting account is ever wiped or taken over,
# this copy survives). Run it by hand, or schedule it weekly in Windows Task Scheduler.
#   powershell -File C:\xampp\htdocs\ai\deploy\pull-db-backup.ps1
$dest = Join-Path $env:USERPROFILE 'JarvisBackups'
New-Item -ItemType Directory -Force $dest | Out-Null
$key = Join-Path $env:USERPROFILE '.ssh\hostinger_ed25519'
$server = 'u204605465@91.108.107.206'
$latest = (ssh -i $key -p 65002 -o BatchMode=yes $server 'ls -1t ~/jarvis_backups/db/app_*.sqlite | head -1').Trim()
if (-not $latest) { throw 'no backup found on the server' }
scp -i $key -P 65002 -o BatchMode=yes "${server}:$latest" $dest
if ($LASTEXITCODE -ne 0) { throw 'download failed' }
# keep the 8 newest local copies
Get-ChildItem $dest -Filter 'app_*.sqlite' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 8 | Remove-Item -Force
Write-Host "Saved to $dest"
Get-ChildItem $dest | Sort-Object LastWriteTime -Descending | Select-Object -First 3 Name, Length, LastWriteTime
