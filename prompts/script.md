You write the script and scene plan for one vertical whiteboard reel. Follow the style guide exactly.

<style_guide>
{{STYLE}}
</style_guide>

<video>
Day: {{DAY}}
Topic: {{TOPIC}}
Audience: {{AUDIENCE}} (follow the matching "Audiences" section of the style guide)
Visual style: {{VISUAL}} (follow the matching "Visual styles" section of the style guide)
Skill: {{SKILL_NAME}} (follow <skill_guide>; where it differs from the style guide's look or visual style, the skill wins)
Notes from me: {{NOTES}}
Recent hooks (do not reuse their wording): {{RECENT_HOOKS}}
</video>

<skill_guide>
{{SKILL}}
</skill_guide>

<scene_library>
Each scene is one component. Text on screen is SHORT (a few words); the full sentence goes in "say" (what I speak).
Limits keep text readable on a phone: stay inside them.

- hello: { "type":"hello", "text"?: "HELLO GUYS!", "sub"?: "Day N · 365-Day Tech Challenge" (≤ 34 chars) }
- hook: { "type":"hook", "title": big word(s) ≤ 14 chars, UPPERCASE, "title2"?: ≤ 18 chars, "sub"?: ≤ 40 chars }
- list: { "type":"list", "title": ≤ 22 chars UPPERCASE, "items": 2–5 of "text" or {"text","sub"} (text ≤ 30 chars, sub ≤ 40), "marker"?: "number"|"dot", "highlight"?: [index] }
- checklist: same as list, with purple ticks (good for "what you need", "tricks")
- flow: { "type":"flow", "title": ≤ 22 chars, "steps": 2–5 of "text" or {"text","sub"} (text ≤ 30 chars, sub ≤ 40) } — a process, top to bottom
- terminal: { "type":"terminal", "title": ≤ 22 chars, "lines": 2–6 of "$ command" or "# comment" (≤ 44 chars each, real commands only), "highlight"?: index, "note"?: ≤ 30 chars }
- compare: { "type":"compare", "left": ≤ 12 chars, "right": ≤ 12 chars, "rows": 2–5 of [left, right] (each ≤ 14 chars), "caption"?: ≤ 24 chars, "versus": true for two options side by side; false to mark rows that differ in red }
- cta: { "type":"cta", "ask": ≤ 30 chars question, "word": the KEYWORD, "note"?: ≤ 28 chars }
- takeaway: { "type":"takeaway", "headline": ≤ 34 chars, "items": 2–3 points (≤ 28 chars each) }
- bye: { "type":"bye", "sub"?: ≤ 30 chars }
- statement: { "type":"statement", "lines": 1–4 punchy lines (≤ 16 chars each), "accent"?: index of the key line, "sub"?: ≤ 40 chars } — kinetic type: lines punch in one by one. For a key idea, a surprising fact or a twist.
- chart: { "type":"chart", "title": ≤ 22 chars, "bars": 2–5 of {"label": ≤ 24 chars, "value": number, "note"?: ≤ 34 chars}, "unit"?: e.g. "%" or " ms", "highlight"?: bar index, "caption"?: ≤ 26 chars } — hand-drawn bars grow and count up. Only real numbers you are sure of (list each in facts_to_check); no numbers → use compare instead.
- story: { "type":"story", "title"?: ≤ 22 chars, "beats": 2–4 of {"icon": "person"|"book"|"bulb"|"laptop"|"database"|"chat"|"clock"|"cloud", "text": ≤ 26 chars, "sub"?: ≤ 34 chars}, "highlight"?: beat index (the twist) } — comic-strip panels for a story: set-up, problem, twist.

- image: { "type":"image", "media": an id from <my_media>, "title"?: ≤ 22 chars, "callouts"?: 0–3 of {"spot": a spot name of that image, "label": ≤ 18 chars, "word": the word in this scene's "say" when the arrow should land}, "zoom"?: a spot name to zoom into, "zoomWord"?: the word when the zoom starts, "caption"?: ≤ 30 chars } — shows one of MY real images in a hand-drawn frame; arrows land on marked spots exactly when I say "word". Only ids and spots from <my_media>.
- objects: { "type":"objects", "title"?: ≤ 22 chars, "items": 1–4 of {"obj": one of container|ship|computer|laptop|server|cloud|database|phone|person|team|robot|document|folder|book|lock|key|shield|globe|rocket|gear|code|terminal|package|mail|coin|clock|chart|bug|bulb|plug|wifi, "label": ≤ 14 chars, "word": the word in this scene's "say" when it pops in}, "flow"?: false to hide the arrows between items, "move"?: {"obj": an object name, "from": item index, "to": item index, "word": when it travels}, "caption"?: ≤ 30 chars } — picture-like hand-drawn objects pop in exactly as I say their word, arrows with a moving dot show the flow; "move" sends a small object from one item to another (e.g. a container from a laptop to the cloud). Items in the order I say them.
{{SKILL_LIBRARY}}
- Any scene with a "title" may also have "logo": the id of a logo from <my_media> (shown beside the title).

Every scene also has "say": my spoken lines for that scene (2–3 short sentences, Indian English, per the style guide).
Order: hello, hook, (optional story as a list or flow), 3–6 explain scenes, (terminal if it's a tool), cta, takeaway, bye.
Aim for 10–12 scenes and 140–190 spoken words in total.
</scene_library>

<my_media>
{{MEDIA}}
</my_media>
Use my images where they help most: each screenshot, photo or diagram in at most one "image" scene whose "say" talks about
what it shows (name the spots in the words, so the arrows land as I say them); logos beside the title they belong to.

Return ONLY one JSON object, no markdown fences, no comments:
{
  "title": "short video title",
  "keyword": "ONE_UPPERCASE_WORD for the comment CTA",
  "dm_offer": "what I send to people who comment the keyword",
  "facts_to_check": ["each factual claim, price, limit or version used, so I can verify it"],
  "scenes": [ { "type": "hello", "sub": "...", "say": "..." }, ... ]
}
