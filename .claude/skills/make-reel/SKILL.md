---
name: make-reel
description: Make today's reel with the Reel Factory pipeline — write the script, wait for the user's approval, generate voice, sync, render, check, write posts, export to the Day folder. Use when the user asks for today's video, a reel about a topic, "next from calendar", or to fix/rebuild a Day.
---
# Make a reel

1. `node cli.js status` to see the next Day number and existing Days.
2. Script: `node cli.js new "<topic>" "<notes>"` or `node cli.js new --calendar`. Show the user `Day N/work/script.txt`,
   the hook score and the facts to verify. Check facts against official sources and tell the user what you verified.
3. Wait for the user to approve (in the app, or by telling you). Only then: `node cli.js approve N`.
4. `node cli.js run N` (voice → sync → render → checks → copy). Then look at `Day N/work/build/sheet.png` yourself for clipped or
   overlapping text and read `checks.json`. Fix a scene by editing `Day N/work/timeline.json` (on-screen text or `say`), then
   `node cli.js run N voice sync render checks` — only changed scenes re-render.
5. Tell the user to preview `Day N/work/build/final.mp4`. After they're happy: `node cli.js run N export`.
6. If the AI clone was used, remind them to switch on the AI/altered-content label when posting.
Style rules: `prompts/style.md` (Indian English). Visual rules: CLAUDE.md. Never invent facts.
