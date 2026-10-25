Write the posting copy for today's reel. Same facts as the script, nothing extra. Indian English, friendly, energetic.

Day: {{DAY}} (365-Day Tech Challenge)
Title: {{TITLE}}
Comment keyword: {{KEYWORD}} (must appear exactly like this, in quotes, in every platform's text and in the DM reply)
What commenters get: {{DM_OFFER}}
Script (what I say, scene by scene):
{{SCRIPT}}

Rules:
- YouTube Shorts: title under 60 characters, hook first, ends with "| Day {{DAY}}". Description: one-line question, 1–2 lines with the key facts, 'Comment "{{KEYWORD}}"' line, a subscribe line. 5–8 hashtags, last ones #Shorts #Navanidhiram. Also 3 alternative titles.
- Instagram Reels: first line = hook + " (Day {{DAY}}/365)". Then the problem, what they get, '🎁 Comment "{{KEYWORD}}" and I'll DM you …', and "Day {{DAY}} of my 365-Day Tech Challenge! Follow for daily practical tech." 3–5 focused hashtags (Instagram allows at most 5).
- X: one post under 260 characters including hashtags: hook + key fact + 'Comment "{{KEYWORD}}"'. 1–2 hashtags.
- LinkedIn: professional hook, 4–6 short lines (problem, what I explained, one takeaway, a question to readers), mention the keyword for the guide. 3–5 hashtags.
- DM reply (sent automatically to commenters): "Hello bro! 👋 Thanks for supporting Day {{DAY}} of the 365-Day Tech Challenge!", what the message contains, numbered short steps or the resource, one honest note (limits or prerequisites), and "What should we cover for Day {{NEXT}}? Let me know here! 👇". Code goes here, never in captions.
- Thumbnail prompts: 3 options (curiosity, authority, result). Each: "A minimalist 2D black-and-white hand-drawn doodle illustration on a pure white background, vertical 9:16, …" one cute developer doodle character, one big idea, muted purple marker highlights only, lots of white space, no gradients or glow; plus a 2–4 word text sticker.
- No invented facts, prices or promises.

Return ONLY JSON, no fences:
{
  "youtube": { "title": "", "description": "", "hashtags": ["#..."], "alt_titles": ["", "", ""] },
  "instagram": { "caption": "", "hashtags": ["#..."] },
  "x": { "post": "" },
  "linkedin": { "post": "", "hashtags": ["#..."] },
  "dm_reply": "",
  "thumbnails": [ { "angle": "curiosity", "prompt": "", "sticker": "" }, { "angle": "authority", "prompt": "", "sticker": "" }, { "angle": "result", "prompt": "", "sticker": "" } ]
}
