// Approve-and-schedule (Phase 2 of the approved auto-post plan): the posting gate.
// Flow: bulk makes favourite previews -> I pick one in the app/CLI (`pick`) -> that IS the posting
// approval (script approval alone never posts anything) -> the Day joins data/schedule.json for the
// next 19:00 IST slot (1/day) -> after `export`, the entry becomes "ready" with its MP4 name ->
// the cloud poster (Phase 4) posts ready entries whose slot has arrived, then marks them posted.
// Entries: [{ day, versionId, scheduledFor, status: awaiting-render|ready|posting|posted|failed,
//             videoFile?, igId?, igPermalink?, ytId?, ytUrl?, error?, createdAt, updatedAt }]
const fs = require("fs"), path = require("path");
const U = require("./util");

const SLOT_HOUR_IST = 19;                       // 1 post per day, 19:00 IST
const file = cfg => path.join(cfg.root, "data", "schedule.json");
const load = cfg => U.readJson(file(cfg), { entries: [] });
const save = (cfg, s) => U.writeJson(file(cfg), s);

// Next 19:00 IST strictly after `from` (+30 min safety: a pick at 18:45 still makes today's slot only if rendered by then — keep simple: slot must be >30 min away)
function nextSlot(from = new Date()) {
  const ist = new Date(from.getTime() + 5.5 * 3600 * 1000);          // IST wall clock as UTC fields
  const cand = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), SLOT_HOUR_IST, 0, 0));
  let slotIst = cand.getTime() - from.getTime() - 5.5 * 3600 * 1000 > 30 * 60 * 1000 ? cand : new Date(cand.getTime() + 86400000);
  return new Date(slotIst.getTime() - 5.5 * 3600 * 1000).toISOString();   // back to real UTC instant
}

// Pick a ready gallery version: it becomes the reel AND the posting approval. One entry per Day.
function pick(cfg, day, versionId) {
  const P = require("./pipeline"), G = require("./gallery");
  const p = P.load(cfg, day);
  if (!p) throw new Error(`Day ${day} was not made with the app`);
  G.use(cfg, p, versionId);                                   // throws unless the version is ready
  const s = load(cfg), now = new Date().toISOString();
  const scheduledFor = nextSlot();
  const entry = { day, versionId, scheduledFor, status: p.exportedAs ? "ready" : "awaiting-render",
    videoFile: p.exportedAs ? `${p.exportedAs}.mp4` : null, createdAt: now, updatedAt: now };
  const i = s.entries.findIndex(e => e.day === day);
  if (i >= 0) s.entries[i] = { ...s.entries[i], ...entry }; else s.entries.push(entry);
  save(cfg, s);
  Object.assign(p, { postApproved: true, postApprovedAt: now, scheduledFor });
  P.save(cfg, p);
  P.log(cfg, p, `posting approved: version ${versionId}, scheduled ${scheduledFor} (19:00 IST slot)`);
  return entry;
}

// Called by the export step: the MP4 now exists under its final name.
function onExport(cfg, p) {
  const s = load(cfg), e = s.entries.find(x => x.day === p.day);
  if (!e) return null;
  e.status = "ready"; e.videoFile = `${p.exportedAs}.mp4`; e.updatedAt = new Date().toISOString();
  save(cfg, s);
  return e;
}

const list = cfg => load(cfg).entries.sort((a, b) => String(a.scheduledFor).localeCompare(String(b.scheduledFor)));

module.exports = { pick, onExport, list, nextSlot, SLOT_HOUR_IST };
