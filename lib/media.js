// My images and videos for a Day: Day N/work/media/<file> + media.json { items: [{ id, file, note, kind, source, w, h, spots: [{ name, x, y }] }] }.
// Spots are points I click on the image (x, y from 0 to 1) so arrows can land on them. Only PNG, JPEG and WebP are kept.
// A video item also has video: true, poster (a JPEG of its first frame, for spots), dur (s) and start (s, where it begins playing);
// it's re-encoded to a silent H.264 MP4 (my voice is the only sound).
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const U = require("./util");

const MAX_BYTES = 15 * 1024 * 1024, MAX_VIDEO_BYTES = 500 * 1024 * 1024, MAX_VIDEO_SECONDS = 180;
const KINDS = ["screenshot", "photo", "diagram", "logo", "screen recording", "clip"];
const mediaPath = w => path.join(w, "media.json");
const load = w => U.readJson(mediaPath(w), { items: [] });
const save = (w, m) => U.writeJson(mediaPath(w), m);

// what the bytes really are (never trust the name or the server's content-type)
function sniff(b) {
  if (b.length > 8 && b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG") return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

function size(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file], { windowsHide: true }).toString().trim();
  const [w, h] = out.split("x").map(Number);
  if (!(w > 0 && h > 0)) throw new Error("Couldn't read the image size.");
  return { w, h };
}

// store bytes as a new media item; name/note only help make a readable id
// credit: licence + author for a found image (Wikimedia Commons); ai: made by an image model (the post gets an AI note)
function add(w, buf, { name = "", note = "", source = "upload", kind = "", credit = "", ai = false } = {}) {
  if (buf.length > MAX_BYTES) throw new Error("Image is over 15 MB.");
  const ext = sniff(buf);
  if (!ext) throw new Error("Only PNG, JPEG or WebP images can be added.");
  const m = load(w), base = U.slug(note || path.parse(name).name || "image").slice(0, 30) || "image";
  let id = base, n = 2;
  while (m.items.some(x => x.id === id)) id = `${base}-${n++}`;
  const file = `media/${id}.${ext}`, abs = path.join(w, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
  let dims;
  try { dims = size(abs); } catch (e) { fs.rmSync(abs); throw e; }
  const guess = kind || (/logo/i.test(note + name) ? "logo" : /screen|shot|desktop|dashboard|terminal|ui/i.test(note + name) ? "screenshot" : "photo");
  const item = { id, file, note: note || path.parse(name).name || id, kind: KINDS.includes(guess) ? guess : "photo", source, ...dims, spots: [],
    ...(credit ? { credit } : {}), ...(ai ? { ai: true } : {}) };
  m.items.push(item); save(w, m);
  return item;
}

// a video file already saved at tmp (upload streamed to disk): checked with ffprobe, re-encoded, poster made; tmp is removed
async function addVideo(w, tmp, { name = "", note = "", source = "upload" } = {}) {
  try {
    if (fs.statSync(tmp).size > MAX_VIDEO_BYTES) throw new Error("Video is over 500 MB.");
    let dims, dur;
    try { dims = size(tmp); dur = U.ffprobeDuration(tmp); } catch { throw new Error("That isn't a video ffmpeg can read (MP4, MOV, WebM or MKV)."); }
    if (!(dur > 0.3)) throw new Error("The video is too short.");
    const m = load(w), base = U.slug(note || path.parse(name).name || "video").slice(0, 30) || "video";
    let id = base, n = 2;
    while (m.items.some(x => x.id === id)) id = `${base}-${n++}`;
    const file = `media/${id}.mp4`, poster = `media/${id}.jpg`;
    fs.mkdirSync(path.join(w, "media"), { recursive: true });
    // fits inside 1080x1920 either way round, 30 fps, no sound, the first 3 minutes at most
    await U.run("ffmpeg", ["-y", "-loglevel", "error", "-i", tmp, "-t", String(MAX_VIDEO_SECONDS), "-map", "0:v:0", "-an",
      "-vf", "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))',scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(w, file)]);
    await U.run("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(w, file), "-frames:v", "1", "-q:v", "3", path.join(w, poster)]);
    dims = size(path.join(w, file)); dur = U.ffprobeDuration(path.join(w, file));
    const guess = /screen|record|demo|terminal|desktop|ui|browser/i.test(note + name) ? "screen recording" : "clip";
    const item = { id, file, poster, video: true, dur: +dur.toFixed(2), start: 0, note: note || path.parse(name).name || id, kind: guess, source, ...dims, spots: [] };
    m.items.push(item); save(w, m);
    return item;
  } finally { fs.rmSync(tmp, { force: true }); }
}

async function addFromLink(w, url, note = "", extra = {}) {
  let u;
  try { u = new URL(url); } catch { throw new Error("That isn't a valid link."); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) links.");
  const r = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(20000), headers: { "user-agent": "Mozilla/5.0 (ReelFactory image fetch)" } });
  if (!r.ok) throw new Error(`The site answered ${r.status}. Try downloading the image and dropping it in.`);
  if (+(r.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("Image is over 15 MB.");
  const buf = Buffer.from(await r.arrayBuffer());
  if (!sniff(buf)) throw new Error("That link isn't a PNG, JPEG or WebP image (it may be a web page). Right-click the image → Copy image address, or download it and drop it in.");
  return add(w, buf, { name: path.basename(u.pathname), note, source: url, ...extra });
}

// edits from the Media tab: note, kind, spots; items left out are deleted with their files
function update(w, items) {
  const m = load(w), keep = new Map(items.map(x => [x.id, x]));
  for (const it of m.items) if (!keep.has(it.id)) for (const f of [it.file, it.poster]) if (f) fs.rmSync(path.join(w, f), { force: true });
  m.items = m.items.filter(it => keep.has(it.id)).map(it => {
    const e = keep.get(it.id);
    return { ...it, note: String(e.note ?? it.note).slice(0, 200), kind: KINDS.includes(e.kind) ? e.kind : it.kind,
      ...(it.video ? { start: Math.max(0, Math.min(it.dur - 0.5, +e.start || 0)) } : {}),
      spots: (e.spots || []).filter(s => s.name && s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1)
        .map(s => ({ name: String(s.name).slice(0, 40), x: +(+s.x).toFixed(4), y: +(+s.y).toFixed(4) })) };
  });
  save(w, m);
  return m;
}

// the media list as Claude reads it in the prompts
function forPrompt(w) {
  const items = load(w).items;
  if (!items.length) return "none (don't use image scenes or logos)";
  return items.map(it => `- id "${it.id}": ${it.video ? `VIDEO (${it.kind}, plays silently inside the image scene from ${it.start || 0} s, ${Math.max(0, it.dur - (it.start || 0)).toFixed(1)} s long; give it a scene whose line lasts about that long)` : it.kind}, ${it.w}x${it.h} (${it.w >= it.h ? "landscape" : "portrait"}). Note: ${it.note}.` +
    (it.spots.length ? ` Spots: ${it.spots.map(s => `"${s.name}"`).join(", ")}.` : " No spots marked.")).join("\n");
}

module.exports = { load, add, addVideo, addFromLink, update, forPrompt, KINDS, MAX_VIDEO_BYTES };
