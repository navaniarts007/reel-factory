"""Generate one voice clip per scene in my cloned voice, with a quality guard and a cache.

  python py/tts.py "<day folder>" --ref voice/reference.wav [--model turbo|nano|test] [--device cuda|cpu]

Writes <day>/clips/sNN.wav (48 kHz mono, loudness-normalised) and <day>/clips/report.json.
Guard, per clip: (1) length must fit the word count, (2) Whisper reads it back and it must match the script line.
A failed clip is regenerated once; if it fails again it is kept but flagged for review.
Cache: clips/cache/<fingerprint>.wav, fingerprint = text + reference clip + model + settings,
so editing one line regenerates only that line. "--model test" makes silent placeholder clips (for testing the pipeline).
"""
import argparse, difflib, hashlib, json, random, re, subprocess, sys, wave
from pathlib import Path
import numpy as np

SR = 48000
ROOT = Path(__file__).resolve().parent.parent

def words(t): return re.findall(r"[a-z0-9']+", t.lower())

def write_wav(path, x, sr=SR):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())

def read_wav(path, sr=SR):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0

def trim_silence(x, thr_db=-45, pad=0.06):
    hop = int(0.01 * SR); n = len(x) // hop
    if n == 0: return x
    rms = 20 * np.log10(np.sqrt(np.mean(x[:n * hop].reshape(n, hop) ** 2, axis=1)) + 1e-9)
    on = np.where(rms > thr_db)[0]
    if len(on) == 0: return x
    a = max(0, on[0] * hop - int(pad * SR)); b = min(len(x), (on[-1] + 1) * hop + int(pad * SR))
    return x[a:b]

def squeeze_pauses(x, thr_db=-40, max_gap=0.45):
    """The voice model sometimes leaves a long dead pause mid-line (seen: 3.9 s). Shorten every pause to max_gap."""
    hop = int(0.01 * SR); n = len(x) // hop
    if n == 0: return x
    quiet = 20 * np.log10(np.sqrt(np.mean(x[:n * hop].reshape(n, hop) ** 2, axis=1)) + 1e-9) < thr_db
    keep, out, i, pos = int(max_gap * SR) // 2, [], 0, 0
    while i < n:
        if not quiet[i]: i += 1; continue
        j = i
        while j < n and quiet[j]: j += 1
        s, e = i * hop, j * hop
        if e - s > 2 * keep:                      # long pause: keep its first and last bit only
            out.append(x[pos:s + keep]); pos = e - keep
        i = j
    out.append(x[pos:])
    return np.concatenate(out)

def loudnorm(src, dst):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-ar", str(SR), "-ac", "1", str(dst)], check=True)

def spoken_text(say):
    """What the voice should read: drop stage directions like (pause) and turn symbols into words."""
    t = re.sub(r"\([^)]*\)", "", say)
    t = t.replace("→", " to ").replace("&", " and ").replace("%", " percent").replace("+", " plus ")
    return re.sub(r"\s+", " ", t).strip()

class Engine:
    def __init__(self, model, device, ref, temperature=0.8):
        self.model_name, self.ref, self.temperature = model, ref, temperature
        if model == "test":
            self.m = None; self.sr = SR; return
        import torch
        from chatterbox.tts_turbo import ChatterboxTurboTTS
        if device == "cuda" and not torch.cuda.is_available():
            print("! CUDA not available, using CPU"); device = "cpu"
        if model == "nano":                       # chatterbox-tts 0.1.7 ships Turbo only
            print("! Nano isn't in this Chatterbox version, using Turbo")
        self.m = ChatterboxTurboTTS.from_pretrained(device=device)
        self.m.prepare_conditionals(str(ref))          # read the reference clip once, not for every scene
        self.sr = self.m.sr
        self.torch = torch

    def say(self, text, seed):
        if self.m is None:                        # test engine: silence the length of normal speech
            return np.zeros(int(SR * (0.4 + len(words(text)) / 2.6)), np.float32), SR
        self.torch.manual_seed(seed)
        with self.torch.inference_mode():
            wav = self.m.generate(text, temperature=self.temperature)   # lower = clearer words, flatter delivery
        return wav.squeeze().detach().cpu().numpy().astype(np.float32), self.sr

class Reader:
    """Reads a clip back with Whisper (CPU, so it never competes with the voice model for GPU memory)."""
    def __init__(self, size):
        self.model = None
        if size == "off": return
        try:
            from faster_whisper import WhisperModel
            self.model = WhisperModel(size, device="cpu", compute_type="int8")
        except Exception as e:
            print(f"! read-back check off ({e})")

    def score(self, path, text):
        if self.model is None: return None, ""
        # pass 16 kHz samples, not a path: faster-whisper's own decoder breaks on av >= 15
        segs, _ = self.model.transcribe(read_wav(path, 16000), language="en", beam_size=1, vad_filter=False)
        heard = " ".join(s.text for s in segs)
        a, b = words(text), words(heard)
        return round(difflib.SequenceMatcher(None, a, b).ratio(), 2), heard.strip()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("day"); ap.add_argument("--ref", required=True)
    ap.add_argument("--model", default="turbo", choices=["turbo", "nano", "test"])
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--whisper", default="base.en", help="read-back model size, or 'off'")
    ap.add_argument("--min-match", type=float, default=0.8)
    ap.add_argument("--max-pause", type=float, default=0.45, help="longest pause kept inside a clip (s)")
    ap.add_argument("--temperature", type=float, default=0.8, help="voice randomness: lower = clearer, flatter")
    ap.add_argument("--redo", type=int, action="append", default=[], help="scene index (0-based) to take again with a new seed, ignoring the cache")
    a = ap.parse_args()

    day = Path(a.day); tl = json.loads((day / "timeline.json").read_text(encoding="utf-8"))
    ref = Path(a.ref)
    if a.model != "test" and not ref.exists(): sys.exit(f"Reference clip not found: {ref}")
    clips = day / "clips"; cache = clips / "cache"; cache.mkdir(parents=True, exist_ok=True)
    ref_hash = hashlib.sha1(ref.read_bytes()).hexdigest()[:10] if ref.exists() else "none"

    todo = []
    for i, sc in enumerate(tl["scenes"]):
        text = spoken_text(sc.get("say", ""))
        fp = hashlib.sha1(f"{text}|{ref_hash}|{a.model}|t{a.temperature}|v1".encode()).hexdigest()[:16]
        todo.append((i, text, fp))

    engine = reader = None
    report = []
    for i, text, fp in todo:
        out = clips / f"s{i:02d}.wav"
        if not text:
            if out.exists(): out.unlink()
            report.append({"scene": i, "text": "", "duration": 0, "status": "no speech"}); continue
        hit = cache / f"{fp}.wav"; meta = cache / f"{fp}.json"
        if hit.exists() and meta.exists() and i not in a.redo:
            info = json.loads(meta.read_text())
            y = read_wav(hit); z = squeeze_pauses(y, max_gap=a.max_pause)
            if len(z) < len(y):                   # clips cached before pauses were squeezed
                write_wav(hit, z); info["duration"] = round(len(z) / SR, 3); meta.write_text(json.dumps(info, ensure_ascii=False, indent=1))
                print(f"  scene {i + 1}: shortened a long pause ({(len(y) - len(z)) / SR:.1f} s)")
            out.write_bytes(hit.read_bytes())
            report.append({**info, "scene": i, "fp": fp, "cached": True}); print(f"  scene {i + 1}: cached"); continue
        if engine is None:
            print(f"loading voice model ({a.model})…"); engine = Engine(a.model, a.device, ref, a.temperature)
            reader = Reader("off" if a.model == "test" else a.whisper)
        n = len(words(text)); expect = n / 2.6
        info = None
        if meta.exists(): meta.unlink()           # a clip only counts as cached once it's finished (safe to stop mid-take)
        base = random.randrange(1, 2**31 - 200) if i in a.redo else 1234   # a new take must sound different
        for attempt in range(2):
            x, sr = engine.say(text, seed=base + attempt * 77)
            tmp = cache / f"{fp}-raw.wav"; write_wav(tmp, x, sr)
            loudnorm(tmp, hit); tmp.unlink()
            y = squeeze_pauses(trim_silence(read_wav(hit)), max_gap=a.max_pause); write_wav(hit, y)
            dur = len(y) / SR
            length_ok = a.model == "test" or (0.45 * expect <= dur <= 2.0 * expect + 1.0)
            match, heard = reader.score(hit, text)
            match_ok = match is None or match >= a.min_match
            info = {"text": text, "duration": round(dur, 3), "expected": round(expect, 2), "match": match, "heard": heard,
                    "attempts": attempt + 1, "status": "ok" if (length_ok and match_ok) else "flagged",
                    "why": ("" if length_ok else f"length {dur:.1f}s for {n} words; ") + ("" if match_ok else f"read-back match {match}")}
            if info["status"] == "ok": break
            print(f"  scene {i + 1}: {info['why']} → retrying")
        meta.write_text(json.dumps(info, ensure_ascii=False, indent=1))
        out.write_bytes(hit.read_bytes())
        report.append({**info, "scene": i, "fp": fp, "cached": False})
        print(f"  scene {i + 1}: {info['duration']}s {info['status']}{' (' + info['why'] + ')' if info['why'] else ''}")

    (clips / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))
    flagged = [r["scene"] + 1 for r in report if r.get("status") == "flagged"]
    print(f"✓ {len(report)} scenes, flagged: {flagged or 'none'}")

if __name__ == "__main__":
    main()
