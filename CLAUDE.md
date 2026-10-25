# Reel Factory: instructions for Claude Code in this folder

Daily vertical (9:16) whiteboard reels for the 365-Day Tech Challenge, in **Indian English** (decided 19 Oct 2026).
The app (`node server.js`) runs the pipeline; read README.md first.

## Rules
- Scripts follow `prompts/style.md`. Change style there, not in code.
- Never voice or render a script the user hasn't approved in the app.
- Clone only the user's own voice. When the clone is used, the user must switch on the AI label when posting.
- Facts, prices and limits must be current: list anything uncertain in `facts_to_check`.
- Visual style lives in `kit/brand.js` and `kit/components.js`. Whiteboard is the default look (white paper, charcoal marker,
  one purple accent, red only for errors; no gradients, glow, emoji). Other skills (`skills/<id>`, decided 20 Oct 2026) use
  their own look from `kit/themes.js`. Never redraw brand logos; use files the user supplies. Exception: Clawd, drawn by the
  MIT Claude Animation Base kit; never suggest Anthropic made or endorses the reel.
- OneTake (vendor/skills/onetake) is PolyForm Noncommercial: only Studio films run its code. The native OneTake camera
  (kit/engine.js) is our own code; never copy OneTake code into the kit.
- Collage B-roll stills and clips are paid Gemini calls on the user's GEMINI_API_KEY: only when the user presses the button.
- Sync is by construction (py/sync.py): don't hand-edit scene `dur` values after sync.
- Keys live only in `.env`. Never print, read aloud or commit it.
- When `claude -p` is called by the app it must only return the JSON asked for; it must not use tools.
  Two exceptions: a Studio film (lib/studio.js): the user starts it, and Claude Code runs with tools only inside
  `<day>/work/studio/<skill>/`, on an approved script; and the app's 💬 assistant (lib/chat.js, decided 21 Oct 2026):
  Claude Code with tools in this folder, guided by docs/CHATBOT.md, `.env` denied; it approves only when the user says so.
- Versions (lib/gallery.js): after approval the user ticks visual styles and skill looks; only those versions are
  designed and previewed, with the same words and voice (nothing is built automatically; decided 21 Oct 2026).
  Picking a version ("Use this version") is the user's approval of its screens.
- Image suggestions (lib/suggest.js): Wikimedia Commons images only with a free licence, credited in the copy; Gemini
  pictures only on the user's button press, never logos or screenshots, marked AI-generated.

## Start here
Read HANDOFF.md if it exists (local working notes, not in git: decisions, what's verified, what's next). Run the pipeline with `node cli.js` (see its header) or the app.
Never run `node cli.js approve` unless the user has said the script is approved.
