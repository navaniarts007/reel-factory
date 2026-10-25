// Command line for Claude Code (or me) — same pipeline as the app, no browser needed.
//   node cli.js status [day]                 list days, or one day's status, checks and last log lines
//   node cli.js new "topic" ["notes"]        create the next Day and write the script (stops at approval)
//   node cli.js new --calendar               same, with the next ready topic from the calendar
//   node cli.js approve <day>                approve the script (do this only when the user says so)
//   node cli.js run <day> [steps…]           run steps: voice sync render checks copy export (default: voice→copy)
//   node cli.js skills [pull [id…]]          list the video skills, or pull/update their GitHub repos into vendor/skills
// Don't run the same day from here while the app is also working on it.
const path = require("path"), fs = require("fs");
const U = require("./lib/util"), P = require("./lib/pipeline");
const cfg = U.loadConfig();
const [cmd, ...a] = process.argv.slice(2);

function waitFor(day) {
  return new Promise(res => {
    let shown = 0;
    const t = setInterval(() => {
      const p = P.LIVE.get(day) || P.load(cfg, day);
      (p.log || []).slice(shown).forEach(l => console.log(l)); shown = (p.log || []).length;
      if (!P.isBusy(day)) { clearInterval(t); res(P.load(cfg, day)); }
    }, 500);
  });
}
function status(day) {
  const p = P.load(cfg, day); if (!p) return console.log(`Day ${day}: not made with the app`);
  const w = P.workDir(cfg, day), c = U.readJson(path.join(w, "checks.json"));
  console.log(`Day ${day}: ${p.title || p.topic}\nstatus: ${p.status}${p.approved ? " (approved)" : ""}${p.error ? "\nlast error: " + p.error : ""}`);
  if (p.judge) console.log(`hook score: ${p.judge.score}/10 – ${p.judge.reason}`);
  if (c) c.items.forEach(i => console.log(`  [${i.level}] ${i.name}: ${i.detail}`));
  console.log(`folder: ${P.dayDir(cfg, day)}`);
}

(async () => {
  if (cmd === "status") {
    if (a[0]) return status(+a[0]);
    console.log(`next day: ${P.nextDay(cfg)}`); P.listProjects(cfg).forEach(p => console.log(`Day ${p.day}: ${p.status} – ${p.title || ""}`));
  } else if (cmd === "new") {
    let topic = a[0], notes = a[1] || "", calendarId = null;
    if (!topic || topic === "--calendar") {
      const t = P.nextFromCalendar(cfg); if (!t) throw new Error("no ready topic in data/calendar.json");
      topic = t.topic; notes = t.notes || ""; calendarId = t.id;
      const cp = path.join(cfg.root, "data", "calendar.json"), cal = U.readJson(cp); cal.topics.find(x => x.id === t.id).status = "in progress"; U.writeJson(cp, cal);
    }
    const p = P.createProject(cfg, { topic, notes, calendarId });
    P.enqueue(cfg, p.day, ["script"]); await waitFor(p.day); status(p.day);
    console.log(`script: ${path.join(P.workDir(cfg, p.day), "script.txt")}`);
  } else if (cmd === "approve") {
    const p = P.load(cfg, +a[0]); Object.assign(p, { approved: true, approvedAt: new Date().toISOString(), status: "approved" }); P.save(cfg, p);
    console.log(`Day ${a[0]} approved.`);
  } else if (cmd === "skills") {
    const S = require("./lib/skills");
    if (a[0] === "pull") for (const id of a.slice(1).length ? a.slice(1) : S.ORDER) await S.pull(id, l => console.log(l));
    for (const s of S.status()) { const k = S.get(s.id); console.log(`${k.id.padEnd(12)} ${k.name.padEnd(22)} ${k.licence.padEnd(28)} ${k.repo ? (s.pulled ? `pulled ${s.commit} ${s.date}` : "not pulled") : "built in"}${Object.entries(s.needs).map(([n, ok]) => `  ${n}: ${ok ? "set" : "missing"}`).join("")}`); }
  } else if (cmd === "run") {
    const day = +a[0], steps = a.slice(1).length ? a.slice(1) : P.STEP_ORDER;
    P.enqueue(cfg, day, steps); await waitFor(day); status(day);
  } else {
    console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 9).map(l => l.replace(/^\/\/ ?/, "")).join("\n"));
  }
})().catch(e => { console.error("✗ " + e.message); process.exit(1); });
