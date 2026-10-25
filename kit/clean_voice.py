"""Turn your raw recording (with mistakes and retakes) into a clean voiceover that follows the script.

Recording rule: if you make a mistake, pause for a second and say the WHOLE sentence again from its start.

  python clean_voice.py videos/<name>                 # uses videos/<name>/raw-voice.(mp3|wav|m4a)
  python clean_voice.py videos/<name> --dry           # only show what would be kept/cut
Then:
  node build.js videos/<name> --render

What it writes into videos/<name>/:
  voice.wav          the clean voiceover (picked up automatically by build.js)
  timeline.json      every scene's "dur" set to your speech (a backup is kept as timeline.backup.json)
  edit-report.txt    every piece of your recording: KEPT / CUT and why, with its transcript
  bloopers.wav       everything that was cut, in order (for a bloopers reel)
  edits.json         optional, you create it: {"cut": [7, 12], "keep": [9]} using piece numbers from the report

Transcription uses Sarvam speech-to-text (SARVAM_API_KEY in .env). Results are cached, so re-runs are free.
"""
import argparse, difflib, hashlib, io, json, os, re, subprocess, sys, wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).parent
if not (ROOT / ".env").exists() and (ROOT.parent / ".env").exists(): ROOT = ROOT.parent
SR_A, SR_O = 16000, 44100          # analysis / output sample rates

# ---------------------------------------------------------------- helpers
def load_env():
    env = {}
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8-sig").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"')
    return env

def decode(path, sr):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0

def wav_bytes(x, sr):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
    return buf.getvalue()

def norm(t):
    """Make Tanglish spellings comparable: 'Pannidalaam' ~ 'panidalam', 'theriyadhu' ~ 'teriyadu'."""
    t = t.lower()
    t = re.sub(r"[^a-z0-9]", "", t)
    for a, b in (("zh", "l"), ("th", "t"), ("dh", "d"), ("sh", "s"), ("ph", "f"), ("bh", "b"), ("kh", "k"), ("gh", "g"),
                 ("aa", "a"), ("ee", "i"), ("ii", "i"), ("oo", "u"), ("uu", "u"), ("w", "v"), ("q", "k"), ("c", "k"), ("z", "s")):
        t = t.replace(a, b)
    return re.sub(r"(.)\1+", r"\1", t)          # collapse doubled letters

# ---------------------------------------------------------------- 1. find speech pieces
def find_pieces(x, min_pause, min_len=0.3, pad=0.1, max_len=25.0):
    hop = int(0.02 * SR_A)
    n = len(x) // hop
    rms = np.sqrt(np.mean(x[:n * hop].reshape(n, hop) ** 2, axis=1) + 1e-10)
    db = 20 * np.log10(rms)
    floor, loud = np.percentile(db, 10), np.percentile(db, 95)
    thr = floor + max(8.0, 0.3 * (loud - floor))
    on = db > thr
    regions, i = [], 0
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]: j += 1
            regions.append([i, j]); i = j
        else:
            i += 1
    merged = []
    gap = int(min_pause / 0.02)
    for r in regions:
        if merged and r[0] - merged[-1][1] < gap: merged[-1][1] = r[1]
        else: merged.append(r)
    out = []
    for a, b in merged:
        if (b - a) * 0.02 < min_len: continue
        while (b - a) * 0.02 > max_len:                       # very long piece: split at its quietest frame
            mid = a + int(max_len / 0.02 * 0.6)
            lo, hi = mid - 100, min(b - 10, mid + 100)
            cut = lo + int(np.argmin(db[lo:hi]))
            out.append([a * 0.02, cut * 0.02]); a = cut
        out.append([a * 0.02, b * 0.02])
    dur = len(x) / SR_A
    res = []
    for k, (s, e) in enumerate(out):
        s2 = max(0.0, s - pad, res[-1]["end"] if res else 0.0)
        e2 = min(dur, e + pad, out[k + 1][0] if k + 1 < len(out) else dur)
        res.append({"id": k + 1, "start": round(s2, 3), "end": round(e2, 3)})
    return res, db, thr

# ---------------------------------------------------------------- 2. transcribe
def transcribe_whisper(todo, x, cache, cache_path, size):
    """Local, free transcription for English recordings (faster-whisper on the CPU)."""
    from faster_whisper import WhisperModel
    model = WhisperModel(size, device="cpu", compute_type="int8")
    for k, p in enumerate(todo, 1):
        clip = x[int(p["start"] * SR_A):int(p["end"] * SR_A)]
        segs, _ = model.transcribe(clip, language="en", beam_size=1, vad_filter=False)
        cache[f"{p['start']:.2f}-{p['end']:.2f}"] = " ".join(s.text.strip() for s in segs)
        print(f"\r  transcribing {k}/{len(todo)}", end="", flush=True)
        cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    print()

def transcribe(pieces, x, cache_path, env, lang, stt="sarvam", whisper_size="base.en"):
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    todo = [p for p in pieces if f"{p['start']:.2f}-{p['end']:.2f}" not in cache]
    if todo and stt == "whisper":
        transcribe_whisper(todo, x, cache, cache_path, whisper_size)
    elif todo:
        key = env.get("SARVAM_API_KEY")
        if not key: sys.exit("SARVAM_API_KEY missing in .env")
        import requests
        for k, p in enumerate(todo, 1):
            clip = x[int(p["start"] * SR_A):int(p["end"] * SR_A)]
            r = requests.post("https://api.sarvam.ai/speech-to-text",
                              headers={"api-subscription-key": key},
                              files={"file": (f"piece{p['id']}.wav", wav_bytes(clip, SR_A), "audio/wav")},
                              data={"model": "saaras:v3", "mode": "translit", "language_code": lang}, timeout=120)
            if not r.ok: sys.exit(f"Sarvam speech-to-text failed: HTTP {r.status_code}\n{r.text[:500]}")
            cache[f"{p['start']:.2f}-{p['end']:.2f}"] = r.json().get("transcript", "")
            print(f"\r  transcribing {k}/{len(todo)}", end="", flush=True)
            cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        print()
    for p in pieces: p["text"] = cache.get(f"{p['start']:.2f}-{p['end']:.2f}", "")

# ---------------------------------------------------------------- 3. align pieces to the script
def build_script(scenes):
    S, scene_at, starts = "", [], []
    for i, sc in enumerate(scenes):
        starts.append(len(S))
        t = norm(sc.get("say", ""))
        S += t; scene_at += [i] * len(t)
    return S, scene_at, starts

def locate(seg, S, lo, hi):
    """Best place for a piece's text inside S[lo:hi]: returns (score, a0, a1) in S coordinates."""
    best = (0.0, 0, 0)
    L = len(seg)
    if L == 0: return best
    for st in range(max(0, lo), max(lo + 1, min(hi, len(S)))):
        for f in (0.8, 1.0, 1.25):
            win = S[st:st + int(L * f) + 2]
            if not win: continue
            sm = difflib.SequenceMatcher(None, win, seg, autojunk=False)
            blocks = [b for b in sm.get_matching_blocks() if b.size >= 2]
            if not blocks: continue
            score = sum(b.size for b in blocks) / L
            if score > best[0] + 1e-6:
                best = (score, st + blocks[0].a, st + blocks[-1].a + blocks[-1].size)
    return best

def align(pieces, S, forced_cut, forced_keep, min_score):
    chosen, covered = [], 0
    for p in pieces:
        seg = norm(p["text"])
        p["seg"] = seg
        if p["id"] in forced_cut:
            p["status"] = "CUT (you marked it)"; continue
        lo, hi = covered - 350, covered + 500
        score, a0, a1 = locate(seg, S, lo, hi)
        p.update(score=round(score, 2), a0=a0, a1=a1)
        if p["id"] not in forced_keep and (len(seg) < 4 or score < min_score):
            p["status"] = "CUT (not in script)"; continue
        # a retake: anything already chosen from this point of the script onwards is replaced
        while chosen and chosen[-1]["a0"] >= a0 - 3:
            old = chosen.pop(); old["status"] = f"CUT (retake, replaced by #{p['id']})"
        if chosen and chosen[-1]["a1"] > a0 + 3:
            chosen[-1]["trim_to"] = a0                 # earlier piece ran into this sentence: trim its end
        p["status"] = "KEPT"
        chosen.append(p)
        covered = a1
    return chosen

def time_at(p, char, db):
    """Time inside a kept piece where script position `char` is spoken (linear estimate, snapped to a quiet frame)."""
    frac = (char - p["a0"]) / max(1, p["a1"] - p["a0"])
    t = p["start"] + min(1, max(0, frac)) * (p["end"] - p["start"])
    i0, i1 = int((t - 0.35) / 0.02), int((t + 0.35) / 0.02)
    i0, i1 = max(int(p["start"] / 0.02), i0), min(int(p["end"] / 0.02), i1)
    if i1 - i0 > 2: t = (i0 + int(np.argmin(db[i0:i1]))) * 0.02
    return t

# ---------------------------------------------------------------- 4. assemble
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("--dry", action="store_true")
    ap.add_argument("--lang", default="ta-IN")
    ap.add_argument("--min-pause", type=float, default=0.45, help="pause (s) that separates two pieces")
    ap.add_argument("--max-pause", type=float, default=0.55, help="longest pause kept in the clean voice")
    ap.add_argument("--scene-gap", type=float, default=0.6, help="pause between scenes")
    ap.add_argument("--min-score", type=float, default=0.55, help="how closely a piece must match the script")
    ap.add_argument("--transcripts", help="(testing) JSON file of transcripts instead of Sarvam")
    ap.add_argument("--stt", default="sarvam", choices=["sarvam", "whisper"], help="whisper = local and free (English)")
    ap.add_argument("--whisper-size", default="base.en")
    a = ap.parse_args()

    vdir = Path(a.video)
    raw = next((vdir / f for f in ("raw-voice.wav", "raw-voice.mp3", "raw-voice.m4a", "raw-voice.aac") if (vdir / f).exists()), None)
    if not raw: sys.exit(f"Put your recording in {vdir} as raw-voice.mp3 (or .wav / .m4a)")
    tl_path = vdir / "timeline.json"
    tl = json.loads(tl_path.read_text(encoding="utf-8"))
    scenes = tl["scenes"]
    work = vdir / "voice-work"; work.mkdir(exist_ok=True)
    edits = json.loads((vdir / "edits.json").read_text()) if (vdir / "edits.json").exists() else {}

    print(f"1/4 finding pieces in {raw.name}")
    xa = decode(raw, SR_A)
    pieces, db, thr = find_pieces(xa, a.min_pause)
    print(f"    {len(pieces)} pieces, {len(xa) / SR_A:.1f} s recorded")

    print("2/4 transcribing")
    if a.transcripts:
        tx = json.loads(Path(a.transcripts).read_text(encoding="utf-8"))
        for p in pieces: p["text"] = tx[p["id"] - 1] if p["id"] - 1 < len(tx) else ""
    else:
        h = hashlib.md5(raw.read_bytes()).hexdigest()[:10]
        transcribe(pieces, xa, work / f"transcripts-{a.stt}-{h}.json", load_env(), a.lang, a.stt, a.whisper_size)

    print("3/4 matching to the script")
    S, scene_at, sstarts = build_script(scenes)
    kept = align(pieces, S, set(edits.get("cut", [])), set(edits.get("keep", [])), a.min_score)
    for p in kept:
        if "trim_to" in p:
            p["end"] = round(time_at(p, p["trim_to"], db) + 0.08, 3); p["a1"] = p["trim_to"]; p["status"] = "KEPT (end trimmed: check)"

    # which script text never got a take
    have = np.zeros(len(S), bool)
    for p in kept: have[p["a0"]:p["a1"]] = True
    missing = []
    for i, sc in enumerate(scenes):
        s0, s1 = sstarts[i], (sstarts[i + 1] if i + 1 < len(scenes) else len(S))
        if s1 > s0 and have[s0:s1].mean() < 0.6: missing.append(i + 1)

    # report
    lines = [f"Recording: {raw.name}   pieces: {len(pieces)}   kept: {len(kept)}", ""]
    for p in pieces:
        sc = scene_at[min(p["a0"], len(S) - 1)] + 1 if S and "a0" in p and not p["status"].startswith("CUT (not") else "-"
        lines.append(f"#{p['id']:<3} {p['start']:7.2f}-{p['end']:7.2f}s  scene {sc!s:>2}  {p['status']:<34} match {p.get('score', 0):.2f}  | {p['text']}")
    if missing: lines += ["", "! Scenes with little or no matching speech: " + ", ".join(map(str, missing)) + " (check the report, or add {\"keep\": [piece numbers]} to edits.json)"]
    (vdir / "edit-report.txt").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines[2:]) if a.dry else f"    report: {vdir / 'edit-report.txt'}")
    if missing: print(lines[-1])
    if a.dry or not kept: return

    print("4/4 building the clean voice")
    xo = decode(raw, SR_O)
    fade = int(0.015 * SR_O)
    out, bounds, t_out = [], {}, 0.0
    prev = None
    for p in kept:
        if prev is not None:
            crossing = scene_at[min(p["a0"], len(S) - 1)] != scene_at[min(max(prev["a1"] - 1, 0), len(S) - 1)]
            gap = a.scene_gap if crossing else min(a.max_pause, max(0.15, p["start"] - prev["end"]))
            out.append(np.zeros(int(gap * SR_O), np.float32)); t_out += gap
        clip = xo[int(p["start"] * SR_O):int(p["end"] * SR_O)].copy()
        if len(clip) > 2 * fade:
            clip[:fade] *= np.linspace(0, 1, fade); clip[-fade:] *= np.linspace(1, 0, fade)
        # where each scene starts inside this clip
        for i, s0 in enumerate(sstarts):
            if i not in bounds and p["a0"] - 3 <= s0 < p["a1"]:
                bounds[i] = t_out + (time_at(p, s0, db) - p["start"] if s0 > p["a0"] + 3 else 0.0)
        out.append(clip); t_out += len(clip) / SR_O
        prev = p
    voice = np.concatenate(out + [np.zeros(int(0.8 * SR_O), np.float32)])
    total = len(voice) / SR_O
    (vdir / "voice.wav").write_bytes(wav_bytes(voice, SR_O))

    cut = [p for p in pieces if not p["status"].startswith("KEPT")]
    if cut:
        gapz = np.zeros(int(0.4 * SR_O), np.float32)
        bl = np.concatenate(sum([[xo[int(p["start"] * SR_O):int(p["end"] * SR_O)], gapz] for p in cut], []))
        (vdir / "bloopers.wav").write_bytes(wav_bytes(bl, SR_O))

    # scene durations from where each scene's speech starts (scenes without speech keep their own length)
    starts = []
    for i, sc in enumerate(scenes):
        if i == 0: starts.append(0.0)
        elif i in bounds: starts.append(max(starts[-1] + 0.8, bounds[i] - 0.12))
        else: starts.append(starts[-1] + float(sc.get("dur", 2.0)))
    if not (vdir / "timeline.backup.json").exists():
        (vdir / "timeline.backup.json").write_text(tl_path.read_text(encoding="utf-8"), encoding="utf-8")
    for i, sc in enumerate(scenes):
        end = starts[i + 1] if i + 1 < len(scenes) else max(total, starts[i] + 1.5)
        sc["dur"] = round(end - starts[i], 2)
    tl_path.write_text(json.dumps(tl, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"    clean voice: {vdir / 'voice.wav'}  ({total:.1f} s, cut {len(cut)} pieces)")
    print(f"    scene lengths written to {tl_path.name}")
    print(f"Next: node build.js {vdir.as_posix()} --render")

if __name__ == "__main__":
    main()
