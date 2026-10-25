"""Make synced sound effects for a whiteboard animation video.

usage: python3 sfx.py <video.mp4> <out.wav> <slide start times, comma separated> [hello_t,bye_t]
Reads the video, measures how much ink / purple / red appears each frame, and builds:
  marker scribble (follows drawing activity), pops (purple highlights and ticks),
  low bump (red error marks), whoosh (slide changes), chimes (hello / bye).
"""
import subprocess, sys, json
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

video, out = sys.argv[1], sys.argv[2]
cuts = [float(x) for x in sys.argv[3].split(",") if x]
chimes = [float(x) for x in sys.argv[4].split(",") if x] if len(sys.argv) > 4 else []

info = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                           "stream=r_frame_rate:format=duration", "-of", "json", video]))
num, den = map(int, info["streams"][0]["r_frame_rate"].split("/"))
FPS, DUR = num / den, float(info["format"]["duration"])
W, H = 135, 240
proc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", video, "-vf", f"scale={W}:{H}", "-f", "rawvideo",
                         "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
dark_d, purp_up, red_up = [], [], []
prev = None
while True:
    buf = proc.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    f = np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(np.int16)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    dark = (r + g + b) < 420
    purple = (b - g > 12) & (r - g > 2)
    red = (r - g > 45) & (r - b > 35)
    if prev is not None:
        dark_d.append(np.count_nonzero(dark & ~prev[0]))       # new ink appearing
        purp_up.append(max(0, np.count_nonzero(purple) - np.count_nonzero(prev[1])))
        red_up.append(max(0, np.count_nonzero(red) - np.count_nonzero(prev[2])))
    else:
        dark_d.append(0); purp_up.append(0); red_up.append(0)
    prev = (dark, purple, red)
proc.wait()
n = len(dark_d)
dark_d, purp_up, red_up = map(np.array, (dark_d, purp_up, red_up))
for c in cuts:                                                  # ignore the frame where a slide swaps in
    k = int(round(c * FPS))
    dark_d[max(0, k - 1):k + 2] = 0; purp_up[max(0, k - 1):k + 2] = 0; red_up[max(0, k - 1):k + 2] = 0

# exact events from the page itself (letters typed, stroke length drawn), if given
EV = json.load(open(sys.argv[5])) if len(sys.argv) > 5 and sys.argv[5] else None
SR = 44100
N = int(DUR * SR) + SR
rng = np.random.default_rng(7)
t_frame = np.arange(n) / FPS
mix = np.zeros(N)

def bp(x, lo, hi, order=4):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)

def add(sig, at, gain):
    i = int(at * SR)
    if i >= N: return
    j = min(N, i + len(sig)); mix[i:j] += gain * sig[:j - i]

# 1) marker scribble, loudness follows new ink per frame
src = np.array([r[1] for r in EV][:n] + [0] * max(0, n - len(EV)), float) if EV else dark_d.astype(float)
level = np.clip(src / max(1, np.percentile(src[src > 0], 85)), 0, 1.2) if np.any(src) else np.zeros(n)
env = np.interp(np.arange(N) / SR, t_frame, level)
a_up, a_dn = np.exp(-1 / (0.012 * SR)), np.exp(-1 / (0.07 * SR))   # quick attack, softer release
sm = np.zeros(N); s = 0.0
for i in range(N):                                               # one-pole follower
    x = env[i]; s = (a_up * s + (1 - a_up) * x) if x > s else (a_dn * s + (1 - a_dn) * x); sm[i] = s
grain = np.interp(np.arange(N), np.arange(0, N, 400), 0.55 + 0.45 * rng.random(N // 400 + 1))
scratch = bp(rng.standard_normal(N), 1800, 6500) * 0.6 + bp(rng.standard_normal(N), 500, 1400) * 0.25
mix += 0.22 * sm * grain * scratch / np.max(np.abs(scratch))

# 1b) keyboard typing: one key click per letter as it appears
def key(space=False):
    m = int(0.05 * SR); tt = np.arange(m) / SR
    click = bp(rng.standard_normal(m), 2200, 7000, 2) * np.exp(-tt * 700)
    f = rng.uniform(110, 140) if space else rng.uniform(170, 260)
    thock = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 110)
    return (0.0 if space else 1.0) * 0.55 * click / (np.max(np.abs(click)) + 1e-9) + (0.8 if space else 0.45) * thock
if EV:
    for k, (letters, _) in enumerate(EV):
        for i, sp in enumerate(letters):
            at = (k + (i + rng.uniform(0, 0.6)) / max(1, len(letters))) / FPS
            add(key(bool(sp)), at, 0.26 * rng.uniform(0.75, 1.0))

# 2) pops on purple highlights / ticks, low bump on red marks
def onsets(arr, thr, gap):
    out, last = [], -9
    for k in range(1, len(arr)):
        if arr[k] > thr and arr[k - 1] <= thr and (k - last) / FPS >= gap:
            out.append(k / FPS); last = k
    return out
def pop(f0=880, f1=520, dur=0.09):
    tt = np.arange(int(dur * SR)) / SR
    return np.sin(2 * np.pi * np.cumsum(np.linspace(f0, f1, len(tt))) / SR) * np.exp(-tt * 38)
def bump():
    tt = np.arange(int(0.18 * SR)) / SR
    return (np.sin(2 * np.pi * 150 * tt) + 0.4 * np.sin(2 * np.pi * 225 * tt)) * np.exp(-tt * 22)
pops = onsets(purp_up, 25, 0.22)
for k, at in enumerate(pops):
    add(pop(880 + 60 * (k % 3), 520), at, 0.32)
for at in onsets(red_up, 3, 0.3):
    add(bump(), at, 0.35)

# 3) whoosh at each slide change
def whoosh(dur=0.45):
    m = int(dur * SR); tt = np.linspace(0, 1, m)
    e = np.sin(np.pi * tt) ** 2
    return bp(rng.standard_normal(m), 350, 2600) * e
for c in cuts:
    if c > 0.1: add(whoosh(), c - 0.12, 0.22)

# 4) friendly two-note chime for hello / bye
def chime():
    out = np.zeros(int(0.9 * SR))
    for k, (f, d) in enumerate([(784, 0), (1047, 0.14)]):
        tt = np.arange(int(0.7 * SR)) / SR
        tone = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)) * np.exp(-tt * 6)
        i = int(d * SR); out[i:i + len(tone)] += tone
    return out
for c in chimes:
    add(chime(), c, 0.22)

mix = mix[:int(DUR * SR)]
mix *= 0.85 / max(1e-9, np.max(np.abs(mix)))
wavfile.write(out, SR, (mix * 32767).astype(np.int16))
print(f"fps={FPS:.0f} frames={n} pops={len(pops)} red={len(onsets(red_up, 3, 0.3))} cuts={len(cuts)}")
