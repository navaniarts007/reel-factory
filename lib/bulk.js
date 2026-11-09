// Bulk generation (Phase 1 of the approved auto-post plan): N Days in a row, each
//   script -> (generation approval) -> voice -> sync -> favourite-version previews, then STOP.
// Nothing here renders a final MP4 and nothing posts: picking a version + posting approval is Phase 2.
// Favourite versions (config "bulk.favourites", else the defaults below) are exact
// (visual, skill, look) combos fed to the gallery as version ids, so only those previews are made.
// Resumable: a Day whose script/voice/gallery already finished is skipped to the next unfinished step.
// Topics: explicit topics first, then the calendar's ready queue. If topics run out, bulk stops and says so.
const fs = require("fs"), path = require("path");
const U = require("./util"), S = require("./skills");

const DEFAULT_FAVOURITES = [
  { visual: "pictorial", skill: "lemo", look: "lemo-dossier" },   // Pictorial · Lemo Opuscar · Halftone dossier
  { visual: "pictorial", skill: "lemo", look: "lemo-swiss" },     // Pictorial · Lemo Opuscar · Swiss motion graphics
  { visual: "motion", skill: "lemo", look: "lemo-swiss" },        // Motion graphics · Lemo Opuscar · Swiss motion graphics
  { visual: "motion", skill: "lemo", look: "lemo-keynote" },      // Motion graphics · Lemo Opuscar · Dark tech keynote
  { visual: "pictorial", skill: "clawd", look: "clawd-paper" },   // Claude Animation Base · Painted paper
];

function favourites(cfg) {
  const P = require("./pipeline"), G = require("./gallery");
  const list = (cfg.bulk?.favourites?.length ? cfg.bulk.favourites : DEFAULT_FAVOURITES);
  const combos = list.map(c => {
    const k = S.get(c.skill);
    const look = (k.looks || []).map(l => typeof l === "string" ? l : l.id).find(l => l === c.look);
    if (!P.VISUALS.includes(c.visual) || !look) throw new Error(`favourite version doesn't exist: ${c.visual} / ${c.skill} / ${c.look}`);
    return { ...c, id: `${c.visual}__${c.look}`, label: `${G.VNAME[c.visual]} · ${k.name} · ${look}` };
  });
  return { combos, ids: combos.map(c => c.id) };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitJob(cfg, P, day, log, timeoutMs = 1800000) {
  const t0 = Date.now();
  while (P.isBusy(day)) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`Day ${day}: job timed out`);
    await sleep(3000);
  }
  const p = P.load(cfg, day);
  if (p?.error) throw new Error(`Day ${day}: ${p.error}`);
  return p;
}
async function waitGallery(cfg, day, log, timeoutMs = 3600000) {
  const G = require("./gallery"), t0 = Date.now();
  for (;;) {
    const st = G.status(cfg, day);
    if (st?.status === "done") return st;
    if (st?.status === "error") throw new Error(`Day ${day} gallery: ${st.error || "failed"}`);
    if (Date.now() - t0 > timeoutMs) throw new Error(`Day ${day}: gallery timed out`);
    await sleep(10000);
  }
}

async function bulk(cfg, { count = 8, topics = [], log = console.log } = {}) {
  const P = require("./pipeline"), G = require("./gallery");
  const { combos, ids } = favourites(cfg);
  log(`favourite versions (${combos.length}): ${combos.map(c => c.label).join(" | ")}`);
  const done = [], made = [];
  for (let n = 0; n < count; n++) {
    // next topic: mine first, then the calendar queue (marked in progress, like `new --calendar`)
    let topic = topics[n] || "", notes = "", calendarId = null;
    if (!topic) {
      const t = P.nextFromCalendar(cfg);
      if (!t) { log(`bulk stopped: no more ready topics (made ${made.length} of ${count}). Add topics to the calendar and run bulk again.`); break; }
      topic = t.topic; notes = t.notes || ""; calendarId = t.id;
      const cp = path.join(cfg.root, "data", "calendar.json"), cal = U.readJson(cp);
      cal.topics.find(x => x.id === t.id).status = "in progress"; U.writeJson(cp, cal);
    }
    // resume: a previous bulk run may have already created this topic's Day — continue it, never duplicate
    let p = null;
    for (const s of P.listProjects(cfg)) {
      const q = P.load(cfg, s.day);
      if (q?.bulk && q.topic === topic) { p = q; log(`Day ${p.day}: resuming "${topic}"`); break; }
    }
    if (!p) p = P.createProject(cfg, { topic, notes, calendarId });
    made.push(p.day);
    if (!p.bulk) { p.bulk = true; P.save(cfg, p); }
    log(`Day ${p.day}: "${topic}"`);
    // script (skip if a previous bulk run already wrote it)
    if (!fs.existsSync(path.join(P.workDir(cfg, p.day), "timeline.json"))) {
      P.enqueue(cfg, p.day, ["script"]);
      await waitJob(cfg, P, p.day, log);
    } else log(`Day ${p.day}: script already there, skipping`);
    // generation approval: the script may be voiced/designed; POSTING still needs Phase-2 approval
    const q = P.load(cfg, p.day);
    if (!q.approved) { Object.assign(q, { approved: true, approvedAt: new Date().toISOString(), status: "approved", bulk: true }); P.save(cfg, q); }
    // voice + sync (cached clips make a re-run cheap)
    if (!fs.existsSync(path.join(P.workDir(cfg, p.day), "voice.wav"))) {
      P.enqueue(cfg, p.day, ["voice", "sync"]);
      await waitJob(cfg, P, p.day, log);
    } else log(`Day ${p.day}: voice already there, skipping`);
    // favourite previews only (the gallery lane runs while the main queue is idle)
    G.start(cfg, p.day, { only: { ids } });
    const st = await waitGallery(cfg, p.day, log);
    const ready = Object.values(st.versions || {}).filter(v => v.status === "ready").length;
    log(`Day ${p.day}: ${ready}/${ids.length} favourite versions ready for review`);
    done.push(p.day);
  }
  log(`bulk done: ${done.length} Day(s) ready for review: ${done.join(", ") || "none"}. Next: pick a version per Day (Phase 2).`);
  return done;
}

module.exports = { favourites, bulk, DEFAULT_FAVOURITES };
