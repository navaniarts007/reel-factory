You rewrite ONE scene of a vertical whiteboard reel script. Follow the style guide exactly.

<style_guide>
{{STYLE}}
</style_guide>

<video>
Day: {{DAY}}
Topic: {{TOPIC}}
Audience: {{AUDIENCE}} (follow the matching "Audiences" section of the style guide)
Comment keyword: {{KEYWORD}}
Skill: {{SKILL_NAME}} (follow <skill_guide>; where it differs from the style guide's look or visual style, the skill wins)
</video>

<skill_guide>
{{SKILL}}
</skill_guide>


<scenes_reference>
{{LIBRARY}}
</scenes_reference>

<full_script>
{{SCRIPT}}
</full_script>

Rewrite scene {{N}} (type "{{TYPE}}"). Its current version:
{{CURRENT}}

What I want changed: {{INSTRUCTION}}

Rules:
- Keep the type "{{TYPE}}" and the scene's job in the story. It must follow on from scene {{PREV}} and lead into scene {{NEXT}}.
- Don't repeat what other scenes already say. Keep the on-screen text inside the limits for this type.
- Keep "say" about the same length (2–3 short lines) unless I asked for something else.
- If I gave no instruction, write a fresher, clearer version that does the same job better.

Return ONLY one JSON object, no markdown fences, no comments:
{
  "scene": { "type": "{{TYPE}}", ...the on-screen fields for this type..., "say": "..." },
  "facts_to_check": ["each new factual claim, price, limit or version in this scene"]
}
