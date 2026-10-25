# Reel Factory: instructions for Codex in this folder

Daily vertical (9:16) whiteboard reels for the 365-Day Tech Challenge, in **Indian English** (decided 19 Oct 2026).
The app (`node server.js`) runs the pipeline; read README.md first.

## Rules
- Scripts follow `prompts/style.md`. Change style there, not in code.
- Never voice or render a script the user hasn't approved in the app.
- Clone only the user's own voice. When the clone is used, the user must switch on the AI label when posting.
- Facts, prices and limits must be current: list anything uncertain in `facts_to_check`.
- Visual style lives in `kit/brand.js` and `kit/components.js` (white paper, charcoal marker, one purple accent,
  red only for errors; no gradients, glow, emoji). Never redraw brand logos; use files the user supplies.
- Sync is by construction (py/sync.py): don't hand-edit scene `dur` values after sync.
- Keys live only in `.env`. Never print, read aloud or commit it.
- When `Codex -p` is called by the app it must only return the JSON asked for; it must not use tools.

## Start here
Read HANDOFF.md if it exists (local working notes, not in git: decisions, what's verified, what's next). Run the pipeline with `node cli.js` (see its header) or the app.
Never run `node cli.js approve` unless the user has said the script is approved.
