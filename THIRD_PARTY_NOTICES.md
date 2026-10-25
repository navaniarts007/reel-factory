# Third-party notices

Reel Factory's own code is MIT (see [LICENSE](LICENSE)). It works with the projects below. **None of their code is
included in this repository**: the skills are downloaded by the app (Settings → Skills) into `vendor/`, and the
libraries and models are installed by `install.ps1`. Each keeps its own licence, which you accept when you download it.

## Skills (downloaded into `vendor/skills/`)

| Skill | Repository | Licence | Copyright |
|---|---|---|---|
| Claude Animation Base (Clawd) | https://github.com/JohnHeibel/ClaudeAnimationBase | MIT | John Heibel |
| Collage B-roll | https://github.com/pyang5166/gbro-collage-broll | MIT | 狗哥笔记 |
| HyperFrames | https://github.com/heygen-com/hyperframes | Apache-2.0 | HeyGen and contributors |
| Lemo Opuscar | https://github.com/lemomo-ai/lemo-opuscar | MIT | LemoLab |
| OneTake | https://github.com/feitangyuan/onetake | PolyForm Noncommercial 1.0.0 | Patrick |

### What Reel Factory takes from them

- **Colour palettes and font choices** in `kit/themes.js` (`hyperframes-*` and `lemo-*` looks) follow the frame
  presets of HyperFrames and the style guides of Lemo Opuscar. They are re-created as plain values in our own code,
  with thanks to those projects. No code, shaders or assets are copied.
- **The OneTake camera** in `kit/engine.js` (every scene on one plane, the camera travelling between them) is our own
  implementation of the idea. No OneTake code is copied, and the `onetake-*` palettes are our own.
- **The guides** in `skills/<id>/` are our own short descriptions written for the script prompt.
- **Clawd** is painted at run time by the downloaded Claude Animation Base kit (`lib/clawd.js` copies it to
  `vendor/clawd-studio/`, outside git). Clawd is associated with Anthropic's Claude; Reel Factory is not made,
  sponsored or endorsed by Anthropic, and the MIT licence of the kit covers its code, not any trademark.

### OneTake is noncommercial only

OneTake's licence allows **noncommercial use only** ("Required Notice: Copyright (c) 2026 Patrick. onetake is free for
noncommercial use only."). In Reel Factory its code runs **only** when you start a OneTake *Studio film*. If your reels
earn money (monetised channel, sponsorships, client work), don't use OneTake Studio films unless you get a commercial
licence from its author. The native OneTake camera look is our own code and is not affected.

## Models

| Model | Licence | Notes |
|---|---|---|
| [Chatterbox Turbo](https://github.com/resemble-ai/chatterbox) (Resemble AI) | MIT | Downloaded from Hugging Face on first run. Adds an inaudible Perth watermark to generated audio. |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) base.en (SYSTRAN, from OpenAI Whisper) | MIT | Downloaded from Hugging Face on first run. |
| Claude (Anthropic) | Anthropic's terms | Used through your own Claude Code sign-in or API key. |
| Gemini image / video models (Google) | Google's terms | Optional, on your own API key. |

## Libraries and tools

| Project | Licence |
|---|---|
| Playwright | Apache-2.0 |
| PyTorch, torchaudio | BSD-3-Clause |
| chatterbox-tts | MIT |
| faster-whisper, CTranslate2 | MIT |
| google-genai | Apache-2.0 |
| NumPy, SciPy | BSD-3-Clause |
| Pillow | MIT-CMU (HPND) |
| requests | Apache-2.0 |
| p5.js (used by the Clawd kit) | LGPL-2.1 |
| p5.brush (used by the Clawd kit) | MIT |
| FFmpeg (installed by you) | LGPL-2.1+ / GPL depending on the build |
| Fonts (Patrick Hand, DM Sans, Inter and others, loaded from Google Fonts) | SIL Open Font License |

## Content you add

- **Wikimedia Commons images** chosen in the Media tab keep their own free licence (CC BY, CC BY-SA, CC0, public
  domain…). The app writes the licence and author into the post copy; keep that credit when you post.
- **Logos, screenshots and photos you upload** must be yours or used with permission. The app never draws brand logos.
- **Your voice:** clone only your own voice, and switch on the platform's AI label when you post a cloned-voice reel.
