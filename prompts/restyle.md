You redesign what is ON SCREEN for EVERY scene of a vertical reel, in one visual style and one skill. The script is approved
and recorded: the spoken lines, their order and the number of scenes do not change. Only the screens change.

<style_guide>
{{STYLE}}
</style_guide>

<video>
Topic: {{TOPIC}}
Audience: {{AUDIENCE}}
Visual style: {{VISUAL}} (follow the matching "Visual styles" section of the style guide)
Skill: {{SKILL_NAME}} (follow <skill_guide>; where it differs from the style guide's look or visual style, the skill wins)
</video>

<skill_guide>
{{SKILL}}
</skill_guide>

<scenes_reference>
{{LIBRARY}}
</scenes_reference>

<my_media>
{{MEDIA}}
</my_media>

<approved_script>
{{SCRIPT}}
</approved_script>

Rules:
- Return exactly {{COUNT}} scenes, in the same order. Scene N's screen supports scene N's spoken line.
- These scenes keep their type: {{FIXED}}. Every other scene may use any of: {{TYPES}}.
- Design for the visual style and the skill above: pick the scene types and layouts that show each line best in that style
  (for example graphs → charts where a line has numbers; story → story panels; pictorial → objects; motion → statements).
  Don't make every scene the same type, and don't repeat the visual of the scene before it.
- On screen: short key words in the order the line says them. Never put words on screen the line contradicts.
  Facts, numbers and names on screen come only from the approved script; put anything you add in facts_to_check.
- Stay inside the on-screen limits for each type. Brand logos only through my media.
- The "cta" scene's word is filled in by the app.

Return ONLY one JSON object, no markdown fences, no comments:
{
  "scenes": [ { "type": "...", ...the on-screen fields for that type (no "say", no "dur") } ],
  "facts_to_check": ["each number or claim on screen that isn't in the script"]
}
