"""Make audio and video line up to the frame.

  python py/sync.py "<day folder>" --mode clips|recording [--fps 60]

clips:     scene i lasts exactly as long as its clip (plus a short lead-in and breath), rounded UP to whole frames.
           voice.wav is built from the clips padded with silence to those exact lengths.
recording: clean_voice.py already wrote voice.wav and scene lengths; boundaries are snapped to whole frames and
           voice.wav is padded or trimmed to the exact video length.
Writes timeline.json durations and sync.json (every scene's start/length in frames and seconds).
48 kHz audio at 60 fps = exactly 800 samples per frame, so the two can never drift.
"""
import argparse, json, math, subprocess, wave
from pathlib import Path
import numpy as np

SR = 48000

def read_audio(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0

def write_wav(path, x):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())

# Minimum on-screen time per scene type when it has no speech (seconds).
MIN_SILENT = {"hello": 2.0, "bye": 2.0, "cta": 3.0}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("day"); ap.add_argument("--mode", default="clips", choices=["clips", "recording"])
    ap.add_argument("--fps", type=int, default=60)
    ap.add_argument("--lead", type=float, default=0.15, help="silence before speech in each scene")
    ap.add_argument("--tail", type=float, default=0.35, help="breath after speech in each scene")
    a = ap.parse_args()
    day = Path(a.day); tlp = day / "timeline.json"; tl = json.loads(tlp.read_text(encoding="utf-8"))
    spf = SR // a.fps
    assert SR % a.fps == 0, "fps must divide 48000"
    scenes = tl["scenes"]
    rows = []

    if a.mode == "clips":
        parts = []
        for i, sc in enumerate(scenes):
            clip = day / "clips" / f"s{i:02d}.wav"
            x = read_audio(clip) if clip.exists() else np.zeros(0, np.float32)
            need = (a.lead + len(x) / SR + a.tail) if len(x) else MIN_SILENT.get(sc["type"], float(sc.get("dur", 2.0)))
            frames = math.ceil(need * a.fps - 1e-9)
            seg = np.zeros(frames * spf, np.float32)
            st = int(a.lead * SR) if len(x) else 0
            seg[st:st + len(x)] = x[:len(seg) - st]
            parts.append(seg)
            rows.append({"scene": i, "type": sc["type"], "frames": frames, "speech": round(len(x) / SR, 3)})
        voice = np.concatenate(parts)
    else:
        x = read_audio(day / "voice.wav")
        t, starts = 0.0, []
        for sc in scenes: starts.append(t); t += float(sc["dur"])
        fstarts = [round(s * a.fps) for s in starts] + [max(round(t * a.fps), round(len(x) / SR * a.fps))]
        for i, sc in enumerate(scenes):
            rows.append({"scene": i, "type": sc["type"], "frames": max(1, fstarts[i + 1] - fstarts[i])})
        total = sum(r["frames"] for r in rows) * spf
        voice = np.concatenate([x, np.zeros(max(0, total - len(x)), np.float32)])[:total]

    f = 0
    for r, sc in zip(rows, scenes):
        r["start_frame"] = f; r["start"] = round(f / a.fps, 4); r["dur"] = round(r["frames"] / a.fps, 6)
        sc["dur"] = r["dur"]; f += r["frames"]
    write_wav(day / "voice.wav", voice)
    tlp.write_text(json.dumps(tl, ensure_ascii=False, indent=2), encoding="utf-8")
    info = {"fps": a.fps, "sample_rate": SR, "frames": f, "seconds": f / a.fps, "voice_samples": len(voice),
            "exact": len(voice) == f * spf, "mode": a.mode, "scenes": rows}
    (day / "sync.json").write_text(json.dumps(info, indent=1))
    print(f"✓ {len(rows)} scenes, {f} frames = {f / a.fps:.3f} s; voice.wav {len(voice)} samples (exact: {info['exact']})")

if __name__ == "__main__":
    main()
