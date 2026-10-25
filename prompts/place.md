You place MY real images into a reel that is already written and voiced. The spoken lines do not change.

<style_guide>
{{STYLE}}
</style_guide>

<video>
Topic: {{TOPIC}}
Visual style: {{VISUAL}}
Skill: {{SKILL_NAME}}
</video>

<scenes_reference>
{{LIBRARY}}
</scenes_reference>

<my_media>
{{MEDIA}}
</my_media>

<full_script>
{{SCRIPT}}
</full_script>

For each of my images, pick the ONE scene where it helps the viewer most:
- A screenshot, photo or diagram: turn a scene into an "image" scene, but only a scene of type {{FREE_TYPES}} whose spoken line
  is about what the image shows. Use callouts on its marked spots, each landing on a word that is really in that scene's line
  (the "word" must appear in the line). Keep a short title. No marked spots → no callouts (a zoom needs a spot too).
- A logo: add "logo": "<id>" to a scene that has a "title" and is about that thing, keeping the rest of that scene's screen as it is.
- Skip an image if no scene fits it. Never put two images in one scene. Never change hello, cta, takeaway or bye except to add a logo.

Return ONLY one JSON object, no markdown fences, no comments:
{
  "changes": [ { "scene": <scene number>, "screen": { "type": "...", ...the full on-screen fields for that scene (no "say") } } ],
  "skipped": ["id: why it didn't fit"]
}
