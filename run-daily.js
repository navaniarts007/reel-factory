// The 7:00 run (Windows Task Scheduler starts this; it also runs later if the laptop was off at 7:00).
// Takes the next ready topic from the calendar and writes the script, then stops at the approval gate.
// Open the app to review and approve it.
const path = require("path"), fs = require("fs");
const U = require("./lib/util"), P = require("./lib/pipeline");
const cfg = U.loadConfig();
const stamp = path.join(cfg.root, "data", "last-daily-run.txt");
const today = new Date().toISOString().slice(0, 10);

if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8").trim() === today && !process.argv.includes("--force")) {
  console.log("Already ran today."); process.exit(0);
}
const t = P.nextFromCalendar(cfg);
if (!t) { console.log("No ready topic in the calendar. Add topics in the app (Settings → Calendar)."); process.exit(0); }
const calPath = path.join(cfg.root, "data", "calendar.json"), cal = U.readJson(calPath);
cal.topics.find(x => x.id === t.id).status = "in progress"; U.writeJson(calPath, cal);
const p = P.createProject(cfg, { topic: t.topic, notes: t.notes || "", calendarId: t.id });
console.log(`Day ${p.day}: writing the script for "${t.topic}"…`);
P.enqueue(cfg, p.day, ["script"]);
const wait = setInterval(() => {
  if (!P.isBusy(p.day)) {
    clearInterval(wait);
    fs.writeFileSync(stamp, today);
    const q = P.load(cfg, p.day);
    console.log(q.error ? `✗ ${q.error}` : `✓ Day ${p.day} script is ready for your approval. Open http://localhost:${cfg.port}`);
    process.exit(q.error ? 1 : 0);
  }
}, 1000);
