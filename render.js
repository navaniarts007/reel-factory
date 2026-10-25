// Render a Day folder's timeline.json into build/final.mp4.
//   node render.js "<day folder>" [--fps 60] [--no-sfx] [--force]
// Every scene is rendered into its own cached segment. A segment is reused when the scene, its length and the kit
// are unchanged, so editing one scene re-renders only that scene. Sound effects and the voice are mixed at the end.
const fs = require("fs"), path = require("path"), crypto = require("crypto"), { execFileSync } = require("child_process");
const U = require("./lib/util");

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith("--") && !/^\d+$/.test(a));
if (!dir) { console.log('usage: node render.js "<day folder>" [--fps 60] [--no-sfx] [--force]'); process.exit(1); }
const has = f => args.includes(f), opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const KIT = path.join(__dirname, "kit"), OUT = path.join(dir, "build"), SEG = path.join(OUT, "segments");
fs.mkdirSync(SEG, { recursive: true });
const FPS = +opt("--fps", 60);
const read = f => fs.readFileSync(path.join(KIT, f), "utf8");
const sha = s => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const ff = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { stdio: "inherit" });
const PY = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

// ---------- 1. the page ----------
const tl = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
const capFile = path.join(dir, "captions.json");                 // burned-in captions, if made (py/captions.py)
if (fs.existsSync(capFile)) tl.captions = JSON.parse(fs.readFileSync(capFile, "utf8"));
// my images (Media tab): copied next to the page; a logo-kind image a scene names as "logo" joins the logos
const mediaItems = fs.existsSync(path.join(dir, "media.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "media.json"), "utf8")).items || [] : [];
const mediaHash = {};
tl.media = {};
for (const it of mediaItems) {
  const src = path.join(dir, it.file);
  if (!fs.existsSync(src)) { console.warn(`! image file missing: ${src}`); continue; }
  fs.mkdirSync(path.join(OUT, "media"), { recursive: true });
  if (it.video) {                                // a video: its poster stands in for the image, its frames play over it
    const poster = path.join(dir, it.poster), st = fs.statSync(src), start = +it.start || 0;
    const need = Math.min(it.dur - start, 1 + Math.max(0, ...tl.scenes.filter(s => s.media === it.id).map(s => s.dur || 10)));
    const v = [st.size, st.mtimeMs, start, need.toFixed(2)].join("|"), dst = path.join(OUT, "media", it.id);
    if (U.readJson(path.join(dst, "frames.json"), {}).v !== v) {
      fs.rmSync(dst, { recursive: true, force: true }); fs.mkdirSync(dst, { recursive: true });
      ff("-ss", String(start), "-i", src, "-t", need.toFixed(2), "-vf", "fps=30,scale='min(1080,iw)':-2", "-q:v", "3", path.join(dst, "f%04d.jpg"));
      U.writeJson(path.join(dst, "frames.json"), { v, n: fs.readdirSync(dst).filter(f => f.endsWith(".jpg")).length });
    }
    if (fs.existsSync(poster)) fs.copyFileSync(poster, path.join(OUT, it.poster));
    mediaHash[it.id] = sha(v) + JSON.stringify(it.spots);
    tl.media[it.id] = { url: (it.poster || "").replace(/\\/g, "/"), aspect: it.w / it.h, spots: it.spots || [],
      video: { frames: `media/${it.id}/f`, n: U.readJson(path.join(dst, "frames.json")).n, fps: 30 } };
    continue;
  }
  fs.copyFileSync(src, path.join(OUT, it.file));
  mediaHash[it.id] = sha(fs.readFileSync(src)) + JSON.stringify(it.spots);
  tl.media[it.id] = { url: it.file.replace(/\\/g, "/"), aspect: it.w / it.h, spots: it.spots || [] };
}
tl.logos = { ...(tl.logos || {}) };
for (const sc of tl.scenes) { const it = mediaItems.find(x => x.id === sc.logo); if (it && !tl.logos[it.id]) tl.logos[it.id] = it.file; }
// clip scenes (clawd, broll): their painted clip or approved still from <day>/art/<key>, as frames next to the page
const { artKey } = require("./lib/clawd");
for (const sc of tl.scenes) {
  if (!["clawd", "broll"].includes(sc.type)) continue;
  const key = artKey(sc), src = path.join(dir, "art", key), dst = path.join(OUT, "art", key);
  const clip = path.join(src, "clip.mp4"), still = path.join(src, "still.png"), meta = U.readJson(path.join(src, "art.json"), {});
  if (fs.existsSync(clip)) {
    const v = String(fs.statSync(clip).mtimeMs), fps = meta.fps || 24;
    if (U.readJson(path.join(dst, "frames.json"), {}).v !== v) {
      fs.rmSync(dst, { recursive: true, force: true }); fs.mkdirSync(dst, { recursive: true });
      ff("-i", clip, "-vf", `fps=${fps},scale=1080:-2`, "-q:v", "3", path.join(dst, "f%04d.jpg"));
      U.writeJson(path.join(dst, "frames.json"), { v, n: fs.readdirSync(dst).filter(f => f.endsWith(".jpg")).length });
    }
    sc._art = { frames: `art/${key}/f`, n: U.readJson(path.join(dst, "frames.json")).n, fps, v };
  } else if (fs.existsSync(still)) {
    fs.mkdirSync(dst, { recursive: true }); fs.copyFileSync(still, path.join(dst, "still.png"));
    sc._art = { still: `art/${key}/still.png`, v: String(fs.statSync(still).mtimeMs) };
  }
}
const custom = fs.existsSync(path.join(dir, "custom.js")) ? fs.readFileSync(path.join(dir, "custom.js"), "utf8") : "";
for (const f of Object.values(tl.logos || {})) {
  const src = path.join(dir, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, path.basename(f)));
  else console.warn(`! logo file not found: ${src}`);
}
const brandSrc = read("brand.js"), fontMatch = brandSrc.match(/googleFont:\s*"([^"]+)"/);
// the skill's look (kit/themes.js) and camera, set by the app in timeline.json
const THEMES = require("./kit/themes.js");
const { name: _look, ...theme } = THEMES[tl.theme] || THEMES.whiteboard;
const fonts = (theme.fonts && theme.fonts.google) || [fontMatch ? fontMatch[1] : "Patrick+Hand"];
const kitHash = sha(brandSrc + read("engine.js") + read("components.js") + read("template.html") + custom + JSON.stringify(tl.logos || {})
  + JSON.stringify(theme) + (tl.camera || ""));
const html = read("template.html")
  .replace("{{TITLE}}", tl.title || "Reel")
  .replace("{{FONT}}", fonts.join("&family="))
  .replace("{{BRAND}}", () => brandSrc)
  .replace("{{THEME}}", () => JSON.stringify(theme))
  .replace("{{ENGINE}}", () => read("engine.js"))
  .replace("{{COMPONENTS}}", () => read("components.js"))
  .replace("{{CUSTOM}}", () => custom)
  .replace("{{TIMELINE}}", () => JSON.stringify({ ...tl, logos: Object.fromEntries(Object.entries(tl.logos || {}).map(([k, f]) => [k, path.basename(f)])) }, null, 1));
const page = path.join(OUT, "preview.html");
fs.writeFileSync(page, html);
console.log(`✓ preview page: ${page}`);
if (has("--preview-only")) process.exit(0);

(async () => {
  const { chromium } = require("playwright");
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const p = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const errors = []; p.on("pageerror", e => errors.push(e.message));
  await p.goto(require("url").pathToFileURL(path.resolve(page)).href + "#render");   // safe for "D:\\My Video Content"
  await p.waitForFunction(() => window.READY === true, null, { timeout: 60000 });
  await p.evaluate(async () => { if (document.fonts) await document.fonts.ready; });
  const info = await p.evaluate(() => ({ total: TOTAL, starts: STARTS, types: SCENES.map(s => s.type), durs: SCENES.map(s => s.dur), lens: SCENES.map(s => s.len) }));
  // --sheet: only the picture strip (each scene's last frame, full 1080x1920 shots of the same page the video is made from)
  if (has("--sheet")) {
    const sheetDir = path.join(OUT, "sheet"); fs.rmSync(sheetDir, { recursive: true, force: true }); fs.mkdirSync(sheetDir);
    for (let i = 0; i < info.starts.length; i++) {
      await p.evaluate(async ([i, u]) => { renderScene(i, u); await settle(); }, [i, info.durs[i] - 0.05]);
      await p.screenshot({ path: path.join(sheetDir, `s${String(i).padStart(2, "0")}.png`), clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    }
    await browser.close();
    ff("-i", path.join(sheetDir, "s%02d.png"), "-vf", `scale=216:384,tile=${info.starts.length}x1:padding=6:color=white`, "-frames:v", "1", path.join(OUT, "strip.jpg"));
    fs.rmSync(sheetDir, { recursive: true, force: true });            // ~95 versions × every scene at full size would be gigabytes
    fs.writeFileSync(path.join(OUT, "sheet-info.json"), JSON.stringify({ ...info, pageErrors: errors }, null, 1));
    if (errors.length) console.warn("! page errors:", errors);
    console.log(`✓ strip: ${path.join(OUT, "strip.jpg")}`);
    return;
  }
  await p.evaluate(() => {
    const spans = [...document.querySelectorAll("tspan")], paths = [...document.querySelectorAll("path.ink")];
    const len = paths.map(q => q.getTotalLength()), seen = new Set(), drawn = paths.map(() => 0);
    const vis = n => { for (let e = n; e && e !== svg; e = e.parentNode) if (e.style && e.style.display === "none") return false; return true; };
    window.track = () => {
      const letters = [];
      spans.forEach((s, i) => { if (!seen.has(i) && +s.getAttribute("fill-opacity") >= 0.5 && vis(s)) { seen.add(i); letters.push(s.textContent === " " ? 1 : 0); } });
      let stroke = 0;
      paths.forEach((q, i) => { if (!vis(q)) return; const v = q.style.visibility === "hidden" ? 0 : 1 - (parseFloat(q.style.strokeDashoffset) || 0);
        if (v > drawn[i]) stroke += (v - drawn[i]) * Math.min(len[i], 600); drawn[i] = Math.max(drawn[i], v); });
      return [letters, Math.round(stroke)];
    };
  });

  // ---------- 2. segments: one per scene, reused when unchanged ----------
  const clip = { x: 0, y: 0, width: 1080, height: 1920 };
  const n = Math.round(info.total * FPS);
  const bounds = info.starts.map((s, i) => [Math.round(s * FPS), i + 1 < info.starts.length ? Math.round(info.starts[i + 1] * FPS) : n]);
  const segFiles = [], events = [];
  let rendered = 0;
  for (let i = 0; i < info.starts.length; i++) {
    const [f0, f1] = bounds[i];
    const caps = (tl.captions || []).filter(c => c.scene === i);   // a scene's captions are part of its picture
    const img = [tl.scenes[i].media, tl.scenes[i].logo].map(k => mediaHash[k] || "").join("|");   // the picture itself, not just its name
    const near = tl.camera === "onetake" ? JSON.stringify([tl.scenes[i - 1], tl.scenes[i + 1], info.starts[i - 1], info.starts[i + 1]]) : "";
    const key = sha(kitHash + near + JSON.stringify(tl.scenes[i]) + "|" + (f1 - f0) + "|" + FPS + (caps.length ? "|" + JSON.stringify(caps) : "") + img);
    const seg = path.join(SEG, `s${String(i).padStart(2, "0")}-${key}.mp4`), ev = seg.replace(/\.mp4$/, ".json");
    segFiles.push(seg);
    if (!has("--force") && fs.existsSync(seg) && fs.existsSync(ev)) { events.push(...JSON.parse(fs.readFileSync(ev, "utf8"))); continue; }
    const frames = path.join(OUT, "frames"); fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames);
    const segEvents = [];
    for (let f = f0; f < f1; f++) {
      segEvents.push(await p.evaluate(async t => { render(t); await settle(); return track(); }, f / FPS));
      await p.screenshot({ path: path.join(frames, `f${String(f - f0).padStart(5, "0")}.jpg`), type: "jpeg", quality: 95, clip });
    }
    ff("-framerate", String(FPS), "-i", path.join(frames, "f%05d.jpg"), "-c:v", "libx264", "-preset", "slow", "-crf", "17",
       "-pix_fmt", "yuv420p", "-r", String(FPS), seg);
    fs.rmSync(frames, { recursive: true, force: true });
    fs.writeFileSync(ev, JSON.stringify(segEvents));
    events.push(...segEvents);
    rendered++;
    console.log(`  scene ${i + 1}/${info.starts.length} rendered (${f1 - f0} frames)`);
  }
  console.log(`✓ ${rendered} scene(s) rendered, ${info.starts.length - rendered} reused from cache`);
  // drop stale segments
  const keep = new Set(segFiles.flatMap(s => [path.basename(s), path.basename(s).replace(/\.mp4$/, ".json")]));
  for (const f of fs.readdirSync(SEG)) if (!keep.has(f)) fs.rmSync(path.join(SEG, f));

  // contact sheet: the last frame of every scene
  const sheetDir = path.join(OUT, "sheet"); fs.rmSync(sheetDir, { recursive: true, force: true }); fs.mkdirSync(sheetDir);
  for (let i = 0; i < info.starts.length; i++) {
    await p.evaluate(async ([i, u]) => { renderScene(i, u); await settle(); }, [i, info.durs[i] - 0.05]);
    await p.screenshot({ path: path.join(sheetDir, `s${String(i).padStart(2, "0")}.png`), clip });
  }
  await browser.close();
  if (errors.length) console.warn("! page errors:", errors);

  // ---------- 3. join, sound effects, voice ----------
  const list = path.join(OUT, "segments.txt");
  fs.writeFileSync(list, segFiles.map(s => `file '${path.resolve(s).replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  const silent = path.join(OUT, "video-only.mp4"), final = path.join(OUT, "final.mp4"), sfx = path.join(OUT, "sfx.wav");
  ff("-f", "concat", "-safe", "0", "-i", list, "-c", "copy", silent);
  fs.writeFileSync(path.join(OUT, "events.json"), JSON.stringify(events));
  const rows = Math.ceil(info.starts.length / 4);
  ff("-i", path.join(sheetDir, "s%02d.png"), "-vf", `scale=270:480,tile=4x${rows}:padding=8:color=gray`, "-frames:v", "1", path.join(OUT, "sheet.png"));

  const audio = [];
  if (!has("--no-sfx")) {
    const chimes = info.starts.filter((_, i) => ["hello", "bye"].includes(info.types[i])).map(s => (s + 0.3).toFixed(2));
    execFileSync(PY, [path.join(KIT, "sfx.py"), silent, sfx, info.starts.map(s => s.toFixed(3)).join(","), chimes.join(",") || "", path.join(OUT, "events.json")], { stdio: "inherit" });
    audio.push(sfx);
  }
  const voice = path.join(dir, "voice.wav");
  const hasVoice = fs.existsSync(voice);
  const T = String(n / FPS);
  if (!audio.length && !hasVoice) fs.copyFileSync(silent, final);
  else if (!hasVoice) ff("-i", silent, "-i", audio[0], "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", T, final);
  else if (!audio.length) ff("-i", silent, "-i", voice, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", T, final);
  else {
    const music = path.join(dir, "music.mp3");
    const inputs = ["-i", silent, "-i", audio[0], "-i", voice];
    let fc = `[1:a]volume=${tl.sfxVolume ?? 0.35}[s];[2:a]volume=1.0,asplit=2[v][vk]`;
    let mix = "[v][s]";
    let k = 2;
    if (fs.existsSync(music)) {                        // optional background music, ducked under the voice
      inputs.push("-stream_loop", "-1", "-i", music);
      fc += `;[3:a]volume=${tl.musicVolume ?? 0.18}[m0];[m0][vk]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[m]`;
      mix += "[m]"; k = 3;
    } else fc += ";[vk]anullsink";
    fc += `;${mix}amix=inputs=${k}:duration=first:normalize=0[a]`;
    ff(...inputs, "-filter_complex", fc, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", T, final);
  }
  fs.writeFileSync(path.join(OUT, "render-info.json"), JSON.stringify({ ...info, fps: FPS, frames: n, rendered, voice: hasVoice, pageErrors: errors }, null, 1));
  console.log(`✓ video: ${final}\n✓ contact sheet: ${path.join(OUT, "sheet.png")}`);
})().catch(e => { console.error(e); process.exit(1); });
