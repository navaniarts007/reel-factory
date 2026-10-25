// ============ ENGINE ============
// Drawing helpers, the timeline runner and playback. Components live in components.js.
// Everything is a function of time: render(t) always draws the same frame for the same t.

const INK = BRAND.colors.ink, ACCENT = BRAND.colors.accent, BAD = BRAND.colors.bad, MUTED = BRAND.colors.muted, PAPER = BRAND.colors.paper;
const svg = document.getElementById("stage");

const el = (tag, attrs = {}, parent = svg) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return parent.appendChild(n);
};
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog  = (t, a, b) => clamp((t - a) / (b - a));
const lerp  = (a, b, p) => a + (b - a) * p;
const ease  = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const pulse = p => Math.sin(Math.PI * clamp(p));

let seed = 21;                                     // seeded wobble: identical on every run
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const WOB = BRAND.wobble ?? 1;                     // the look's hand-drawn jitter (0 = clean lines)
const j = a => (rnd() - 0.5) * 2 * a * WOB;
const pt = (x, y, a = 1.2) => `${(x + j(a)).toFixed(1)} ${(y + j(a)).toFixed(1)}`;

// ---------- hand-drawn shapes (path data) ----------
const rectD = (x, y, w, h, r = 8) =>
  `M ${pt(x + r, y)} Q ${pt(x + w / 2, y)} ${pt(x + w - r, y)} Q ${pt(x + w, y, .4)} ${pt(x + w, y + r)}
   Q ${pt(x + w, y + h / 2)} ${pt(x + w, y + h - r)} Q ${pt(x + w, y + h, .4)} ${pt(x + w - r, y + h)}
   Q ${pt(x + w / 2, y + h)} ${pt(x + r, y + h)} Q ${pt(x, y + h, .4)} ${pt(x, y + h - r)}
   Q ${pt(x, y + h / 2)} ${pt(x, y + r)} Q ${pt(x, y, .4)} ${pt(x + r + 4, y)}`;
const lineD = (x1, y1, x2, y2, a = 1) => `M ${pt(x1, y1, a)} Q ${pt((x1 + x2) / 2, (y1 + y2) / 2, a * 1.6)} ${pt(x2, y2, a)}`;
const arrowD = (x1, y1, x2, y2) => {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 9, s = 0.5;
  return `${lineD(x1, y1, x2, y2)} M ${(x2 - h * Math.cos(a - s)).toFixed(1)} ${(y2 - h * Math.sin(a - s)).toFixed(1)} L ${x2} ${y2}
          L ${(x2 - h * Math.cos(a + s)).toFixed(1)} ${(y2 - h * Math.sin(a + s)).toFixed(1)}`;
};
const circD = (cx, cy, r, n = 26) => {
  let d = "";
  for (let i = 0; i <= n + 1; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    d += (i ? " L " : "M ") + pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.25 + r * 0.03);
  }
  return d;
};
const tickD = (x, y, s = 1) => `M ${x - 10 * s} ${y} L ${x - 3 * s} ${y + 8 * s} L ${x + 12 * s} ${y - 10 * s}`;
const squigD = (x, y, w) => { let d = `M ${x} ${y} Q ${x + 5} ${y - 5} ${x + 10} ${y}`; for (let k = 20; k <= w; k += 10) d += ` T ${x + k} ${y}`; return d; };
const sparkD = (x, y, r) => `M ${x} ${y - r} Q ${x} ${y} ${x + r} ${y} Q ${x} ${y} ${x} ${y + r} Q ${x} ${y} ${x - r} ${y} Q ${x} ${y} ${x} ${y - r} Z`;
const underlineD = (cx, y, w) => `M ${pt(cx - w / 2, y)} Q ${pt(cx, y + 7, 2)} ${pt(cx + w / 2, y - 3)}`;

// ---------- drawing and writing ----------
function ink(d, parent, color = INK, w = BRAND.stroke) {
  const p = el("path", { d, class: "ink", pathLength: 1 }, parent);
  p.style.stroke = color; p.style.strokeWidth = w;
  return p;
}
function draw(path, p) { path.style.strokeDashoffset = 1 - p; path.style.visibility = p > 0 ? "visible" : "hidden"; }
function drawAll(paths, a, b) { const s = (b - a) / paths.length; return u => paths.forEach((p, i) => draw(p, prog(u, a + i * s, a + (i + 1) * s))); }
// Text appears letter by letter. maxW shrinks the font once if the line would be too wide.
function handText(str, x, y, size, parent, fill = INK, cls = "", maxW = 470) {
  const t = el("text", { x, y, "font-size": size, fill, class: cls }, parent);
  const letters = [...String(str)].map(ch => { const s = el("tspan", { "fill-opacity": 0 }, t); s.textContent = ch; return s; });
  letters.node = t; letters.maxW = maxW; letters.size = size;
  return letters;
}
function write(letters, p) {
  if (!letters.fitted) {
    letters.fitted = true;
    const w = letters.node.getComputedTextLength();
    if (w > letters.maxW) letters.node.setAttribute("font-size", (letters.size * letters.maxW / w).toFixed(1));
  }
  const n = p * letters.length;
  letters.forEach((s, i) => s.setAttribute("fill-opacity", clamp(n - i)));
}
const show = (node, o) => node.setAttribute("opacity", clamp(o));
const scaleAt = (node, s, x, y) => node.setAttribute("transform", `translate(${x} ${y}) scale(${s}) translate(${-x} ${-y})`);
function swipe(rect, w, p, o = 1) { rect.setAttribute("width", w * p); show(rect, o); }
function hl(x, y, w, h, parent, color = ACCENT, op = 0.3) {
  return el("rect", { x, y, width: 0, height: h, rx: 9, fill: color, "fill-opacity": op, opacity: 0 }, parent);
}

// ---------- logos: official logo files listed in the timeline, shown beside a title ----------
const LOGOS = {};
function loadLogos(map) {
  return Promise.all(Object.entries(map || {}).map(([k, f]) => new Promise(res => {
    const im = new Image();
    im.onload = () => { LOGOS[k] = { url: f, aspect: (im.naturalWidth && im.naturalHeight) ? im.naturalWidth / im.naturalHeight : 1.25 }; res(); };
    im.onerror = () => res();
    im.src = f;
  })));
}
function logoTitle(letters, key) {                  // places logo `key` to the left of a title, centered as a pair
  const t = letters.node, cx = +t.getAttribute("x"), y = +t.getAttribute("y"), size = letters.size;
  const img = el("image", { opacity: 0 }, t.parentNode);
  return p => {
    const L = key && LOGOS[key];
    if (!L) { show(img, 0); return; }
    const h = size * 1.1, w = h * L.aspect, gap = 12, tw = t.getComputedTextLength(), left = cx - (w + gap + tw) / 2;
    t.setAttribute("x", (left + w + gap + tw / 2).toFixed(1));
    img.setAttribute("href", L.url); img.setAttribute("width", w.toFixed(1)); img.setAttribute("height", h.toFixed(1));
    img.setAttribute("x", left.toFixed(1)); img.setAttribute("y", (y - h * 0.82).toFixed(1));
    show(img, p); scaleAt(img, 0.6 + 0.4 * p, left + w / 2, y - h * 0.32);
  };
}

// ---------- my images (Media tab): preloaded so every frame has them ----------
const MEDIA = {};
function loadMedia(map) {
  return Promise.all(Object.entries(map || {}).map(([k, m]) => new Promise(res => {
    const im = new Image();
    im.onload = () => { MEDIA[k] = m; (im.decode ? im.decode() : Promise.resolve()).then(res, res); };
    im.onerror = () => res();
    im.src = m.url;
  })));
}
const normWord = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

// ---------- timeline runner ----------
// Each component is make(g, props) -> { run(u), len } where len is how long its animation needs.
// If a scene is shorter than len, the animation is sped up to fit.
let SCENES = [], STARTS = [], TOTAL = 0;
function buildTimeline(tl) {
  let at = 0;
  SCENES = tl.scenes.map((sc, i) => {
    const make = COMPONENTS[sc.type];
    if (!make) throw new Error(`Scene ${i + 1}: unknown component "${sc.type}"`);
    const g = el("g");
    // the scene's spoken words with times from its own start (from the captions), so things can land on a word
    const words = (tl.captions || []).filter(c => c.scene === i).flatMap(c => c.words).map(w => ({ w: normWord(w.w), t: w.t0 - at }));
    at += sc.dur || 0;
    const c = make(g, { ...sc, _words: words });
    return { g, run: c.run, len: c.len, dur: sc.dur || c.len + 1.5, type: sc.type };
  });
  let t = 0; STARTS = SCENES.map(s => { const a = t; t += s.dur; return a; }); TOTAL = t;
}
function runScene(i, u) { const s = SCENES[i]; s.run(Math.max(0, u) * Math.max(1, s.len / Math.max(0.5, s.dur - 0.4))); }
function renderScene(i, u) {
  SCENES.forEach((s, k) => { s.g.style.display = k === i ? "" : "none"; s.g.removeAttribute("transform"); });
  runScene(i, u);
}
function render(t) {
  let i = SCENES.length - 1;
  while (i > 0 && t < STARTS[i]) i--;
  if (CAMERA === "onetake" && SCENES.length > 1) renderOneTake(t, i); else renderScene(i, t - STARTS[i]);
  drawCaptions(t);
}

// ---------- OneTake camera: every scene sits on one big plane and the camera travels between them ----------
// No cuts: around each scene change the camera pulls back, leans and whips to the next scene, then settles.
// Scene lengths (synced to the voice) don't change: the move starts 0.4 s before the new scene and lands 0.2 s after.
// Each scene starts drawing LEAD s early, so the camera arrives on something already moving (words land just before they're said).
let CAMERA = "cut", WORLD = [];
const MOVE_A = 0.4, MOVE_B = 0.2, LEAD = 0.3;
function layoutWorld() {                            // a winding path: right, down, right, up… so moves alternate
  const dirs = [[600, 0], [0, 1000], [600, 0], [0, -1000], [600, 0], [0, 1000], [-600, 0], [0, 1000]];
  let x = 0, y = 0;
  WORLD = SCENES.map((_, i) => { if (i) { const d = dirs[(i - 1) % dirs.length]; x += d[0]; y += d[1]; } return [x, y]; });
}
const quartInOut = p => p < 0.5 ? 8 * p ** 4 : 1 - 8 * (1 - p) ** 4;
function cameraAt(t, i) {                            // [x, y, zoom, lean] of the camera at time t (i = current scene)
  let k = i, p = 1;
  if (i + 1 < SCENES.length && t > STARTS[i + 1] - MOVE_A) { k = i + 1; p = prog(t, STARTS[k] - MOVE_A, STARTS[k] + MOVE_B); }
  else if (i > 0 && t < STARTS[i] + MOVE_B) p = prog(t, STARTS[i] - MOVE_A, STARTS[i] + MOVE_B);
  const a = WORLD[Math.max(0, k - 1)], b = WORLD[k], e = k ? quartInOut(p) : 1;
  let x = lerp(a[0], b[0], e), y = lerp(a[1], b[1], e);
  const since = t - (STARTS[k] + MOVE_B);            // landing: a small damped overshoot along the move
  if (k && since > 0) { const s = Math.exp(-since * 7) * Math.sin(since * 22) * 9, dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]); x += dx * s; y += dy * s; }
  x += Math.sin(t * 0.9) * 2.2; y += Math.sin(t * 0.7 + 1.3) * 1.8;   // an operator's hand: a slow float
  const mid = k ? Math.sin(Math.PI * p) : 0;
  return [x, y, 1 - 0.2 * mid, (k ? Math.sign((b[0] - a[0]) || (b[1] - a[1])) : 0) * 1.6 * mid];
}
function renderOneTake(t, i) {
  if (!WORLD.length) layoutWorld();
  const [cx, cy, z, lean] = cameraAt(t, i);
  const view = s => Math.abs(WORLD[s][0] - cx) < 540 / z + 60 && Math.abs(WORLD[s][1] - cy) < 960 / z + 60;
  SCENES.forEach((s, k) => {
    const on = (k === i || k === i - 1 || k === i + 1) && view(k);
    s.g.style.display = on ? "" : "none";
    if (!on) return;
    s.g.setAttribute("transform", `translate(270 480) scale(${z.toFixed(4)}) rotate(${lean.toFixed(3)}) translate(${(WORLD[k][0] - cx - 270).toFixed(2)} ${(WORLD[k][1] - cy - 480).toFixed(2)})`);
    runScene(k, t - STARTS[k] + (k ? LEAD : 0));
  });
  if (BACKDROP) BACKDROP.setAttribute("patternTransform", `translate(${(-cx * 0.5).toFixed(2)} ${(-cy * 0.5).toFixed(2)})`);
}

// ---------- the look's backdrop (texture under the scenes) and overlay (over them) ----------
let BACKDROP = null;
function setupBackdrop() {
  const T = BRAND.texture || {}, defs = el("defs");
  const pat = (id, s, draw, rot = 0) => { const p = el("pattern", { id, width: s, height: s, patternUnits: "userSpaceOnUse", patternTransform: rot ? `rotate(${rot})` : "" }, defs); draw(p, s); return p; };
  const c = T.color || INK, o = T.opacity ?? 0.1, s = T.size || 24;
  let fill = null;
  if (T.kind === "grid") { BACKDROP = pat("tex", s, (p, s) => el("path", { d: `M ${s} 0 L 0 0 0 ${s}`, fill: "none", stroke: c, "stroke-width": 0.7 }, p)); fill = "url(#tex)"; }
  if (T.kind === "dots") { BACKDROP = pat("tex", s, (p, s) => el("circle", { cx: s / 2, cy: s / 2, r: 1.3, fill: c }, p)); fill = "url(#tex)"; }
  if (T.kind === "halftone") { BACKDROP = pat("tex", s, (p, s) => el("circle", { cx: s / 2, cy: s / 2, r: s * 0.3, fill: c }, p), 45); fill = "url(#tex)"; }
  if (fill) el("rect", { x: -40, y: -40, width: 620, height: 1040, fill, opacity: o });
  if (T.kind === "grain") {
    const f = el("filter", { id: "grain", x: 0, y: 0, width: 1, height: 1 }, defs);
    el("feTurbulence", { type: "fractalNoise", baseFrequency: 0.85, numOctaves: 2, seed: 7 }, f);
    el("feColorMatrix", { values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.4 -0.45" }, f);
    el("rect", { x: 0, y: 0, width: 540, height: 960, filter: "url(#grain)", opacity: o });
  }
  if (BRAND.glow) svg.style.filter = `drop-shadow(0 0 2.4px ${INK}99)`;
}
function setupOverlay() {
  const T = BRAND.texture || {};
  if (T.overlay !== "scanlines") return;
  const defs = svg.querySelector("defs") || el("defs"), p = el("pattern", { id: "scan", width: 4, height: 4, patternUnits: "userSpaceOnUse" }, defs);
  el("rect", { x: 0, y: 0, width: 4, height: 1.6, fill: T.color || "#000" }, p);
  el("rect", { x: 0, y: 0, width: 540, height: 960, fill: "url(#scan)", opacity: T.opacity ?? 0.25, "pointer-events": "none" });
}

// ---------- images that must be loaded before a frame is captured (clip scenes) ----------
const PENDING = [];
async function settle() { while (PENDING.length) await PENDING.shift(); }

// ---------- burned-in captions: the phrase being spoken, its current word lit ----------
// tl.captions = [{ t0, t1, words: [{ w, t0, t1 }] }] in seconds (from py/captions.py). Drawn over every scene.
let CAPS = [], capG = null, capK = -1;
function setupCaptions(list) {
  CAPS = list || [];
  if (!CAPS.length) return;
  const C = BRAND.captions;
  capG = el("g", { opacity: 0 });                     // added after the scenes, so it sits on top
  capG.bg = el("rect", { rx: 16, fill: C.bg }, capG);
  capG.txt = el("text", { x: 270, y: (C.y + C.size * 0.33).toFixed(1), "font-size": C.size, fill: C.text }, capG);
}
function drawCaptions(t) {
  if (!capG) return;
  const k = CAPS.findIndex(c => t >= c.t0 && t < c.t1), C = BRAND.captions;
  if (k < 0) { show(capG, 0); return; }
  const c = CAPS[k];
  if (k !== capK) {                                   // a new phrase: one tspan per word
    capK = k; capG.txt.textContent = "";
    capG.words = c.words.map((w, i) => { const s = el("tspan", {}, capG.txt); s.textContent = (i ? " " : "") + w.w; return s; });
  }
  capG.txt.setAttribute("font-size", C.size);         // measured every frame: the font may load after the first frame
  let w = capG.txt.getComputedTextLength();
  if (w > 470) { capG.txt.setAttribute("font-size", (C.size * 470 / w).toFixed(1)); w = 470; }
  const h = C.size * 1.6, pad = 20;
  capG.bg.setAttribute("x", (270 - w / 2 - pad).toFixed(1)); capG.bg.setAttribute("width", (w + 2 * pad).toFixed(1));
  capG.bg.setAttribute("y", (C.y - h / 2).toFixed(1)); capG.bg.setAttribute("height", h.toFixed(1));
  c.words.forEach((x, i) => capG.words[i].setAttribute("fill", t >= x.t1 ? C.text : t >= x.t0 ? C.now : C.next));
  const pop = prog(t, c.t0, c.t0 + 0.12);             // each phrase pops in
  show(capG, pop); scaleAt(capG, 0.94 + 0.06 * ease(pop), 270, C.y);
}

// ---------- playback in the browser ----------
let raf = 0;
function play(which) {
  cancelAnimationFrame(raf);
  const all = which === "all", total = all ? TOTAL : SCENES[+which].dur;
  let start = null;
  const frame = now => {
    if (start === null) start = now;
    const t = Math.min((now - start) / 1000, total);
    all ? render(t) : renderScene(+which, t);
    if (t < total) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}
async function boot(tl) {
  await loadLogos(tl.logos);
  await loadMedia(tl.media);
  CAMERA = tl.camera || "cut";
  setupBackdrop();
  buildTimeline(tl);
  setupOverlay();
  setupCaptions(tl.captions);
  const controls = document.getElementById("controls");
  if (controls) {
    const add = (label, v) => { const b = document.createElement("button"); b.textContent = label; b.onclick = () => play(v); controls.appendChild(b); };
    add("Play all", "all");
    SCENES.forEach((s, i) => add(`Scene ${i + 1}`, i));
  }
  render(0);
  window.READY = true;
  if (!window.RENDER_MODE) { await (document.fonts ? document.fonts.ready : 0); play("all"); }
}
