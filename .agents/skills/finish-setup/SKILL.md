---
name: finish-setup
description: Verify and fix the Reel Factory install on this Windows laptop (Node, ffmpeg, Python venv, PyTorch CUDA, Chatterbox on the RTX 3050, Whisper, Playwright, Codex headless, scheduled task). Use when the user says setup, install, "check everything", or something in the pipeline fails to start.
---
# Finish and verify setup

Work through these in order; fix each failure before moving on, then report a short table: check, result, fix applied.

1. Tools: `node -v`, `ffmpeg -version`, `git --version`, `.venv\Scripts\python.exe --version` (3.11 or 3.12).
   If `.venv` is missing or broken, re-run `powershell -ExecutionPolicy Bypass -File install.ps1`.
2. GPU: `nvidia-smi`, then `.venv\Scripts\python.exe -c "import torch;print(torch.__version__, torch.cuda.is_available())"`.
   Must print a `+cu124` build and `True`. If it's a CPU build: `.venv\Scripts\python.exe -m pip install --force-reinstall torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124`.
3. Voice model: `.venv\Scripts\python.exe py\check_gpu.py`. Peak GPU memory must stay under 4 GB.
   Out of memory → set Nano in `config.json` (`"voice": {"model": "nano"}`) and say so.
4. Whisper: `.venv\Scripts\python.exe -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8'); print('ok')"`.
5. Renderer: `npx playwright install chromium`, then `node render.js "<a Day work folder>" --preview-only` if one exists.
6. Script writer: `Codex -p "Reply with only: OK" --output-format json` must return a result. If not signed in, ask the user to run `Codex` once.
7. Scheduled task: `Get-ScheduledTask -TaskName "Reel Factory daily script"` exists.
8. Reference clip: `voice\reference.wav` exists (else tell the user: app → Settings → Record reference clip).
Never read or print `.env`.
