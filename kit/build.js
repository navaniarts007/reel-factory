// Build a video from a timeline.
//   node build.js videos/<name>            -> out/<name>/preview.html (open it in your browser)
//   node build.js videos/<name> --render   -> out/<name>/<name>.mp4 with sound effects (+ your voice, if voice.wav/mp3 is in the folder)
// Options: --fps 30 (default from brand.js), --no-sfx
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith("--"));
if (!dir) { console.log("usage: node build.js videos/<name> [--render] [--fps 30] [--no-sfx]"); process.exit(1); }
const ROOT = __dirname, name = path.basename(path.resolve(dir)), out = path.join(ROOT, "out", name);
const has = f => args.includes(f), opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
fs.mkdirSync(out, { recursive: true });

// ---------- 1. assemble the preview page ----------
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const tl = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
const custom = fs.existsSync(path.join(dir, "custom.js")) ? fs.readFileSync(path.join(dir, "custom.js"), "utf8") : "";
for (const f of Object.values(tl.logos || {})) {                     // copy official logo files next to the page
  const src = path.join(dir, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, path.basename(f)));
  else console.warn(`! logo file not found: ${src} (the title will show without it)`);
}
const brandSrc = read("brand.js");
const fontMatch = brandSrc.match(/googleFont:\s*"([^"]+)"/);
const html = read("template.html")
  .replace("{{TITLE}}", tl.title || name)
  .replace("{{FONT}}", fontMatch ? fontMatch[1] : "Patrick+Hand")
  .replace("{{BRAND}}", () => brandSrc)
  .replace("{{THEME}}", "{}")
  .replace("{{ENGINE}}", () => read("engine.js"))
  .replace("{{COMPONENTS}}", () => read("components.js"))
  .replace("{{CUSTOM}}", () => custom)
  .replace("{{TIMELINE}}", () => JSON.stringify({ ...tl, logos: Object.fromEntries(Object.entries(tl.logos || {}).map(([k, f]) => [k, path.basename(f)])) }, null, 1));
const page = path.join(out, "preview.html");
fs.writeFileSync(page, html);
console.log(`✓ preview: ${page}`);
if (!has("--render")) process.exit(0);

// ---------- 2. render frames, record letters/strokes for sound, make a contact sheet ----------
(async () => {
  const { chromium } = require("playwright");
  const launch = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
  const browser = await chromium.launch(launch);
  const p = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const errors = []; p.on("pageerror", e => errors.push(e.message));
  await p.goto("file://" + page.replace(/\\/g, "/") + "#render");
  await p.waitForFunction(() => window.READY === true, null, { timeout: 30000 });
  await p.evaluate(async () => { if (document.fonts) await document.fonts.ready; });
  const info = await p.evaluate(() => ({ total: TOTAL, starts: STARTS, types: SCENES.map(s => s.type), durs: SCENES.map(s => s.dur) }));
  const FPS = +opt("--fps", 60), n = Math.round(info.total * FPS);
  const frames = path.join(out, "frames"); fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames);
  await p.evaluate(() => {                                     // event tracker: letters typed and stroke drawn per frame
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
  const events = [];
  const clip = { x: 0, y: 0, width: 1080, height: 1920 };
  for (let f = 0; f <= n; f++) {
    events.push(await p.evaluate(t => { render(t); return track(); }, Math.min(f / FPS, info.total)));
    await p.screenshot({ path: path.join(frames, `f${String(f).padStart(5, "0")}.jpg`), type: "jpeg", quality: 95, clip });
    if (f % (FPS * 5) === 0) process.stdout.write(`\r  rendering ${Math.round((f / n) * 100)}%`);
  }
  console.log("\r  rendering 100%");
  const sheetDir = path.join(out, "sheet"); fs.rmSync(sheetDir, { recursive: true, force: true }); fs.mkdirSync(sheetDir);
  for (let i = 0; i < info.starts.length; i++) {               // end state of every scene, for a quick review
    await p.evaluate(([i, u]) => renderScene(i, u), [i, info.durs[i] - 0.05]);
    await p.screenshot({ path: path.join(sheetDir, `s${String(i).padStart(2, "0")}.png`), clip });
  }
  await browser.close();
  if (errors.length) console.warn("! page errors:", errors);
  fs.writeFileSync(path.join(out, "events.json"), JSON.stringify(events));

  // ---------- 3. encode, add sound effects, mix the voice ----------
  const ff = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { stdio: "inherit" });
  const silent = path.join(out, "video-only.mp4"), final = path.join(out, `${name}.mp4`), sfx = path.join(out, "sfx.wav");
  ff("-framerate", String(FPS), "-i", path.join(frames, "f%05d.jpg"), "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", silent);
  fs.rmSync(frames, { recursive: true, force: true });
  const rows = Math.ceil(info.starts.length / 4);
  ff("-i", path.join(sheetDir, "s%02d.png"), "-vf", `scale=270:480,tile=4x${rows}:padding=8:color=gray`, "-frames:v", "1", path.join(out, "sheet.png"));

  const audio = [];
  if (!has("--no-sfx")) {
    const chimes = info.starts.filter((_, i) => ["hello", "bye"].includes(info.types[i])).map(s => (s + 0.3).toFixed(2));
    const py = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
    execFileSync(py, [path.join(ROOT, "sfx.py"), silent, sfx, info.starts.map(s => s.toFixed(2)).join(","), chimes.join(",") || "", path.join(out, "events.json")], { stdio: "inherit" });
    audio.push(sfx);
  }
  const voice = ["voice.wav", "voice.mp3", "voice.m4a"].map(f => path.join(dir, f)).find(f => fs.existsSync(f));
  if (voice) audio.push(voice);
  if (!audio.length) fs.copyFileSync(silent, final);
  else if (audio.length === 1) ff("-i", silent, "-i", audio[0], "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", String(info.total), final);
  else ff("-i", silent, "-i", audio[0], "-i", audio[1], "-filter_complex",
          `[1:a]volume=${tl.sfxVolume ?? 0.35}[s];[2:a]volume=1.0[v];[v][s]amix=inputs=2:duration=longest:normalize=0[a]`,
          "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", String(info.total), final);
  console.log(`✓ video: ${final}\n✓ contact sheet: ${path.join(out, "sheet.png")}${voice ? "\n✓ voice mixed: " + voice : ""}`);
})().catch(e => { console.error(e); process.exit(1); });
