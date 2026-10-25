# Reel Factory one-time setup for Windows. Run from this folder:
#   powershell -ExecutionPolicy Bypass -File install.ps1
# Takes 10-20 minutes the first time (downloads PyTorch for your RTX 3050 and the voice model).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
function Step($t) { Write-Host "`n== $t ==" -ForegroundColor Magenta }
function Need($cmd, $hint) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Write-Host "Missing: $cmd. $hint" -ForegroundColor Red; exit 1 } }

Step "Checking tools"
Need node   "Install with: winget install OpenJS.NodeJS.LTS  (then reopen PowerShell)"
Need ffmpeg "Install with: winget install Gyan.FFmpeg  (then reopen PowerShell)"
Need git    "Install with: winget install Git.Git  (the voice model installs one part from GitHub)"
# Python 3.11 or 3.12 (the voice model is tested on 3.11)
$py = $null
foreach ($v in @("3.11", "3.12")) {
  try { $exe = (& py "-$v" -c "import sys; print(sys.executable)" 2>$null); if ($LASTEXITCODE -eq 0 -and $exe) { $py = $exe.Trim(); break } } catch {}
}
if (-not $py) {
  Need python "Install with: winget install Python.Python.3.11"
  $py = (& python -c "import sys; print(sys.executable)").Trim()
}
Write-Host ("node " + (node -v) + " · " + (& $py --version) + " · ffmpeg ok")
if (Get-Command claude -ErrorAction SilentlyContinue) { Write-Host "Claude Code found: scripts will use your Claude subscription." }
else { Write-Host "Claude Code not found. Install it, or set an API key and pick 'Anthropic API key' in Settings." -ForegroundColor Yellow }

Step "Node packages (renderer)"
npm install --no-fund --no-audit
npx playwright install chromium

Step "Python environment (.venv)"
if (-not (Test-Path ".venv")) { & $py -m venv .venv }
$vpy = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
& $vpy -m pip install --upgrade pip
Write-Host "PyTorch with CUDA for the RTX 3050 (about 2.5 GB download)…"
& $vpy -m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124
& $vpy -m pip install chatterbox-tts faster-whisper scipy requests google-genai pillow

Step "Checking the GPU and loading the voice model once (downloads it)"
& $vpy py\check_gpu.py

Step "Daily 7:00 run (Windows Task Scheduler)"
$node = (Get-Command node).Source
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$PSScriptRoot\run-daily.js`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Daily -At 7:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "Reel Factory daily script" -Action $action -Trigger $trigger -Settings $settings -Description "Writes the day's reel script at 7:00 (or at the next start if the laptop was off)." -Force | Out-Null
Write-Host "Scheduled: every day at 7:00; if the laptop is off, it runs at the next start."

Step "Done"
Write-Host "Start the app:  double-click start.bat  (or: node server.js)" -ForegroundColor Green
Write-Host "First time: open Settings in the app and record your 10-second voice reference."
