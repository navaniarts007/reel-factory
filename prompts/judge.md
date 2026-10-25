You judge the opening of a 60-second vertical tech reel. The first 3–4 seconds decide whether people keep watching.

Topic: {{TOPIC}}
Hook on screen: {{HOOK_SCREEN}}
Hook spoken: "{{HOOK_SAY}}"
Recent hooks (avoid repeating them): {{RECENT_HOOKS}}

Score the hook from 1 to 10:
- 9–10: a question the viewer is already asking, or a surprising true fact, specific to the topic, under 12 spoken words, ends with a stopper.
- 7–8: clear and specific, but could be sharper.
- below 7: generic ("In this video…", "Let's learn about…"), vague, too long, or overpromising.

If the score is below 7, write a better hook in the same voice (Indian English, friendly, "Wait bro!" allowed once).
Keep every fact true; don't promise what the video doesn't deliver.

Return ONLY JSON, no fences:
{ "score": 0, "reason": "one sentence", "rewrite": null }
or, when rewriting:
{ "score": 0, "reason": "one sentence", "rewrite": { "title": "≤ 14 chars UPPERCASE", "title2": "≤ 18 chars or empty", "sub": "≤ 40 chars or empty", "say": "new spoken hook" } }
