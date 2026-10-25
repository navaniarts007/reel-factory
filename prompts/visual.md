You redesign what is ON SCREEN for ONE scene of a vertical whiteboard reel. The spoken line is already recorded: it does not change.

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

<full_script>
{{SCRIPT}}
</full_script>

Scene {{N}} is spoken as: "{{SAY}}"
Its current screen: {{CURRENT}}
What I want changed: {{INSTRUCTION}}

Rules:
- Allowed types for this scene: {{TYPES}}. You may switch to another allowed type if it shows the line better.
- The screen supports the spoken line: short key words, in the same order the line says them. Never put words on screen that the line contradicts.
- Stay inside the on-screen limits for the type. Don't repeat the visual of the scene before or after it.
- If I gave no instruction, make it clearer and more visual than the current one.

Return ONLY one JSON object, no markdown fences, no comments:
{
  "scene": { "type": "...", ...the on-screen fields for that type (no "say") },
  "facts_to_check": ["each number or claim you put on screen"]
}
