"""Cut a stretch out of one scene's voice clip (e.g. a long pause), by hand.

  python py/cut_clip.py "<day folder>" <scene index> <from s> <to s>

Edits the cached clip too (clips/cache/<fp>.wav, fp from clips/report.json), so the cut survives the next voice run.
Run py/sync.py afterwards so scene lengths and voice.wav follow the shorter clip.
"""
import json, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from tts import read_wav, write_wav, SR

def main():
    day, i, a, b = Path(sys.argv[1]), int(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
    clips = day / "clips"; rep_path = clips / "report.json"
    report = json.loads(rep_path.read_text(encoding="utf-8"))
    r = next((x for x in report if x.get("scene") == i), None)
    if not r or not r.get("duration"): sys.exit(f"Scene {i + 1} has no voice clip.")
    out = clips / f"s{i:02d}.wav"
    x = read_wav(out); dur = len(x) / SR
    a, b = max(0.0, a), min(dur, b)
    if b - a < 0.05: sys.exit(f"Nothing to cut: pick a range inside 0–{dur:.2f} s with 'to' after 'from'.")
    ia, ib, f = int(a * SR), int(b * SR), int(0.01 * SR)
    head, tail = x[:ia].copy(), x[ib:].copy()
    if len(head) > f and len(tail) > f:                     # 10 ms crossfade: no click at the joint
        ramp = np.linspace(0, 1, f, dtype=np.float32)
        head[-f:] = head[-f:] * (1 - ramp) + tail[:f] * ramp; tail = tail[f:]
    y = np.concatenate([head, tail])
    write_wav(out, y)
    new = round(len(y) / SR, 3)
    if r.get("fp"):
        hit = clips / "cache" / f"{r['fp']}.wav"; meta = hit.with_suffix(".json")
        write_wav(hit, y)
        if meta.exists():
            info = json.loads(meta.read_text()); info["duration"] = new; meta.write_text(json.dumps(info, ensure_ascii=False, indent=1))
    else:
        print("! this clip was made before cuts were supported: run the voice step once, or the cut is lost on the next voice run")
    r["duration"] = new; rep_path.write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(f"✓ scene {i + 1}: cut {a:.2f}–{b:.2f} s, clip {dur:.2f} → {new:.2f} s")

if __name__ == "__main__":
    main()
