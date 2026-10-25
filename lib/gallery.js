// The version gallery: after approval, every visual style × every skill look of the approved script, to pick from.
//   design  = Claude's screens for all scenes in one (visual style, skill): 5 × 6 = 30 `claude -p` JSON calls
//   version = a design in one of its skill's looks: work/variants/<visual>__<look>/ with its own timeline.json,
//             a live preview (build/preview.html) and a picture strip (build/strip.jpg), both made by render.js,
//             the same page the final MP4 is shot from (no lower-quality path).
// Words, voice and timings come from the main timeline and never change here. The lane runs in its own process group,
// only while the main job queue is idle, and resumes where it stopped. State: work/variants/index.json.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const U = require("./util"), LLM = require("./llm"), S = require("./skills"), M = require("./media");

const sha = s => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const P = () => require("./pipeline");                      // late: pipeline requires this file too
const vdir = (cfg, day) => path.join(P().workDir(cfg, day), "variants");
const idxPath = (cfg, day) => path.join(vdir(cfg, day), "index.json");
const loadIdx = (cfg, day) => U.readJson(idxPath(cfg, day), null);
const saveIdx = (cfg, day, ix) => U.writeJson(idxPath(cfg, day), ix);
const VNAME = { whiteboard: "Whiteboard", motion: "Motion graphics", graphs: "Visual graphs", story: "Storytelling", pictorial: "Pictorial" };

// What a version is made of: the approved words (designs depend on them) and the synced timings (previews depend on them).
const scriptSig = tl => sha(JSON.stringify(tl.scenes.map(s => s.say)));
const timeSig = (w, tl) => sha(JSON.stringify(tl.scenes.map(s => s.dur)) + (fs.existsSync(path.join(w, "captions.json")) ? fs.readFileSync(path.join(w, "captions.json")) : ""));

// only = { visuals, skills, looks }: the versions the user ticked (one design per visual style × skill they need)
function plan(only = null) {
  const designs = [], versions = [];
  for (const visual of P().VISUALS) for (const id of S.ORDER) {
    if (only && ((only.visuals && !only.visuals.includes(visual)) || (only.skills && !only.skills.includes(id)))) continue;
    const k = S.get(id); if (!k) continue;
    const looks = (k.looks || []).map(l => typeof l === "string" ? l : l.id).filter(l => !only?.looks || only.looks.includes(l));
    const vs = looks.map((look, n) => ({ id: `${visual}__${look}`, design: `${visual}__${id}`, visual, skill: id, look, first: n === 0 }))
      .filter(v => !only?.ids || only.ids.includes(v.id));
    if (!vs.length) continue;
    vs.forEach((v, n) => { v.first = n === 0; });              // the first one made right after its design
    designs.push({ id: `${visual}__${id}`, visual, skill: id });
    versions.push(...vs);
  }
  return { designs, versions };
}

// ---------------------------------------------------------------- one design (Claude, JSON only, no tools)
async function design(cfg, p, d, tl, log) {
  const pl = P(), w = pl.workDir(cfg, p.day), q = { ...p, skill: d.skill, look: S.lookOf(d.skill, null), visual: d.visual };
  const types = pl.typesFor(q), free = types.filter(t => !pl.FIXED_TYPES.includes(t));
  const fixed = tl.scenes.map((s, i) => pl.FIXED_TYPES.includes(s.type) ? `scene ${i + 1} = ${s.type}` : null).filter(Boolean);
  const base = pl.fill(pl.prompt(cfg, "restyle.md"), { STYLE: pl.prompt(cfg, "style.md"), TOPIC: p.topic, AUDIENCE: p.audience || "mixed", VISUAL: d.visual,
    ...pl.skillVars(q), LIBRARY: pl.library(cfg, q), MEDIA: M.forPrompt(w), COUNT: tl.scenes.length, FIXED: fixed.join(", ") || "none", TYPES: free.join(", "),
    SCRIPT: tl.scenes.map((s, i) => { const { say, dur, _art, ...sc } = s; return `${i + 1}. says: "${say}"\n   current screen: ${JSON.stringify(sc)}`; }).join("\n") });
  const media = M.load(w).items;
  let j, problems = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) log(`  fixing ${d.id}: ${problems.slice(0, 3).join("; ")}`);
    j = await LLM.askJson(attempt ? `${base}\n\nYour previous JSON had these problems, fix them:\n- ${problems.join("\n- ")}\n\nPrevious JSON:\n${JSON.stringify(j)}` : base, cfg);
    problems = designProblems(j, tl, types, media);
    if (!problems.length) break;
  }
  if (problems.length) throw new Error(problems.slice(0, 4).join("; "));
  return { scenes: j.scenes.map(({ say, dur, _art, ...sc }) => sc), facts: j.facts_to_check || [] };
}

// Same count, fixed types kept, every screen valid for this skill; words are the approved ones (taken from the main timeline).
function designProblems(j, tl, types, media) {
  const pl = P(), out = [];
  if (!Array.isArray(j?.scenes)) return ['"scenes" must be an array'];
  if (j.scenes.length !== tl.scenes.length) return [`return exactly ${tl.scenes.length} scenes (you gave ${j.scenes.length})`];
  j.scenes.forEach((s, i) => {
    const want = tl.scenes[i].type, label = `scene ${i + 1}`;
    if (pl.FIXED_TYPES.includes(want) && s.type !== want) out.push(`${label} must stay type "${want}"`);
    else if (!types.includes(s.type)) out.push(`${label}: type "${s.type}" isn't allowed here (use one of: ${types.join(", ")})`);
    else if (!pl.FIXED_TYPES.includes(want) && pl.FIXED_TYPES.includes(s.type)) out.push(`${label}: "${s.type}" is only for its own scene`);
    out.push(...pl.imageProblems(s, media, label), ...S.sceneProblems(s, label));
  });
  return out;
}

// The version's timeline: the design's screens with the main timeline's words and synced timings, in the look.
function versionTimeline(tl, des, v) {
  const k = S.get(v.skill);
  return { ...tl, theme: v.look, camera: k.camera, scenes: des.scenes.map((sc, i) => {
    const { say, dur } = tl.scenes[i], s = { ...sc, say, dur };
    if (s.type === "cta") s.word = tl.keyword;
    return s;
  }) };
}

// work/variants/<id>/: links to my media and the shared art (Clawd paints, B-roll stills), copies of the small files.
function prepareDir(w, dir, tl) {
  fs.mkdirSync(dir, { recursive: true });
  for (const d of ["media", "art"]) {
    const at = path.join(dir, d), target = path.join(w, d);
    fs.mkdirSync(target, { recursive: true });
    if (!fs.existsSync(at)) fs.symlinkSync(target, at, "junction");
  }
  for (const f of ["media.json", "captions.json", "sync.json", "music.mp3"]) {
    const src = path.join(w, f), dst = path.join(dir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, dst); else fs.rmSync(dst, { force: true });
  }
  const voice = path.join(w, "voice.wav"), vd = path.join(dir, "voice.wav");
  fs.rmSync(vd, { force: true });
  if (fs.existsSync(voice)) { try { fs.linkSync(voice, vd); } catch { fs.copyFileSync(voice, vd); } }
  U.writeJson(path.join(dir, "timeline.json"), tl);
}

// Free extras first (Clawd paints, ~30 s each on the GPU); Collage stills are paid Gemini calls (the user chose: stills
// automatic, clips only on the 🎬 Animate button).
async function extras(cfg, w, scenes, log) {
  const C = require("./clawd");
  for (const s of scenes) {
    const art = path.join(w, "art", C.artKey(s));
    if (s.type === "clawd" && !fs.existsSync(path.join(art, "clip.mp4"))) { log(`  painting Clawd: ${s.action}`); await C.paint(w, s, s.dur || 4, l => /✓|✗|error/i.test(l) && log("  " + l)); }
    if (s.type === "broll" && !fs.existsSync(path.join(art, "still.png"))) {
      if (!U.loadEnv().GEMINI_API_KEY) { log("  B-roll still skipped: no GEMINI_API_KEY in .env"); continue; }
      const b = { imageModel: "gemini-2.5-flash-image", ...(cfg.broll || {}) }, { say, dur, _art, ...look } = s;
      log(`  B-roll still (paid Gemini): ${String(s.metaphor || "").slice(0, 60)}`);
      await U.run(cfg.python, [path.join(cfg.root, "py", "broll.py"), "still", art, JSON.stringify(look), "--model", b.imageModel],
        { log: l => log("    " + l), env: { GEMINI_API_KEY: U.loadEnv().GEMINI_API_KEY } });
    }
  }
}

// ---------------------------------------------------------------- the lane
const LANE = { day: null, stop: false, wanted: new Map() };    // wanted: day → { renderAll }
const node = process.execPath;

function start(cfg, day, opts = {}) {
  const prev = LANE.wanted.get(day) || {};
  LANE.wanted.set(day, { renderAll: !!(opts.renderAll || prev.renderAll), only: opts.only || prev.only || null });
  const ix = loadIdx(cfg, day);
  if (ix) { ix.status = "waiting"; ix.renderAll = LANE.wanted.get(day).renderAll || ix.renderAll; saveIdx(cfg, day, ix); }
  if (!LANE.day) U.inGroup("gallery", () => loop(cfg));
}
// After a new voice/sync: remake only the versions already made (their timings changed). Nothing new is made.
function refresh(cfg, day) {
  const ix = loadIdx(cfg, day), ids = Object.values(ix?.versions || {}).filter(v => v.status === "ready").map(v => v.id);
  if (ids.length) start(cfg, day, { only: { ids } });
}
function stop(cfg, day) {
  LANE.wanted.delete(day);
  if (LANE.day === day) { LANE.stop = true; U.killAll("gallery"); }
  const ix = loadIdx(cfg, day); if (ix) { ix.status = "stopped"; ix.current = ""; ix.renderAll = false; saveIdx(cfg, day, ix); }
}
const status = (cfg, day) => {
  const ix = loadIdx(cfg, day);
  return ix ? { ...ix, log: (ix.log || []).slice(-60), running: LANE.day === day, waiting: LANE.wanted.has(day) && LANE.day !== day } : null;
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function idle() { while (!P().queueIdle()) { if (LANE.stop) return; await sleep(2000); } }

async function loop(cfg) {
  while (LANE.wanted.size) {
    const [day, opts] = LANE.wanted.entries().next().value;
    LANE.day = day; LANE.stop = false;
    try { await build(cfg, day, opts); } catch (e) {
      const ix = loadIdx(cfg, day) || { designs: {}, versions: {}, log: [] };      // the build may have saved over stop()'s status
      if (LANE.stop) Object.assign(ix, { status: "stopped", current: "", renderAll: false });
      else { Object.assign(ix, { status: "error", error: e.message, current: "" }); ix.log = [...(ix.log || []), "✗ " + e.message].slice(-300); }
      saveIdx(cfg, day, ix);
    }
    if (LANE.wanted.get(day) === opts) LANE.wanted.delete(day);     // started again meanwhile? then run again
    LANE.day = null;
  }
}

async function build(cfg, day, opts) {
  const pl = P(), w = pl.workDir(cfg, day), V = vdir(cfg, day);
  await idle(); if (LANE.stop) return;
  const p = pl.load(cfg, day), tl = U.readJson(path.join(w, "timeline.json"));
  if (!p?.approved || !tl) throw new Error("Approve the script first.");
  const sig = scriptSig(tl), tsig = timeSig(w, tl);
  let ix = loadIdx(cfg, day);
  if (!ix || ix.scriptSig !== sig) {                            // new words: every design is out of date
    fs.rmSync(V, { recursive: true, force: true });
    ix = { scriptSig: sig, designs: {}, versions: {}, log: [], startedAt: new Date().toISOString() };
  }
  const { designs, versions } = plan(opts.only);
  Object.assign(ix, { status: "building", error: null, renderAll: !!opts.renderAll, total: { designs: designs.length, versions: versions.length } });
  const log = l => { ix.log = [...(ix.log || []), `[${new Date().toLocaleTimeString("en-IN", { hour12: false })}] ${l}`].slice(-300); saveIdx(cfg, day, ix); };
  const step = async (label, fn) => { await idle(); if (LANE.stop) throw new Error("stopped"); ix.current = label; saveIdx(cfg, day, ix); await fn(); };
  saveIdx(cfg, day, ix);

  const desFile = id => path.join(V, "_designs", `${id}.json`);
  const readDes = id => U.readJson(desFile(id));
  async function makeVersion(v) {
    if (!v) return;
    const des = readDes(v.design); if (!des) return;
    const cur = ix.versions[v.id];
    if (cur?.status === "ready" && cur.timeSig === tsig && cur.designAt === ix.designs[v.design]?.at) return;
    await step(`${VNAME[v.visual]} · ${v.look}: preview`, async () => {
      const dir = path.join(V, v.id), vt = versionTimeline(tl, des, v);
      prepareDir(w, dir, vt);
      try {
        await U.run(node, [path.join(cfg.root, "render.js"), dir, "--preview-only"], { env: { PYTHON: cfg.python } });
        await U.run(node, [path.join(cfg.root, "render.js"), dir, "--sheet"], { env: { PYTHON: cfg.python } });
        const info = U.readJson(path.join(dir, "build", "sheet-info.json"), {});
        ix.versions[v.id] = { ...v, status: "ready", timeSig: tsig, designAt: ix.designs[v.design].at, at: new Date().toISOString(),
          pageErrors: info.pageErrors || [], mp4: false };
        log(`✓ ${VNAME[v.visual]} · ${v.look}${(info.pageErrors || []).length ? ` (page errors: ${info.pageErrors[0]})` : ""}`);
      } catch (e) { ix.versions[v.id] = { ...v, status: "error", error: e.message.slice(0, 300) }; log(`✗ ${v.id}: ${e.message.slice(0, 200)}`); }
    });
  }

  // 1. designs, each followed by its extras and its first look (so there is something to pick early)
  for (const d of designs) {
    if (ix.designs[d.id]?.status !== "done") {
      await step(`designing ${VNAME[d.visual]} × ${S.get(d.skill).name}`, async () => {
        log(`designing ${VNAME[d.visual]} × ${S.get(d.skill).name}…`);
        try {
          const des = await design(cfg, p, d, tl, log);
          U.writeJson(desFile(d.id), des);
          ix.designs[d.id] = { ...d, status: "done", facts: des.facts, at: new Date().toISOString(), types: des.scenes.map(s => s.type) };
        } catch (e) {
          if (LANE.stop) throw e;
          ix.designs[d.id] = { ...d, status: "error", error: e.message.slice(0, 300) }; log(`✗ design ${d.id}: ${e.message.slice(0, 200)}`);
        }
      });
    }
    const des = readDes(d.id);
    if (des && ix.designs[d.id]?.status === "done") {
      await step(`${VNAME[d.visual]} × ${S.get(d.skill).name}: painting / stills`, () => extras(cfg, w, versionTimeline(tl, des, { skill: d.skill, look: S.lookOf(d.skill, null) }).scenes, log)
        .catch(e => log(`! extras for ${d.id}: ${e.message.slice(0, 200)}`)));
      await makeVersion(versions.find(v => v.design === d.id && v.first));
    }
  }
  // 2. every other look
  for (const v of versions.filter(v => !v.first)) await makeVersion(v);
  // 3. optional: full 60 fps MP4 of every version ("Render all MP4s overnight")
  if (opts.renderAll) for (const v of versions) {
    const cur = ix.versions[v.id];
    if (cur?.status !== "ready" || (cur.mp4 && cur.mp4Sig === tsig)) continue;
    await step(`${VNAME[v.visual]} · ${v.look}: MP4`, async () => {
      try {
        await U.run(node, [path.join(cfg.root, "render.js"), path.join(V, v.id), "--fps", String(cfg.fps)], { env: { PYTHON: cfg.python } });
        Object.assign(ix.versions[v.id], { mp4: true, mp4Sig: tsig }); log(`✓ MP4 ${v.id}`);
      } catch (e) { log(`✗ MP4 ${v.id}: ${e.message.slice(0, 200)}`); }
    });
  }
  ix.status = "done"; ix.current = ""; ix.renderAll = false; ix.doneAt = new Date().toISOString();
  log(`gallery ready: ${Object.values(ix.versions).filter(v => v.status === "ready").length} versions`);
}

// ---------------------------------------------------------------- pick one: it becomes the reel (words, voice, sync stay)
function use(cfg, p, id) {
  const pl = P(), w = pl.workDir(cfg, p.day), ix = loadIdx(cfg, p.day), v = ix?.versions?.[id];
  if (!v || v.status !== "ready") throw new Error("That version isn't ready.");
  const tl = U.readJson(path.join(w, "timeline.json"));
  if (scriptSig(tl) !== ix.scriptSig) throw new Error("The script changed after the gallery was made: rebuild the gallery.");
  const des = U.readJson(path.join(vdir(cfg, p.day), "_designs", `${v.design}.json`));
  const vt = versionTimeline(tl, des, v);
  U.writeJson(path.join(w, "timeline.json"), vt);
  // segments of an overnight MP4 of this version are the same scenes: the main render only joins them
  const seg = path.join(vdir(cfg, p.day), id, "build", "segments"), mseg = path.join(w, "build", "segments");
  let reused = 0;
  if (v.mp4 && fs.existsSync(seg)) { fs.mkdirSync(mseg, { recursive: true }); for (const f of fs.readdirSync(seg)) { fs.copyFileSync(path.join(seg, f), path.join(mseg, f)); reused++; } }
  Object.assign(p, { visual: v.visual, skill: v.skill, look: v.look, visualVersions: {}, pickedVersion: id, finalFile: null,
    factsToCheck: [...new Set([...(p.factsToCheck || []), ...(ix.designs[v.design]?.facts || [])])] });
  pl.log(cfg, p, `picked version ${VNAME[v.visual]} · ${S.get(v.skill).name} · ${v.look} (you approved its screens)${reused ? "; its rendered scenes are reused" : ""}`);
  pl.save(cfg, p);
}

module.exports = { start, refresh, stop, status, use, plan, designProblems, versionTimeline, scriptSig, VNAME };
