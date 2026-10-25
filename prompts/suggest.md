You suggest REAL pictures that would make an approved vertical tech reel clearer. You don't change the script.

<video>
Topic: {{TOPIC}}
Audience: {{AUDIENCE}}
</video>

<approved_script>
{{SCRIPT}}
</approved_script>

<images_i_already_have>
{{MEDIA}}
</images_i_already_have>

Pick the 2 to 5 scenes where a real picture beats a drawing: the actual product screen, the real logo next to its name,
a photo of a real thing the line talks about, a real diagram. Skip hello, hook, cta and bye. Skip scenes an image I already
have covers. For each, say exactly what the picture shows and where it comes from:
- "screenshot": a screen of a real app, site or terminal. Source is always "upload" (I take it myself; never fake one).
- "logo": a brand's official logo. Source "commons" (Wikimedia Commons search) or "upload". Never "gemini".
- "photo": a real-world thing (a server rack, a shipping container, a phone). Source "commons" or "gemini".
- "diagram": a real published diagram (source "commons") or an illustration that only explains (source "gemini").
Use "gemini" only for illustrations that explain an idea, never to show what a real product, person or place looks like.

Return ONLY one JSON object, no markdown fences:
{
  "suggestions": [
    { "scene": 4, "what": "Docker Desktop's Containers page with one running container", "kind": "screenshot",
      "why": "the line says 'see it running'", "source": "upload",
      "commons_query": "", "gemini_prompt": "" }
  ]
}
commons_query: 2 to 5 plain search words for Wikimedia Commons (e.g. "Docker logo", "server rack datacenter"), when source is "commons".
gemini_prompt: one sentence describing the illustration (no text or letters in it), when source is "gemini".
