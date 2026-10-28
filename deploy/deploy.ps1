# Run from anywhere:  powershell -File C:\xampp\htdocs\ai\deploy\deploy.ps1
# Pushes the current branch to GitHub, then tells the server to pull it and update the live site.
param([switch]$Force)
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
if (git status --porcelain) { Write-Warning 'Uncommitted changes are NOT deployed. Commit them first.' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'git push failed' }
$key = Join-Path $env:USERPROFILE '.ssh\hostinger_ed25519'
$env = if ($Force) { 'FORCE=1 ' } else { '' }
$cmd = 'cd ~/jarvis_repo 2>/dev/null || git clone --quiet https://github.com/manishonlineseo-glitch/ai.git ~/jarvis_repo && cd ~/jarvis_repo && git fetch --quiet origin main && git reset --hard --quiet origin/main && ' + $env + 'bash deploy/server-update.sh'
ssh -i $key -p 65002 -o BatchMode=yes u204605465@91.108.107.206 $cmd
if ($LASTEXITCODE -ne 0) { throw 'server update failed' }
# The owner's content rules are private business text: not in git (public repo), copied straight to the live site.
$rules = Join-Path $repo 'server\contentules.md'
if (Test-Path $rules) {
    scp -i $key -P 65002 -o BatchMode=yes $rules "u204605465@91.108.107.206:domains/udaypurgroup.in/public_html/ai/content/rules.md"
    if ($LASTEXITCODE -ne 0) { throw 'copying content rules failed' }
    Write-Host 'Content rules copied.'
}
