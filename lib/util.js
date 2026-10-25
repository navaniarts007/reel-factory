const fs = require("fs"), path = require("path"), { spawn, execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function loadEnv() {
  const env = {}, p = path.join(ROOT, ".env");
  if (fs.existsSync(p)) for (const line of fs.readFileSync(p, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return env;
}

const readJson = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2)); };

function loadConfig() {
  const def = readJson(path.join(ROOT, "config.default.json"), {});
  const user = readJson(path.join(ROOT, "config.json"), {});
  const cfg = { ...def, ...user, llm: { ...def.llm, ...user.llm }, voice: { ...def.voice, ...user.voice } };
  cfg.root = ROOT;
  cfg.daysRoot = path.resolve(ROOT, cfg.daysRoot || "days");
  cfg.python = cfg.python || (process.platform === "win32" ? path.join(ROOT, ".venv", "Scripts", "python.exe") : "python3");
  if (!fs.existsSync(cfg.python) && cfg.python.includes(".venv")) cfg.python = process.platform === "win32" ? "python" : "python3";
  // A fresh clone has only the starter calendar: copy it once, so the user's own topics stay out of git.
  const cal = path.join(ROOT, "data", "calendar.json"), ex = path.join(ROOT, "data", "calendar.example.json");
  if (!fs.existsSync(cal) && fs.existsSync(ex)) fs.copyFileSync(ex, cal);
  return cfg;
}

// Child processes of the running job, so Stop can end them (with everything they started: ffmpeg, Chromium).
// Each belongs to a group ("job" by default; the version gallery and the chat run in their own via inGroup), so
// stopping one lane never kills another's processes.
const RUNNING = new Set(), LANE = new (require("async_hooks").AsyncLocalStorage)();
const inGroup = (group, fn) => LANE.run(group, fn);
function track(child) { child._group = LANE.getStore() || "job"; RUNNING.add(child); child.on("close", () => RUNNING.delete(child)); return child; }
function killAll(group = "job") {
  for (const c of RUNNING) {
    if (c._group !== group) continue;
    if (process.platform === "win32") spawn("taskkill", ["/PID", String(c.pid), "/T", "/F"], { windowsHide: true });
    else c.kill("SIGTERM");
  }
}

// Run a command, streaming each output line to log(); resolves on exit code 0.
function run(cmd, args, { cwd = ROOT, log = () => {}, env = {}, shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = track(spawn(cmd, args, { cwd, env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1", ...env }, windowsHide: true, shell }));
    let tail = "";
    const onData = d => { const s = d.toString(); tail = (tail + s).slice(-4000); s.split(/\r?\n|\r/).filter(Boolean).forEach(l => log(l)); };
    child.stdout.on("data", onData); child.stderr.on("data", onData);
    child.on("error", e => reject(new Error(`could not start ${cmd}: ${e.message}`)));
    child.on("close", code => code === 0 ? resolve(tail) : reject(new Error(`${path.basename(cmd)} failed (exit ${code}): ${tail.slice(-800)}`)));
  });
}

function ffprobeDuration(file, stream) {
  const args = ["-v", "error"];
  if (stream) args.push("-select_streams", stream, "-show_entries", "stream=duration");
  else args.push("-show_entries", "format=duration");
  args.push("-of", "default=nw=1:nk=1", file);
  return parseFloat(execFileSync("ffprobe", args).toString().trim().split(/\s+/)[0]);
}

const slug = s => String(s || "reel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "reel";
const wordsIn = s => (String(s || "").match(/[A-Za-z0-9']+/g) || []).length;

module.exports = { ROOT, loadEnv, readJson, writeJson, loadConfig, run, track, killAll, inGroup, ffprobeDuration, slug, wordsIn };
