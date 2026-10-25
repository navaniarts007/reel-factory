// Studio films: a full custom film made by Claude Code WITH tools, following one of the pulled GitHub skills, on my
// approved script and synced voice. Runs only inside <work>/studio/<name>/ (the one place the app lets Claude use tools).
// Result: <work>/build/studio-<name>.mp4 with my voice muxed in; "Use as final" makes export pick it.
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const U = require("./util"), S = require("./skills");

const link = (target, at) => { fs.mkdirSync(path.dirname(at), { recursive: true }); fs.rmSync(at, { recursive: true, force: true }); fs.symlinkSync(target, at, "junction"); };

// Set up the studio folder: assets, the skill (linked, not copied, except Clawd's kit which the film is built inside), BRIEF.md.
async function prepare(cfg, p, work, { skill, style }, log) {
  const k = S.get(skill);
  if (!k.studio) throw new Error(`${k.name} has no Studio film.`);
  const src = S.vendorDir(k.id);
  if (!fs.existsSync(path.join(src, ".git"))) throw new Error(`${k.name} isn't pulled yet: Settings → Skills → Pull.`);
  const name = k.id + (style ? "-" + style : ""), dir = path.join(work, "studio", name), A = path.join(dir, "assets");
  fs.mkdirSync(A, { recursive: true });
  for (const f of ["voice.wav", "captions.json", "timeline.json", "sync.json", "script.txt"]) if (fs.existsSync(path.join(work, f))) fs.copyFileSync(path.join(work, f), path.join(A, f));
  if (fs.existsSync(path.join(work, "media"))) fs.cpSync(path.join(work, "media"), path.join(A, "media"), { recursive: true });
  if (fs.existsSync(path.join(work, "media.json"))) fs.copyFileSync(path.join(work, "media.json"), path.join(A, "media.json"));

  let where = "";
  if (k.id === "clawd") {                                      // the film is built inside a vertical copy of the kit
    for (const f of ["src", "render.mjs", "studio.html", "package.json", "package-lock.json", "ANIMATION_GUIDE.md", "docs"]) {
      fs.rmSync(path.join(dir, f), { recursive: true, force: true }); fs.cpSync(path.join(src, f), path.join(dir, f), { recursive: true });
    }
    const patch = (f, a, b) => { const q = path.join(dir, f); fs.writeFileSync(q, fs.readFileSync(q, "utf8").replace(a, b)); };
    patch("src/core.js", "const W = 1920, H = 1080;", "const W = 1080, H = 1920;");
    patch("studio.html", 'width="1920" height="1080"', 'width="1080" height="1920"');
    patch("render.mjs", "--window-size=1920,1080", "--window-size=1080,1920");
    const nm = path.join(U.ROOT, "vendor", "clawd-studio", "node_modules");
    if (fs.existsSync(nm) && !fs.existsSync(path.join(dir, "node_modules"))) fs.cpSync(nm, path.join(dir, "node_modules"), { recursive: true });
    where = `This folder is the Claude Animation Base kit, set to a vertical 1080×1920 canvas (src/core.js). Read ANIMATION_GUIDE.md first and follow it.
Render with: node render.mjs --clip --fps=24 --out=final-silent.mp4 --chrome="${require("playwright").chromium.executablePath()}"`;
  } else {
    for (const d of k.studio.skillDirs) {
      const base = path.join(src, d);
      if (d === ".") link(base, path.join(dir, ".claude", "skills", k.id));
      else for (const s of fs.readdirSync(base)) if (fs.existsSync(path.join(base, s, "SKILL.md"))) link(path.join(base, s), path.join(dir, ".claude", "skills", s));
    }
    where = `The ${k.name} skill is installed in .claude/skills/ (its full repo: ${src}). ${k.studio.entry}`;
    if (k.id === "lemo") where += `\nThe Lemo-Opuscar library is already cloned at ${src}: use it as LIB (don't clone it again). Style: ${style || "pick the best fit for the topic"} (styles/${style || "<slug>"}/STYLE.md).`;
  }

  const tl = U.readJson(path.join(work, "timeline.json")), sync = U.readJson(path.join(work, "sync.json"), {});
  const total = U.ffprobeDuration(path.join(work, "voice.wav"));
  fs.writeFileSync(path.join(dir, "BRIEF.md"), `# Studio film: Day ${p.day}, "${tl.title}"

Make ONE vertical short film (1080×1920, 30 fps or more) for this approved reel, in the ${k.name} world${style ? ` (style: ${style})` : ""}.

## Fixed (don't change)
- The narration is my own voice: assets/voice.wav, ${total.toFixed(2)} s. The film must be exactly that long, and the picture must follow it:
  scene timings are in assets/timeline.json (each scene's "dur", in order) and assets/sync.json; word timings in assets/captions.json.
- The words are approved: don't add narration, don't change what is said. On-screen text must match the script (assets/script.txt).
- Don't draw or redraw brand logos. My images (assets/media, described in assets/media.json) may be used as they are.
- Captions: burn in my captions from assets/captions.json (phrases with word times) in the bottom band, around y = 1520 of 1920:
  a dark rounded bar, white words, the word being spoken lit in the accent colour. Keep other content out of that band.
- Facts on screen only from the script.

## How
${where}
- Work only inside this folder. Don't install system software; packages go into this folder.
- Check your own frames (contact sheets / stills) before the final render.

## Deliver
- final.mp4 in this folder: the picture, ${total.toFixed(2)} s, 1080×1920. Audio is optional: I mux assets/voice.wav myself.
- When done, reply with one line: what you made.
`);
  log(`studio folder ready: ${dir}`);
  return { dir, name, total };
}

// Run Claude Code with tools in the studio folder; stream what it does to the log.
function runAgent(cfg, dir, log, timeoutMs = 2 * 3600 * 1000) {
  return new Promise((resolve, reject) => {
    const win = process.platform === "win32", q = s => win ? `"${s}"` : s;
    const args = ["-p", q("Read BRIEF.md in this folder and make the film it describes. Work only inside this folder."),
      "--permission-mode", "acceptEdits", "--allowedTools", q("Bash Read Write Edit Glob Grep TodoWrite Skill"),
      "--output-format", "stream-json", "--verbose"];
    const bin = cfg.llm.claudeBin || "claude";              // quoted: the shell would split a path with spaces
    const child = U.track(spawn(win && /\s/.test(bin) ? `"${bin}"` : bin, args, { cwd: dir, shell: win, windowsHide: true }));
    const timer = setTimeout(() => { U.killAll(); reject(new Error("Studio film took longer than 2 hours: stopped.")); }, timeoutMs);
    let buf = "", result = null;
    child.stdout.on("data", d => {
      buf += d; const lines = buf.split("\n"); buf = lines.pop();
      for (const l of lines) {
        let j; try { j = JSON.parse(l); } catch { continue; }
        if (j.type === "assistant") for (const c of j.message?.content || []) {
          if (c.type === "text" && c.text.trim()) log("  " + c.text.trim().split("\n")[0].slice(0, 160));
          if (c.type === "tool_use") log(`  · ${c.name}${c.input?.command ? ": " + String(c.input.command).slice(0, 100) : c.input?.file_path ? ": " + path.basename(c.input.file_path) : ""}`);
        }
        if (j.type === "result") result = j;
      }
    });
    child.stderr.on("data", d => log("  ! " + String(d).trim().slice(0, 200)));
    child.on("error", e => { clearTimeout(timer); reject(new Error(`Could not start Claude Code: ${e.message}`)); });
    child.on("close", code => {
      clearTimeout(timer);
      if (result?.is_error || (!result && code)) return reject(new Error("Studio film failed: " + (result?.result || `exit ${code}`)));
      resolve(String(result?.result || ""));
    });
  });
}

// Mux my voice onto the studio picture and check its length against the voice.
async function finish(work, dir, name, total, log) {
  const pic = path.join(dir, "final.mp4");
  if (!fs.existsSync(pic)) throw new Error("The studio run ended without final.mp4.");
  const len = U.ffprobeDuration(pic), out = path.join(work, "build", `studio-${name}.mp4`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await U.run("ffmpeg", ["-y", "-loglevel", "error", "-i", pic, "-i", path.join(work, "voice.wav"), "-map", "0:v:0", "-map", "1:a",
    "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-t", String(total), out]);
  const off = len - total;
  log(Math.abs(off) <= 0.15 ? `✓ studio film: ${len.toFixed(2)} s, matches the voice` : `! studio film is ${len.toFixed(2)} s, the voice ${total.toFixed(2)} s (${off > 0 ? "cut" : "the end holds silent"}): check the sync`);
  return { file: `studio-${name}.mp4`, len, off };
}

module.exports = { prepare, runAgent, finish };
