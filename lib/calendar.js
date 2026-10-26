// Content calendar (data/calendar.json) and the Day number they share with the Day folders.
// One rule keeps the Reels page and the Calendar page in step: a topic belongs to Day N when its "day" is N.
// Each topic: { id, day?, topic (the title), notes, status: ready|in progress|done, postedAt?: "YYYY-MM-DDTHH:MM" }.
const fs = require("fs"), path = require("path");
const U = require("./util");
const P = () => require("./pipeline");

const calPath = cfg => path.join(cfg.root, "data", "calendar.json");
const load = cfg => { const c = U.readJson(calPath(cfg), { topics: [] }); c.topics = c.topics || []; return c; };

// After any calendar save: each app-made Day points at the topic with its number (or at none).
// A topic with no day yet that a Day still points at (older calendars) takes that Day's number.
function link(cfg, cal) {
  const pl = P();
  for (const { day, status } of pl.listProjects(cfg)) {
    if (status === "manual") continue;
    const p = pl.load(cfg, day); if (!p) continue;
    let t = cal.topics.find(x => x.day === day);
    if (!t && p.calendarId) { const old = cal.topics.find(x => x.id === p.calendarId && !x.day); if (old) { old.day = day; t = old; } }
    const id = t ? t.id : null;
    if ((p.calendarId || null) !== id) { p.calendarId = id; pl.save(cfg, p); }
  }
  return cal;
}
function save(cfg, cal) { U.writeJson(calPath(cfg), link(cfg, cal)); return cal; }

// The topic a new reel takes its Day number from: its pinned day if that Day folder is free, else the next day.
function dayFor(cfg, topicId) {
  const pl = P(), t = topicId && load(cfg).topics.find(x => x.id === topicId);
  const n = t?.day && !fs.existsSync(pl.dayDir(cfg, t.day)) && t.day >= 0 ? t.day : pl.nextDay(cfg);
  return n;
}

// A number the way the voice lines write it: 15 → "fifteen", 21 → "twenty-one", 120 → "one hundred twenty".
const ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
function inWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
  return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + inWords(n % 100) : "");
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// "Day 12" → "Day 15" and "Day twelve" → "Day fifteen" (and the bye line's Day 13 → Day 16) in every text the reel was made with.
function swapDay(s, from, to) {
  const map = new Map();
  for (const [a, b] of [[from, to], [from + 1, to + 1]]) {
    map.set(String(a), String(b));
    if (a < 1000 && b < 1000) {
      map.set(inWords(a), inWords(b));
      if (inWords(a).includes("-")) map.set(inWords(a).replace(/-/g, " "), inWords(b).replace(/-/g, " "));   // "twenty one" too
    }
  }
  const keys = [...map.keys()].sort((x, y) => y.length - x.length).map(esc);           // longest first: "twenty-one" before "twenty"
  const re = new RegExp(`\\b(Day|day|DAY) (${keys.join("|")})(?![\\w-])`, "gi");
  return s.replace(re, (m, w, n) => {
    const k = [...map.keys()].find(x => x.toLowerCase() === n.toLowerCase());
    let v = map.get(k);
    if (n[0] === n[0].toUpperCase() && /[a-z]/i.test(n[0])) v = v[0].toUpperCase() + v.slice(1);   // "Fifteen" stays capitalised
    return `${w} ${v}`;
  }).replace(/\bday(\d+)-/g, (m, n) => +n === from ? `day${to}-` : m);
}
function swapFile(f, from, to) {
  if (!fs.existsSync(f)) return false;
  const a = fs.readFileSync(f, "utf8"), b = swapDay(a, from, to);
  if (a !== b) fs.writeFileSync(f, b);
  return a !== b;
}

// Give a Day a new number: renames the Day folder and its exported files, and updates the script, copy and versions.
// A voiced reel keeps its clips; only the hello and bye lines (which say the day) are voiced again next time.
function renumber(cfg, from, to) {
  const pl = P(), G = require("./gallery");
  from = +from; to = +to;
  if (!Number.isInteger(to) || to < 0) throw new Error("The Day number must be 0 or more.");
  if (from === to) return { day: to, changed: [] };
  const src = pl.dayDir(cfg, from), dst = pl.dayDir(cfg, to);
  if (!fs.existsSync(src)) throw new Error(`There is no Day ${from} folder.`);
  if (fs.existsSync(dst)) throw new Error(`Day ${to} already exists. Pick a free number, or change that Day first.`);
  if (pl.isBusy(from)) throw new Error(`A job is running for Day ${from}. Wait for it to finish, or press Stop.`);
  const g = G.status(cfg, from);
  if (g?.running || g?.waiting) throw new Error(`Versions are being made for Day ${from}. Stop them first.`);
  fs.renameSync(src, dst);
  const changed = [];
  for (const f of fs.readdirSync(dst)) {
    const m = f.match(/^day(\d+)-(.*)$/);
    if (m && +m[1] === from) { fs.renameSync(path.join(dst, f), path.join(dst, `day${to}-${m[2]}`)); changed.push(f); }
  }
  const w = path.join(dst, "work"), p = U.readJson(path.join(w, "project.json"));
  let voiced = false;
  if (p) {
    for (const f of ["timeline.json", "copy.json", "copy.md", "script.txt"]) if (swapFile(path.join(w, f), from, to)) { changed.push(f); if (f === "timeline.json") voiced = !!p.done?.voice; }
    const vd = path.join(w, "variants");
    if (fs.existsSync(vd)) for (const v of fs.readdirSync(vd)) {
      const d = path.join(vd, v);
      if (v === "_designs") { for (const f of fs.readdirSync(d)) swapFile(path.join(d, f), from, to); }
      else swapFile(path.join(d, "timeline.json"), from, to);
    }
    p.day = to;
    for (const k of ["title", "topic"]) if (typeof p[k] === "string") p[k] = swapDay(p[k], from, to);
    if (voiced) {
      p.finalFile = null;
      for (const s of ["voice", "sync", "render", "checks"]) delete p.done[s];
      p.log = [...(p.log || []), `[${new Date().toLocaleTimeString("en-IN", { hour12: false })}] Day ${from} is now Day ${to}: the hello and bye lines changed. Press Generate voice (only those scenes are voiced again), then Render.`];
    }
    pl.LIVE.delete(from);
    pl.save(cfg, p);
  }
  const cal = load(cfg);
  for (const t of cal.topics) if (t.day === from) t.day = to;
  save(cfg, cal);
  return { day: to, changed, revoice: voiced };
}

// Title and post date of a Day, from either page: the Day's project and its calendar topic stay the same.
function setDay(cfg, day, { title, postedAt } = {}) {
  const pl = P(), cal = load(cfg), p = pl.load(cfg, day);
  let t = cal.topics.find(x => x.day === day);
  if (!t) { t = { id: "t" + Date.now(), day, topic: title || p?.title || p?.topic || `Day ${day}`, notes: p?.notes || "", status: p ? "in progress" : "done" }; cal.topics.push(t); }
  if (typeof title === "string" && title.trim()) {
    t.topic = title.trim();
    if (p) { p.title = title.trim(); pl.save(cfg, p); }
  }
  if (postedAt !== undefined) {
    if (postedAt) { t.postedAt = String(postedAt).slice(0, 16); t.status = "done"; t.doneAt = t.doneAt || new Date().toISOString(); }
    else delete t.postedAt;
  }
  save(cfg, cal);
  return t;
}

// Delete a Day: its folder goes to the Recycle Bin (restore it from there to undo). Its calendar topic stays: still open
// if it wasn't done, so it can be made again; done topics keep their record.
function removeDay(cfg, n) {
  const pl = P(), G = require("./gallery"), dir = pl.dayDir(cfg, +n);
  n = +n;
  if (!fs.existsSync(dir)) throw new Error(`There is no Day ${n} folder.`);
  if (pl.isBusy(n)) throw new Error(`A job is running for Day ${n}. Press Stop first.`);
  const g = G.status(cfg, n);
  if (g?.running || g?.waiting) throw new Error(`Versions are being made for Day ${n}. Stop them first.`);
  if (process.platform !== "win32") throw new Error("Deleting a Day from the app works on Windows only: delete the folder yourself.");
  const ps = "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($env:RF_DIR, 'OnlyErrorDialogs', 'SendToRecycleBin')";
  try {
    require("child_process").execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps],
      { env: { ...process.env, RF_DIR: dir }, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) { throw new Error(`Windows couldn't move "Day ${n}" to the Recycle Bin (is a file from it open?): ${String(e.stderr || e.message).trim().slice(0, 200)}`); }
  if (fs.existsSync(dir)) throw new Error(`"Day ${n}" is still there: close any file or folder window from it and try again.`);
  pl.LIVE.delete(n);
  const cal = load(cfg);
  for (const t of cal.topics) if (t.day === n && t.status !== "done") { t.status = "ready"; delete t.doneAt; }
  save(cfg, cal);
  return { deleted: n };
}

module.exports = { load, save, link, dayFor, renumber, setDay, swapDay, removeDay };
