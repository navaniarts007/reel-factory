# Reel Factory

**One topic in, one ready-to-post vertical tech reel out.** Claude writes the script in your style, a local AI model
speaks it in your own (cloned) voice, and a hand-drawn whiteboard video is rendered in sync with the voice, frame
by frame. You also get posting copy for YouTube Shorts, Instagram, X and LinkedIn.

It was built for a "365-Day Tech Challenge" (one 9:16 reel a day, in Indian English), and everything that makes it
*mine* is in plain text files you can change: the voice, the style guide, the brand and the topic calendar.

Runs on a Windows laptop with a 4 GB NVIDIA GPU. The voice, timing and captions run offline and free; the script
uses your Claude Code subscription.

---

## What it does

- **Script:** Claude writes the script and the scene plan, scores the hook (it rewrites anything below 7/10) and lists
  any facts you should check. You edit any line, then press **Approve**. Nothing is voiced before you approve.
- **Voice:** Chatterbox Turbo clones your voice from a 10-second clip, one clip per scene. Whisper reads every clip back
  and a bad take is made again. Or record yourself: if you fluff a line, just pause and say the whole sentence again;
  the last good take is kept.
- **Exact sync:** each scene lasts exactly as long as its voice clip, rounded to whole frames (60 fps, 48 kHz audio =
  800 samples per frame). The checks confirm it before you see anything.
- **Video:** a whiteboard engine (white paper, charcoal marker, one accent colour), with burned-in word-by-word captions,
  sound effects and optional background music. Only changed scenes are rendered again.
- **Visual styles and looks:** 5 visual styles (whiteboard, motion graphics, graphs, story, pictorial) × looks from
  optional open-source skills. Tick the ones you want and the app previews each version with the same words and voice;
  you pick one.
- **Media:** upload your own screenshots, photos and screen recordings (videos play inside a scene). After approval the
  app suggests a picture for each scene that needs one: free-licence Wikimedia Commons images, credited automatically,
  or a Gemini picture when you press the button.
- **Posts:** titles, descriptions, captions and hashtags, checked against each platform's limits.
- **Content calendar:** a month and list view of your topic queue; tick topics done or undone. A daily 7:00 task writes
  the next topic's script so it's waiting for you.
- **💬 Assistant:** a chat panel (Claude Code) that can do anything in the app for you: read, create, edit, delete or run
  a step. It never reads your keys and only approves a script when you tell it to.

## What you need

| | |
|---|---|
| OS | Windows 10 or 11 (the installer and scripts are written for Windows) |
| GPU | NVIDIA with 4 GB+ memory (tested on an RTX 3050 Laptop 4 GB) for the voice model |
| RAM / disk | 16 GB RAM recommended · about 15 GB free disk (PyTorch, voice model, browser) |
| Software | [Node.js](https://nodejs.org) 20+, [Python](https://www.python.org) 3.11 or 3.12, [FFmpeg](https://ffmpeg.org), [Git](https://git-scm.com) |
| Script writer | [Claude Code](https://claude.com/claude-code), signed in with a Claude subscription (or an Anthropic API key) |
| Optional | A Gemini API key **with billing on**, for Gemini pictures and B-roll clips (the free tier allows no image or video generation) |

Install the software with winget if you don't have it:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.12
winget install Gyan.FFmpeg
winget install Git.Git
npm install -g @anthropic-ai/claude-code
```

Close and reopen PowerShell afterwards, then run `claude` once to sign in.

## Install (once, about 20 minutes)

```powershell
git clone https://github.com/navaniarts007/reel-factory.git
cd reel-factory
powershell -ExecutionPolicy Bypass -File install.ps1
```

The installer:
- installs the renderer (Playwright + Chromium);
- creates `.venv` with PyTorch for CUDA 12.4, Chatterbox, faster-whisper and google-genai;
- downloads the voice model (about 4 GB) and checks it fits on your GPU;
- schedules the daily 7:00 script task.

Then:

1. Double-click **start.bat**. The app opens at http://localhost:5757.
2. **Settings → Record reference clip**: about 10 seconds in your normal video tone, in a quiet room, mic close to your mouth.
3. Optional: copy `.env.example` to `.env` and add your keys. Never share or commit `.env`.
4. Optional: **Settings → Skills** to download the extra looks (see [Skills](#skills)).

Day folders (`Day 1`, `Day 2`…) are created **next to** the `reel-factory` folder (change `daysRoot` in `config.json`).

If anything fails, open Claude Code in the folder and say "check everything": the `finish-setup` skill checks and fixes
each part of the install.

## Make it yours

| Change | Where |
|---|---|
| How you talk, the structure of every video, your catchphrases | `prompts/style.md` |
| Colours, fonts, stroke, caption bar | `kit/brand.js` |
| Other looks | `kit/themes.js` |
| Topic queue and the repeating 14-day pattern | the **Calendar** page (saved in `data/calendar.json`) |
| Platform limits (hashtags, lengths) | `data/limits.json` |
| Voice model, temperature, fps, captions, music volume | **Settings** (saved in `config.json`) |

`prompts/style.md` is written for my own challenge ("Hello guys! Day N of my 365-Day Tech Challenge!"): rewrite it
in your words first.

## Every day

| Step | Who | What happens |
|---|---|---|
| 1. Script | app (7:00, or **Write the script**) | Claude writes the script and scenes from the next calendar topic |
| 2. Approve | **you** | Edit any line or on-screen text, then **Approve** |
| 3. Media | **you** | Accept, upload or skip the suggested pictures |
| 4. Voice and sync | app | Voice per scene (clone or your recording), then frame-exact sync |
| 5. Versions (optional) | **you** | Tick styles and looks, preview them, **Use this version** |
| 6. Render | app | Video, automatic checks, posting copy |
| 7. Export | **you** | Saves `dayN-<title>.mp4`, the copy, the script and a contact sheet into the Day folder |

Everything can also be run from the command line: see the header of `cli.js`.

## Skills

The extra looks come from open-source projects. They are **not included** in this repo; **Settings → Skills**
downloads each one into `vendor/skills/` from its own repository, under its own licence:

| Skill | Repository | Licence |
|---|---|---|
| HyperFrames | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | Apache-2.0 |
| OneTake | [feitangyuan/onetake](https://github.com/feitangyuan/onetake) | PolyForm Noncommercial: noncommercial use only |
| Collage B-roll | [pyang5166/gbro-collage-broll](https://github.com/pyang5166/gbro-collage-broll) | MIT |
| Claude Animation Base (Clawd) | [JohnHeibel/ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase) | MIT |
| Lemo Opuscar | [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) | MIT |

The native looks in `kit/` are this project's own code. The OneTake camera in `kit/engine.js` is a fresh implementation
and copies no OneTake code. "Studio films" (an agent building a whole film with a skill's own tools) run the skill's
code, so its licence applies to that film. Clawd is drawn by the MIT Claude Animation Base kit; Reel Factory isn't
made or endorsed by Anthropic. Credits and licence details: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## AI models used

| Model | For | Runs |
|---|---|---|
| Claude (via Claude Code) | Scripts, version designs, image suggestions, the assistant | Your Claude account |
| [Chatterbox Turbo](https://github.com/resemble-ai/chatterbox) (Resemble AI, MIT) | Voice clone | Locally on the GPU |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) base.en | Checking every spoken word, caption timing | Locally on the CPU |
| Gemini 2.5 Flash Image / Gemini Omni Flash | Optional pictures and B-roll clips | Google, paid, only when you press the button |

## Use it responsibly

- **Clone only your own voice.** When you post a reel made with the cloned voice, switch on the platform's AI or
  altered-content label (the Export tab reminds you). Chatterbox also adds an inaudible watermark to its audio.
- **Check the facts.** Claude lists anything uncertain under "facts to check"; verify prices, limits and versions
  before you post.
- **Logos and images:** the app never draws brand logos. Use files you have the right to use; Commons images keep
  their licence and credit, and Gemini pictures are marked AI-generated.
- **Costs:** Gemini calls are billed to your key and only run when you press the button.

## Project layout

```
reel-factory/
  server.js            the app (http://localhost:5757)
  cli.js               the same pipeline from the command line
  run-daily.js         the 7:00 run: next calendar topic → script, then waits for your approval
  render.js            renders a Day folder; one cached segment per scene
  lib/                 pipeline steps, versions (gallery.js), suggestions, assistant (chat.js), skills, media
  py/                  tts.py (voice), sync.py (frame-exact timing), captions.py, broll.py, genimage.py
  kit/                 the video kit: brand, engine, components, themes, sound effects, clean_voice.py
  prompts/             style guide and all prompts: edit these to change how scripts are written
  skills/              this project's guide for each skill (the skills themselves download into vendor/)
  web/index.html       the app's page
  data/                calendar, platform limits
  docs/CHATBOT.md      what the 💬 assistant knows and is allowed to do
Day N/                 (next to reel-factory)
  dayN-<title>.mp4, -copy.md, -script.txt, -sheet.png
  work/                timeline, voice clips, voice.wav, media, versions, build cache, logs
```

## Troubleshooting

- **"Could not start Claude Code"**: run `claude` once in a terminal to sign in, or switch to the API in Settings.
- **Voice model crashed while loading (exit 3221225477)**: usually low memory. Close Chrome tabs and other big apps
  and press Generate voice again; the app already retries once.
- **CUDA out of memory**: close other GPU apps.
- **Gemini says free tier**: turn on billing for the key in Google AI Studio, or skip Gemini; everything else works without it.
- **Font looks plain**: the fonts load from Google Fonts, so render while online.
- **Long-path errors when downloading HyperFrames**: the app enables Git long paths for it; if it still fails, run
  `git config --global core.longpaths true`.

## License

[MIT](LICENSE) for this project's code. Downloaded skills, models and libraries keep their own licences: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
