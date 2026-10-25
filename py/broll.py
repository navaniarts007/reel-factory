"""Collage B-roll (skill: github.com/pyang5166/gbro-collage-broll, MIT) for one "broll" scene.

  python py/broll.py still   <art dir> <scene json> [--model gemini-2.5-flash-image]
  python py/broll.py animate <art dir> <scene json> [--model gemini-omni-flash-preview] [--seconds 5]

still:   gate 2. A finished 9:16 paper-collage still of the scene's metaphor -> <art dir>/still.png (you approve it in the app).
animate: gate 3. Gemini first/last-frame video: an empty colour field assembling into the approved still, using the skill's
         own scripts/generate_video.py -> <art dir>/clip.mp4 (silent, 24 fps).
GEMINI_API_KEY comes from the environment (the app passes it from .env); it is never printed.
Both calls are paid on the user's Google key.
"""
import argparse, json, os, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL = ROOT / "vendor" / "skills" / "collage" / "scripts"
COLORS = {"orange": "#E2622B", "mustard": "#D9A21B", "green": "#2F5D46", "purple": "#4B2E83", "teal": "#127C7A"}
NAMES = {"orange": "burnt orange", "mustard": "mustard yellow", "green": "deep forest green", "purple": "deep purple", "teal": "teal"}


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

def ff(*a):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *a], check=True)

def key():
    k = os.environ.get("GEMINI_API_KEY")
    if not k:
        sys.exit("GEMINI_API_KEY is missing in .env (add it there; the app never shows it)")
    return k

# The skill's imagegen prompt template (SKILL.md, Phase 2), filled from the scene.
def still_prompt(sc):
    c = sc.get("color", "orange")
    objs = ", ".join(sc.get("objects", []))
    return f"""Use case: ads-marketing
Asset type: final still frame for a 9:16 image-to-video B-roll clip
Primary request: Create a finished editorial paper-collage image expressing: {sc['metaphor']}
Scene/backdrop: perfectly flat {NAMES[c]} paper field {COLORS[c]} with subtle uncoated paper fiber.
Style/medium: premium editorial stop-motion paper collage; black-and-white halftone photographic cut-outs mixed with selective cream, yellow and teal colored cardstock.
Composition/framing: vertical 9:16 locked poster frame; central subject within the middle 70 percent; keep the bottom 25 percent mostly empty color field (captions go there); generous clean color-field negative space; 3-6 large separable paper groups for later assemble-from-empty animation.
Key objects: {objs}.
Materials/textures: visible printed halftone dots, crisp machine-cut edges, thin warm-cream paper keylines, soft low-opacity physical drop shadows.
Avoid: no typography, no readable letters, no numerals, no logos, no watermark, no UI, no subtitles, no glossy 3D, no photoreal environment, no clutter."""

def still(art, sc, model):
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=key())
    print(f"asking {model} for the collage still…", flush=True)
    try:
        r = client.models.generate_content(model=model, contents=still_prompt(sc),
            config=types.GenerateContentConfig(response_modalities=["IMAGE"], image_config=types.ImageConfig(aspect_ratio="9:16")))
    except Exception as e:
        msg = gemini_error(e)
        if msg: sys.exit(msg)
        raise
    data = next((p.inline_data.data for c in (r.candidates or []) for p in (c.content.parts or []) if getattr(p, "inline_data", None)), None)
    if not data:
        sys.exit("Gemini returned no image (it may have refused the prompt). Try ↻ New visual for a different metaphor.")
    raw = art / "still-raw.bin"; raw.write_bytes(data)
    ff("-i", str(raw), "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", str(art / "still.png"))
    raw.unlink()
    (art / "art.json").write_text(json.dumps({"kind": "broll", "still": True, "stillApproved": False, "model": model}))
    print("✓ still ready: look at it, then press Animate (or ↻ Still for another)", flush=True)

def animate(art, sc, model, seconds):
    if not (art / "still.png").exists():
        sys.exit("Make the still first.")
    if not (SKILL / "generate_video.py").exists():
        sys.exit("Collage B-roll isn't pulled yet: Settings → Skills → Pull.")
    c = COLORS[sc.get("color", "orange")]
    first, last = art / "first-frame.png", art / "last-frame.png"
    ff("-f", "lavfi", "-i", f"color=c=0x{c[1:]}:s=1080x1920", "-frames:v", "1", str(first))
    ff("-i", str(art / "still.png"), "-vf", "scale=1080:1920", str(last))
    # the skill's Omni prompt template (SKILL.md, Phase 3)
    prompt = (f"Paper-collage stop-motion assembly, using Image 1 as the exact empty first frame and Image 2 as the exact completed last frame. "
              f"In one continuous locked-off vertical shot, open on the empty flat {NAMES[sc.get('color', 'orange')]} paper field. "
              f"Assemble the scene piece by piece with crisp physical stop-motion timing: {', then '.join(sc.get('objects', []))} slide in, snap into place and complete the action: {sc['metaphor']} "
              f"End by holding the supplied completed composition. Preserve the exact 9:16 framing, {c} color field, colored cardstock accents, uncoated paper grain, "
              f"halftone dots, cream keylines, crisp cut edges and soft shadows. Restrained tactile 2D paper craft only. "
              f"No scene cuts, no camera movement, no zoom, no morphing, no new objects, no text, no letters, no numbers, no logos, no watermark, no UI, no sound.")
    raw = art / "clip-raw.mp4"
    print(f"asking {model} for a {seconds} s clip (this takes a few minutes)…", flush=True)
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    subprocess.run([sys.executable, "-I", str(SKILL / "generate_video.py"), prompt, "--image", str(first), "--image", str(last),
                    "--aspect-ratio", "9:16", "--duration", str(seconds), "--model", model, "--output", str(raw)], check=True, env=env, cwd=str(art))
    ff("-i", str(raw), "-map", "0:v:0", "-an", "-vf", "fps=24,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
       "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p", str(art / "clip.mp4"))
    raw.unlink(missing_ok=True)
    meta = json.loads((art / "art.json").read_text()) if (art / "art.json").exists() else {}
    meta.update({"kind": "broll", "fps": 24, "stillApproved": True, "videoModel": model})
    (art / "art.json").write_text(json.dumps(meta))
    print("✓ B-roll clip ready", flush=True)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["still", "animate"]); ap.add_argument("art"); ap.add_argument("scene")
    ap.add_argument("--model"); ap.add_argument("--seconds", type=int, default=5)
    a = ap.parse_args()
    art = Path(a.art); art.mkdir(parents=True, exist_ok=True)
    sc = json.loads(a.scene)
    if a.what == "still": still(art, sc, a.model or "gemini-2.5-flash-image")
    else: animate(art, sc, a.model or "gemini-omni-flash-preview", max(3, min(10, a.seconds)))
