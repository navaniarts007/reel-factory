"""Word-timed captions for the burned-in caption bar.

  python py/captions.py "<day folder>" [--whisper base.en]

Needs voice.wav and sync.json (run after sync). For each scene, Whisper listens to that scene's stretch of voice.wav
and gives word times; the words SHOWN are the script's own spelling, matched to what Whisper heard (unmatched words
get times in between their neighbours). Words are grouped into short phrases that break at punctuation and pauses.
Writes captions.json: [{ "scene", "t0", "t1", "words": [{ "w", "t0", "t1" }] }] in seconds from the start of the video.
Cache: captions-cache.json, keyed by each scene's audio, so only changed scenes are listened to again.
"""
import argparse, difflib, hashlib, json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from tts import read_wav

SR = 16000
MAX_WORDS, MAX_CHARS, GAP = 5, 26, 0.35

def norm(w): return re.sub(r"[^a-z0-9]", "", w.lower())

def tokens(say):
    """The words as written in the script, without stage directions like (pause)."""
    return [t for t in re.sub(r"\([^)]*\)", " ", say).split() if norm(t)]

def align(shown, heard):
    """Give every script word a time: from the matching heard word, else spread between its neighbours."""
    a, b = [norm(t) for t in shown], [norm(h["w"]) for h in heard]
    times = [None] * len(shown)
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size): times[blk.a + k] = (heard[blk.b + k]["t0"], heard[blk.b + k]["t1"])
    i = 0
    while i < len(shown):
        if times[i] is not None: i += 1; continue
        j = i
        while j < len(shown) and times[j] is None: j += 1
        lo = times[i - 1][1] if i > 0 else (heard[0]["t0"] if heard else 0.0)
        hi = times[j][0] if j < len(shown) else (heard[-1]["t1"] if heard else lo + 0.4 * (j - i))
        hi = max(hi, lo + 0.05 * (j - i))
        chars = [len(shown[k]) for k in range(i, j)]; tot = sum(chars); t = lo
        for k, c in zip(range(i, j), chars):
            d = (hi - lo) * c / tot; times[k] = (t, t + d); t += d
        i = j
    return times

# a phrase never ends on these (it reads as cut off): articles, small joining words, number words
WEAK = set("a an the of my your our to and or but in on at for with is are be this that it three four five six seven eight nine ten twenty thirty forty fifty sixty seventy eighty ninety hundred thousand".split())

def phrases(words):
    """Split at sentence ends, pauses and (in longer clauses) commas; then cut each clause into even parts."""
    clauses, cur = [], []
    for k, w in enumerate(words):
        cur.append(w)
        nxt = words[k + 1] if k + 1 < len(words) else None
        if (nxt is None or re.search(r"[.!?:;]$", w["w"]) or (w["w"].endswith(",") and len(cur) >= 3)
                or nxt["t0"] - w["t1"] > GAP):
            clauses.append(cur); cur = []
    out = []
    for cl in clauses:
        chars = len(" ".join(x["w"] for x in cl))
        n = max(-(-chars // MAX_CHARS), -(-len(cl) // MAX_WORDS), 1)
        cuts, last = [], 0
        for k in range(1, n):
            c = max(last + 1, round(len(cl) * k / n))
            while c < len(cl) - 1 and norm(cl[c - 1]["w"]) in WEAK: c += 1     # don't end on "of", "three"…
            if c < len(cl): cuts.append(c); last = c
        for a, b in zip([0] + cuts, cuts + [len(cl)]):
            if b > a: out.append(cl[a:b])
    return out

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("day"); ap.add_argument("--whisper", default="base.en")
    a = ap.parse_args()
    day = Path(a.day)
    tl = json.loads((day / "timeline.json").read_text(encoding="utf-8"))
    sync = json.loads((day / "sync.json").read_text(encoding="utf-8"))
    x = read_wav(day / "voice.wav", SR)
    cache_p = day / "captions-cache.json"
    cache = json.loads(cache_p.read_text(encoding="utf-8")) if cache_p.exists() else {}
    model, out, heard_new = None, [], 0
    for sc in sync["scenes"]:
        i, start, dur = sc["scene"], sc["start"], sc["dur"]
        shown = tokens(tl["scenes"][i].get("say", ""))
        if not shown: continue
        seg = x[int(start * SR):int((start + dur) * SR)]
        key = hashlib.sha1(seg.tobytes() + a.whisper.encode()).hexdigest()[:16]
        if key not in cache:
            if model is None:
                from faster_whisper import WhisperModel
                model = WhisperModel(a.whisper, device="cpu", compute_type="int8")
            segs, _ = model.transcribe(seg, language="en", beam_size=1, vad_filter=False, word_timestamps=True)
            cache[key] = [{"w": w.word.strip(), "t0": round(w.start, 3), "t1": round(w.end, 3)} for s in segs for w in (s.words or [])]
            heard_new += 1
        times = align(shown, cache[key])
        words = [{"w": t, "t0": round(start + a0, 3), "t1": round(start + a1, 3)} for t, (a0, a1) in zip(shown, times)]
        for ph in phrases(words):
            out.append({"scene": i, "t0": ph[0]["t0"], "t1": ph[-1]["t1"], "words": ph})
    # a phrase stays up until the next one starts (short gaps only), never past its scene's end
    ends = {sc["scene"]: sc["start"] + sc["dur"] for sc in sync["scenes"]}
    for k, c in enumerate(out):
        nxt = out[k + 1] if k + 1 < len(out) else None
        hold = nxt["t0"] if nxt and nxt["scene"] == c["scene"] and nxt["t0"] - c["t1"] < 0.6 else c["t1"] + 0.3
        c["t1"] = round(min(hold, ends[c["scene"]]), 3)
    cache_p.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    (day / "captions.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✓ captions: {len(out)} phrases, {sum(len(c['words']) for c in out)} words ({heard_new} scene(s) listened to, the rest cached)")

if __name__ == "__main__":
    main()
