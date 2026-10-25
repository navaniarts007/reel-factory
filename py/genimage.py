"""One Gemini picture for a Media-tab suggestion (paid, only on the user's button press).

  python py/genimage.py <out.png> "<what it shows>" [--model gemini-2.5-flash-image] [--aspect 16:9|9:16]

Illustrations that explain an idea; never logos or screenshots (lib/suggest.js refuses those before calling this).
GEMINI_API_KEY comes from the environment (the app passes it from .env); it is never printed.
"""
import argparse, os, subprocess, sys
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("out"); ap.add_argument("what")
ap.add_argument("--model", default="gemini-2.5-flash-image"); ap.add_argument("--aspect", default="16:9", choices=["16:9", "9:16"])
a = ap.parse_args()
key = os.environ.get("GEMINI_API_KEY")
if not key:
    sys.exit("GEMINI_API_KEY is missing in .env")


def gemini_error(e):
    """Turn Google's long quota errors into one line the app can show."""
    m = str(e)
    if "RESOURCE_EXHAUSTED" in m or " 429" in m:
        if "free_tier" in m or "FreeTier" in m:
            return ("Your Gemini key is on the free tier, which allows no image or video generation. Turn on billing for its "
                    "Google project (aistudio.google.com, API keys, Set up billing), then try again.")
        return "Gemini quota is used up for now (rate or daily limit). Try again later."
    if "API_KEY_INVALID" in m or "API key not valid" in m:
        return "Google says the GEMINI_API_KEY in .env isn't valid."
    return None

from google import genai
from google.genai import types

prompt = f"""A clean, high-quality explanatory illustration for a tech video: {a.what}
Style: modern flat editorial illustration, soft natural colours, clear single subject, plain light background, generous space.
Avoid: any text, letters, numbers, logos, brand marks, watermarks, user interfaces, screenshots, real people's faces."""
client = genai.Client(api_key=key)
print(f"asking {a.model}…", flush=True)
try:
    r = client.models.generate_content(model=a.model, contents=prompt,
        config=types.GenerateContentConfig(response_modalities=["IMAGE"], image_config=types.ImageConfig(aspect_ratio=a.aspect)))
except Exception as e:
    msg = gemini_error(e)
    if msg: sys.exit(msg)
    raise
data = next((p.inline_data.data for c in (r.candidates or []) for p in (c.content.parts or []) if getattr(p, "inline_data", None)), None)
if not data:
    sys.exit("Gemini returned no image (it may have refused the prompt).")
out = Path(a.out); out.parent.mkdir(parents=True, exist_ok=True)
raw = out.with_suffix(".raw"); raw.write_bytes(data)
w = "1920" if a.aspect == "16:9" else "1080"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-vf", f"scale='min({w},iw)':-2", str(out)], check=True)
raw.unlink()
print("✓ picture ready", flush=True)
