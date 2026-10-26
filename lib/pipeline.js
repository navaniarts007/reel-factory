// The daily pipeline: script → (I approve) → voice → sync → render → checks → copy → (I preview) → export.
// One job runs at a time, so the GPU is never shared between the voice model and the renderer.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const U = require("./util"), LLM = require("./llm"), M = require("./media"), S = require("./skills");

const COMPONENT_TYPES = ["hello", "hook", "list", "checklist", "flow", "terminal", "compare", "cta", "takeaway", "bye", "statement", "chart", "story", "image", "objects", "clawd", "broll"];
const SKILL_TYPES = ["clawd", "broll"];                             // only for skills that list them (skills/<id>/skill.json "types")
const FIXED_TYPES = ["hello", "hook", "cta", "takeaway", "bye"];   // a new visual keeps these scene types
const STEP_ORDER = ["voice", "sync", "render", "checks", "copy"];
const AUDIENCES = ["mixed", "common", "student", "developer"];     // rules for each live in prompts/style.md
const VISUALS = ["whiteboard", "motion", "graphs", "story", "pictorial"];        // same

// ---------------------------------------------------------------- projects (one per Day folder)
function dayDir(cfg, n) { return path.join(cfg.daysRoot, cfg.dayFolder.replace("{n}", n)); }
function workDir(cfg, n) { return path.join(dayDir(cfg, n), "work"); }
const projPath = (cfg, n) => path.join(workDir(cfg, n), "project.json");

function listDays(cfg) {
  if (!fs.existsSync(cfg.daysRoot)) return [];
  const re = new RegExp("^" + cfg.dayFolder.replace("{n}", "(\\d+)") + "$");
  return fs.readdirSync(cfg.daysRoot).map(f => f.match(re)).filter(Boolean).map(m => +m[1]).sort((a, b) => a - b);
}
function nextDay(cfg) {
  const days = listDays(cfg);
  return Math.max(cfg.nextDay ?? 0, days.length ? days[days.length - 1] + 1 : 1);
}
function load(cfg, n) { return U.readJson(projPath(cfg, n)); }
function save(cfg, p) { p.updatedAt = new Date().toISOString(); U.writeJson(projPath(cfg, p.day), p); return p; }
function listProjects(cfg) {
  return listDays(cfg).map(n => {
    const p = load(cfg, n);
    return p ? { day: n, title: p.title || p.topic, status: p.status, updatedAt: p.updatedAt, calendarId: p.calendarId || null } : { day: n, title: "(made by hand)", status: "manual" };
  }).reverse();
}

function log(cfg, p, line) {
  const l = `[${new Date().toLocaleTimeString("en-IN", { hour12: false })}] ${line}`;
  p.log = [...(p.log || []), l].slice(-400);
  fs.appendFileSync(path.join(workDir(cfg, p.day), "pipeline.log"), l + "\n");
  LIVE.set(p.day, p);
}
const LIVE = new Map();      // latest in-memory project state while a job runs (for the UI's polling)

function createProject(cfg, { topic, notes = "", calendarId = null, audience = "mixed", visual = "whiteboard", skill = "whiteboard", look = null }) {
  const CAL = require("./calendar"), n = CAL.dayFor(cfg, calendarId);     // a topic pinned to a free Day keeps its number
  fs.mkdirSync(workDir(cfg, n), { recursive: true });
  const p = { day: n, topic, notes, calendarId, audience: AUDIENCES.includes(audience) ? audience : "mixed", visual: VISUALS.includes(visual) ? visual : "whiteboard", skill: S.get(skill).id, look: S.lookOf(S.get(skill).id, look), status: "new", voiceMode: cfg.voice.mode, createdAt: new Date().toISOString(), log: [] };
  save(cfg, p);
  // the calendar gets the same Day: the picked topic takes its number, a typed topic becomes a calendar topic
  const cal = CAL.load(cfg), t = calendarId && cal.topics.find(x => x.id === calendarId);
  if (t) { t.day = n; if (t.status === "ready") t.status = "in progress"; CAL.save(cfg, cal); }
  else CAL.setDay(cfg, n, {});
  return p;
}

// ---------------------------------------------------------------- skills (skills/<id>): look, camera, guide, extra scene types
const skillOf = p => S.get(p.skill || "whiteboard");
const typesFor = p => COMPONENT_TYPES.filter(t => !SKILL_TYPES.includes(t) || (skillOf(p).types || []).includes(t));
function skillVars(p) {
  const k = skillOf(p), look = S.lookOf(k.id, p.look);
  return { SKILL_NAME: `${k.name} (look: ${look})`, SKILL: S.guide(k.id, look) };
}
// The scene library from script.md, with the skill's extra scene types
function library(cfg, p) {
  const lib = (prompt(cfg, "script.md").match(/<scene_library>([\s\S]*?)<\/scene_library>/) || [])[1] || "";
  return fill(lib, { SKILL_LIBRARY: S.library(skillOf(p).id) });
}
// Change a project's skill and/or look; the timeline (if written) gets the look and camera, then the preview is rebuilt.
async function setSkill(cfg, p, skill, look) {
  const k = S.get(skill || p.skill);
  p.skill = k.id; p.look = S.lookOf(k.id, look || (k.id === p.skill ? p.look : null));
  const tp = path.join(workDir(cfg, p.day), "timeline.json"), tl = U.readJson(tp);
  if (tl) { tl.theme = p.look; tl.camera = k.camera; U.writeJson(tp, tl); }
  log(cfg, p, `skill: ${k.name}, look: ${p.look}`);
  save(cfg, p);
  if (tl) await buildPreview(cfg, p);
}

// ---------------------------------------------------------------- calendar + history
const calPath = cfg => path.join(cfg.root, "data", "calendar.json");
const histPath = cfg => path.join(cfg.root, "data", "history.json");
// The next topic: the open one pinned to the next Day, else the first open one in queue order, else the earliest pinned one.
function nextFromCalendar(cfg) {
  const open = (U.readJson(calPath(cfg), { topics: [] }).topics || []).filter(t => t.status === "ready"), n = nextDay(cfg);
  return open.find(t => t.day === n) || open.find(t => t.day == null) || open.filter(t => t.day > n).sort((a, b) => a.day - b.day)[0] || open[0] || null;
}
function slotFor(cfg, n) { const s = U.readJson(calPath(cfg), {}).pattern?.slots || []; return s.length ? s[(n - 1 + s.length * 10) % s.length] : ""; }
function recentHooks(cfg, days = 30) {
  const cut = Date.now() - days * 864e5;
  return (U.readJson(histPath(cfg), { hooks: [] }).hooks || []).filter(h => new Date(h.at).getTime() > cut).map(h => h.say);
}
function similarity(a, b) {
  const A = new Set((a || "").toLowerCase().match(/[a-z0-9']+/g) || []), B = new Set((b || "").toLowerCase().match(/[a-z0-9']+/g) || []);
  if (!A.size || !B.size) return 0;
  let k = 0; for (const w of A) if (B.has(w)) k++;
  return k / Math.min(A.size, B.size);
}

// ---------------------------------------------------------------- steps
const prompt = (cfg, name) => fs.readFileSync(path.join(cfg.root, "prompts", name), "utf8");
const fill = (t, vars) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");

// An image scene must name one of my images; unknown spots and logos are dropped rather than failing.
function imageProblems(s, media, label) {
  if (s.logo && !media.some(m => m.id === s.logo && !m.video)) delete s.logo;      // a video is never a logo
  if (s.type !== "image") return [];
  const m = media.find(x => x.id === s.media);
  if (!m) return [`${label}: "media" must be one of: ${media.map(x => x.id).join(", ") || "(no images: don't use image scenes)"}`];
  const has = n => m.spots.some(sp => sp.name.toLowerCase() === String(n || "").toLowerCase());
  s.callouts = (s.callouts || []).filter(c => has(c.spot));
  if (s.zoom && !has(s.zoom)) { delete s.zoom; delete s.zoomWord; }
  return [];
}

function validateScenes(j, media = [], types = COMPONENT_TYPES) {
  const problems = [];
  if (!Array.isArray(j.scenes) || j.scenes.length < 5) problems.push("scenes must be an array of at least 5 scenes");
  else {
    j.scenes.forEach((s, i) => { if (!types.includes(s.type)) problems.push(`scene ${i + 1}: unknown type "${s.type}"`); if (typeof s.say !== "string") problems.push(`scene ${i + 1}: missing "say"`);
      problems.push(...imageProblems(s, media, `scene ${i + 1}`), ...S.sceneProblems(s, `scene ${i + 1}`)); });
    if (j.scenes[0]?.type !== "hello") problems.push('first scene must be "hello"');
    if (j.scenes.at(-1)?.type !== "bye") problems.push('last scene must be "bye"');
    if (!j.scenes.some(s => s.type === "hook")) problems.push('a "hook" scene is required');
  }
  if (!j.keyword || !/^[A-Z0-9]{2,16}$/.test(j.keyword)) problems.push("keyword must be one UPPERCASE word");
  return problems;
}

function estimateDur(s) { return Math.max(2.5, 0.6 + U.wordsIn(s.say) / 2.45); }

async function stepScript(cfg, p) {
  p.status = "scripting"; save(cfg, p);
  const hooks = recentHooks(cfg);
  const vars = { STYLE: prompt(cfg, "style.md"), DAY: p.day, TOPIC: p.topic, AUDIENCE: p.audience || "mixed", VISUAL: p.visual || "whiteboard",
    NOTES: [p.notes, slotFor(cfg, p.day) && `Calendar slot for this day: ${slotFor(cfg, p.day)}`].filter(Boolean).join(" ") || "none",
    RECENT_HOOKS: hooks.length ? hooks.map(h => `"${h}"`).join("; ") : "none", MEDIA: M.forPrompt(workDir(cfg, p.day)),
    ...skillVars(p), SKILL_LIBRARY: S.library(skillOf(p).id) };
  const media = M.load(workDir(cfg, p.day)).items;
  let base = fill(prompt(cfg, "script.md"), vars), j, problems = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    log(cfg, p, attempt ? `fixing the script: ${problems.join("; ")}` : "writing the script with Claude…");
    j = await LLM.askJson(attempt ? `${base}\n\nYour previous JSON had these problems, fix them:\n- ${problems.join("\n- ")}\n\nPrevious JSON:\n${JSON.stringify(j)}` : base, cfg);
    if (j.keyword) j.keyword = String(j.keyword).toUpperCase().replace(/[^A-Z0-9]/g, "");
    problems = validateScenes(j, media, typesFor(p));
    if (!problems.length) break;
  }
  if (problems.length) throw new Error("The script still has problems: " + problems.join("; "));

  // the comment keyword is the same everywhere
  for (const s of j.scenes) if (s.type === "cta") s.word = j.keyword;
  // hook judge: score the opening, rewrite below 7, never repeat a hook from the last 30 days
  const hook = j.scenes.find(s => s.type === "hook");
  log(cfg, p, "scoring the hook…");
  let judge = await LLM.askJson(fill(prompt(cfg, "judge.md"), { TOPIC: p.topic, HOOK_SCREEN: [hook.title, hook.title2, hook.sub].filter(Boolean).join(" / "),
    HOOK_SAY: hook.say, RECENT_HOOKS: vars.RECENT_HOOKS }), cfg);
  const repeat = hooks.find(h => similarity(h, hook.say) >= 0.8);
  if (repeat && (judge.score ?? 0) >= 7) judge = { ...judge, score: 6, reason: `Too close to a recent hook: "${repeat}"` };
  judge.original = { title: hook.title, title2: hook.title2, sub: hook.sub, say: hook.say };
  if ((judge.score ?? 0) < 7 && judge.rewrite?.say) {
    Object.assign(hook, Object.fromEntries(Object.entries(judge.rewrite).filter(([, v]) => v !== undefined)));
    if (!hook.title2) delete hook.title2; if (!hook.sub) delete hook.sub;
    log(cfg, p, `hook scored ${judge.score}/10 → rewritten`);
  } else log(cfg, p, `hook scored ${judge.score}/10`);

  const tl = { title: j.title, keyword: j.keyword, logos: {}, sfxVolume: cfg.sfxVolume, musicVolume: cfg.musicVolume,
    theme: S.lookOf(skillOf(p).id, p.look), camera: skillOf(p).camera,
    scenes: j.scenes.map(s => ({ ...s, dur: +estimateDur(s).toFixed(2) })) };
  U.writeJson(path.join(workDir(cfg, p.day), "timeline.json"), tl);
  writeScriptTxt(cfg, p, tl);
  Object.assign(p, { title: j.title, keyword: j.keyword, dmOffer: j.dm_offer || "", factsToCheck: j.facts_to_check || [], judge, visualVersions: {},
    status: "review", approved: false, words: tl.scenes.reduce((a, s) => a + U.wordsIn(s.say), 0) });
  log(cfg, p, `script ready: ${tl.scenes.length} scenes, ${p.words} words (about ${Math.round(p.words / 2.45)} s). Waiting for your approval.`);
  await buildPreview(cfg, p);
}

// Show version k of scene i's visual (from p.visualVersions); words and synced length stay.
async function pickVisual(cfg, p, i, k) {
  const h = p.visualVersions?.[i];
  if (!h || !h.list[k]) throw new Error("That version doesn't exist.");
  const w = workDir(cfg, p.day), tl = U.readJson(path.join(w, "timeline.json")), { say, dur } = tl.scenes[i];
  tl.scenes[i] = { ...h.list[k], say, dur };
  if (tl.scenes[i].type === "cta") tl.scenes[i].word = tl.keyword;
  U.writeJson(path.join(w, "timeline.json"), tl);
  h.at = k; Object.assign(p, { approved: false, status: "review" });
  log(cfg, p, `scene ${i + 1}: showing visual version ${k + 1} of ${h.list.length}`);
  save(cfg, p);
  await buildPreview(cfg, p);
}

// The HTML preview (build/preview.html) the app plays with the voice before anything is rendered. Takes a second.
async function buildPreview(cfg, p) {
  await U.run(process.execPath, [path.join(cfg.root, "render.js"), workDir(cfg, p.day), "--preview-only"], { log: () => {} });
}

// New on-screen design for one scene (p.visualJob = { index, instruction }); the spoken line and its timing stay.
async function stepVisual(cfg, p) {
  const job = p.visualJob; p.visualJob = null;
  if (!job) throw new Error("No scene picked for a new visual.");
  const w = workDir(cfg, p.day), tl = U.readJson(path.join(w, "timeline.json")), i = job.index, old = tl.scenes[i];
  if (!old) throw new Error(`Scene ${i + 1} doesn't exist.`);
  p.status = "designing"; save(cfg, p);
  const { say, dur, ...screen } = old;
  const types = FIXED_TYPES.includes(old.type) ? [old.type] : typesFor(p).filter(t => !FIXED_TYPES.includes(t));
  const base = fill(prompt(cfg, "visual.md"), { STYLE: prompt(cfg, "style.md"), TOPIC: p.topic, AUDIENCE: p.audience || "mixed", VISUAL: p.visual || "whiteboard",
    LIBRARY: library(cfg, p), ...skillVars(p),
    SCRIPT: tl.scenes.map((s, k) => { const { say: sy, dur: d, ...sc } = s; return `${k + 1}. ${JSON.stringify(sc)} says: ${sy}`; }).join("\n"),
    N: i + 1, SAY: say, CURRENT: JSON.stringify(screen), TYPES: types.join(", "), INSTRUCTION: (job.instruction || "").trim() || "none", MEDIA: M.forPrompt(w) });
  const media = M.load(w).items;
  let j, problems = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    log(cfg, p, attempt ? `fixing scene ${i + 1}'s visual: ${problems.join("; ")}` : `designing a new visual for scene ${i + 1}${job.instruction ? `: "${job.instruction}"` : ""}…`);
    j = await LLM.askJson(attempt ? `${base}\n\nYour previous JSON had these problems, fix them:\n- ${problems.join("\n- ")}\n\nPrevious JSON:\n${JSON.stringify(j)}` : base, cfg);
    problems = types.includes(j.scene?.type) ? [...imageProblems(j.scene, media, `scene ${i + 1}`), ...S.sceneProblems(j.scene, `scene ${i + 1}`)] : [`"type" must be one of: ${types.join(", ")}`];
    if (!problems.length) break;
  }
  if (problems.length) throw new Error(`Scene ${i + 1} visual still has problems: ` + problems.join("; "));
  applyScreen(p, tl, i, j.scene);
  U.writeJson(path.join(w, "timeline.json"), tl);
  // new words on screen: back to review, so nothing unapproved is rendered
  Object.assign(p, { factsToCheck: [...new Set([...(p.factsToCheck || []), ...(j.facts_to_check || [])])], approved: false, status: "review" });
  await buildPreview(cfg, p);
  log(cfg, p, `scene ${i + 1} has a new visual (${tl.scenes[i].type}). Watch the preview, then approve to render.`);
}

// Put a new screen on scene i (same words, same synced length) and keep it as a new version, so ◀ Previous can go back.
function applyScreen(p, tl, i, screenIn) {
  const { say, dur, ...old } = tl.scenes[i], { say: _s, dur: _d, ...sc } = screenIn;
  if (sc.type === "cta") sc.word = tl.keyword;
  tl.scenes[i] = { ...sc, say, dur };
  const vv = (p.visualVersions ||= {}), h = (vv[i] ||= { list: [old], at: 0 });
  h.list.push(sc); h.at = h.list.length - 1;
}

// Claude places my images (Media tab) into the scenes that fit them; each change is a new visual version.
async function stepPlace(cfg, p) {
  const w = workDir(cfg, p.day), tl = U.readJson(path.join(w, "timeline.json")), media = M.load(w).items;
  if (!tl) throw new Error("Write the script first.");
  if (!media.length) throw new Error("Add an image on the Media tab first.");
  const before = p.status; p.status = "designing"; save(cfg, p);
  const free = typesFor(p).filter(t => !FIXED_TYPES.includes(t));
  log(cfg, p, `placing ${media.length} image(s) with Claude…`);
  const j = await LLM.askJson(fill(prompt(cfg, "place.md"), { STYLE: prompt(cfg, "style.md"), TOPIC: p.topic, VISUAL: p.visual || "whiteboard",
    LIBRARY: library(cfg, p), ...skillVars(p), MEDIA: M.forPrompt(w), FREE_TYPES: free.join(", "),
    SCRIPT: tl.scenes.map((s, k) => { const { say: sy, dur: d, ...sc } = s; return `${k + 1}. ${JSON.stringify(sc)} says: ${sy}`; }).join("\n") }), cfg);
  let done = 0;
  for (const ch of j.changes || []) {
    const i = (ch.scene | 0) - 1, old = tl.scenes[i], sc = ch.screen || {};
    const ok = old && (FIXED_TYPES.includes(old.type) ? sc.type === old.type : free.includes(sc.type)) && !imageProblems(sc, media, "").length;
    if (!ok) { log(cfg, p, `  skipped a suggestion for scene ${ch.scene}: it didn't fit the rules`); continue; }
    applyScreen(p, tl, i, sc); done++;
    log(cfg, p, `  scene ${i + 1}: ${sc.type === "image" ? `shows "${sc.media}"` : `logo "${sc.logo}" beside the title`}`);
  }
  for (const s of j.skipped || []) log(cfg, p, `  not used: ${s}`);
  U.writeJson(path.join(w, "timeline.json"), tl);
  p.status = done ? "review" : before;
  if (done) p.approved = false;
  await buildPreview(cfg, p);
  log(cfg, p, done ? `${done} scene(s) changed. Watch the preview (◀ Previous on a scene undoes it), then approve.` : "no scene changed.");
}

// Rewrite one scene (p.sceneJob = { index, instruction }); the rest of the script stays as it is.
async function stepScene(cfg, p) {
  const job = p.sceneJob; p.sceneJob = null;
  if (!job) throw new Error("No scene picked to rewrite.");
  const w = workDir(cfg, p.day), tl = U.readJson(path.join(w, "timeline.json")), i = job.index, old = tl.scenes[i];
  if (!old) throw new Error(`Scene ${i + 1} doesn't exist.`);
  p.status = "scripting"; save(cfg, p);
  const { say, dur, type, ...screen } = old;
  const base = fill(prompt(cfg, "scene.md"), { STYLE: prompt(cfg, "style.md"), DAY: p.day, TOPIC: p.topic, AUDIENCE: p.audience || "mixed", KEYWORD: tl.keyword,
    LIBRARY: library(cfg, p), ...skillVars(p),
    SCRIPT: tl.scenes.map((s, k) => `${k + 1}. [${s.type}] ${s.say}`).join("\n"),
    N: i + 1, TYPE: type, PREV: i ? i : "(none: this is the first)", NEXT: i + 2 <= tl.scenes.length ? i + 2 : "(none: this is the last)",
    CURRENT: JSON.stringify({ type, ...screen, say }), INSTRUCTION: (job.instruction || "").trim() || "none" });
  let j, problems = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    log(cfg, p, attempt ? `fixing scene ${i + 1}: ${problems.join("; ")}` : `rewriting scene ${i + 1} with Claude${job.instruction ? `: "${job.instruction}"` : ""}…`);
    j = await LLM.askJson(attempt ? `${base}\n\nYour previous JSON had these problems, fix them:\n- ${problems.join("\n- ")}\n\nPrevious JSON:\n${JSON.stringify(j)}` : base, cfg);
    const s = j.scene || {};
    problems = [];
    if (s.type !== type) problems.push(`"type" must stay "${type}"`);
    if (typeof s.say !== "string" || !s.say.trim()) problems.push('"say" is missing');
    problems.push(...S.sceneProblems(s, `scene ${i + 1}`));
    if (!problems.length) break;
  }
  if (problems.length) throw new Error(`Scene ${i + 1} rewrite still has problems: ` + problems.join("; "));
  const sc = { ...j.scene };
  if (sc.type === "cta") sc.word = tl.keyword;
  tl.scenes[i] = { ...sc, dur: +estimateDur(sc).toFixed(2) };
  if (p.visualVersions) delete p.visualVersions[i];          // new words: old visual versions no longer fit
  U.writeJson(path.join(w, "timeline.json"), tl);
  writeScriptTxt(cfg, p, tl);
  const facts = [...(p.factsToCheck || []), ...(j.facts_to_check || [])];
  // new words from Claude: back to review, so nothing unapproved gets voiced
  Object.assign(p, { factsToCheck: [...new Set(facts)], words: tl.scenes.reduce((a, s) => a + U.wordsIn(s.say), 0), approved: false, status: "review" });
  await buildPreview(cfg, p);
  log(cfg, p, `scene ${i + 1} rewritten. Read it, then approve the script again.`);
}

function writeScriptTxt(cfg, p, tl) {
  let t = 0;
  const lines = [`DAY ${p.day} – ${tl.title} (voiceover, ~${Math.round(tl.scenes.reduce((a, s) => a + s.dur, 0))} s)`, `Comment keyword: ${tl.keyword}`, ""];
  tl.scenes.forEach((s, i) => {
    const a = t; t += s.dur;
    const mmss = x => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
    lines.push(`${mmss(a)} – ${mmss(t)} (Scene ${i + 1}, ${s.type}): "${s.say}"`);
  });
  fs.writeFileSync(path.join(workDir(cfg, p.day), "script.txt"), lines.join("\n") + "\n");
}

async function stepVoice(cfg, p) {
  if (!p.approved) throw new Error("Approve the script first (nothing is voiced before approval).");
  const w = workDir(cfg, p.day);
  p.status = "voicing"; save(cfg, p);
  if (p.voiceMode === "recording") {
    const raw = ["raw-voice.wav", "raw-voice.mp3", "raw-voice.m4a", "raw-voice.aac", "raw-voice.webm"].find(f => fs.existsSync(path.join(w, f)));
    if (!raw) throw new Error("Upload your recording first (Voice → My recording).");
    log(cfg, p, `cleaning your recording (${raw}): cutting mistakes and retakes…`);
    await U.run(cfg.python, [path.join(cfg.root, "kit", "clean_voice.py"), w, "--stt", "whisper", "--whisper-size", cfg.voice.whisper, "--lang", "en-IN"], { log: l => log(cfg, p, l) });
  } else {
    const ref = path.resolve(cfg.root, cfg.voice.reference);
    if (cfg.voice.model !== "test" && !fs.existsSync(ref)) throw new Error(`Record your 10-second reference clip first (Settings → Voice). Expected at ${ref}`);
    const redo = p.voiceRedo || []; p.voiceRedo = null;      // scenes to take again, ignoring the cache
    log(cfg, p, redo.length ? `new take of scene ${redo.map(i => i + 1).join(", ")}; the other scenes are kept…` : `generating each scene in your voice (Chatterbox ${cfg.voice.model}, ${cfg.voice.device})…`);
    const tts = () => U.run(cfg.python, [path.join(cfg.root, "py", "tts.py"), w, "--ref", ref, "--model", cfg.voice.model, "--device", cfg.voice.device, "--whisper", cfg.voice.whisper,
      "--temperature", String(cfg.voice.temperature ?? 0.8), "--max-pause", String(cfg.voice.maxPause ?? 0.45), ...redo.flatMap(i => ["--redo", String(i)])], { log: l => log(cfg, p, l) });
    // Loading the voice model needs a few GB of Windows memory (RAM + page file). When it runs short, Windows either crashes
    // the process (access violation 3221225477 and friends) or refuses ("paging file is too small", os error 1455).
    // Finished clips are cached, so one more try a little later only redoes what's missing.
    const lowMemory = e => /exit (3221225477|3221226505|3221225725|-1073741819)\b|paging file is too small|os error 1455/i.test(e.message);
    try { await tts(); } catch (e) {
      if (!lowMemory(e)) throw e;
      log(cfg, p, "! Windows ran short of memory while loading the voice model. Trying once more in 20 s…");
      await new Promise(r => setTimeout(r, 20000));
      try { await tts(); } catch (e2) {
        if (!lowMemory(e2)) throw e2;
        throw new Error("Windows ran out of memory while loading the voice model (it needs about 4 GB free). Close Chrome tabs and other big apps " +
          "(WSL or Docker: run 'wsl --shutdown'), then press Generate voice again. Finished scenes are kept. If it keeps happening, give Windows " +
          "a bigger page file: Settings → System → About → Advanced system settings → Performance: Settings → Advanced → Virtual memory → " +
          "Change, and add a page file on drive D: (for example 16384 to 32768 MB).");
      }
    }
    const rep = U.readJson(path.join(w, "clips", "report.json"), []);
    p.voiceFlags = rep.filter(r => r.status === "flagged").map(r => ({ scene: r.scene + 1, why: r.why, heard: r.heard }));
  }
}

// Cut a stretch out of one scene's clip by hand (p.cutJob = { index, from, to }), then sync follows.
async function stepCut(cfg, p) {
  const job = p.cutJob; p.cutJob = null;
  if (!job) throw new Error("No cut picked.");
  log(cfg, p, `cutting ${job.from}–${job.to} s out of scene ${job.index + 1}…`);
  await U.run(cfg.python, [path.join(cfg.root, "py", "cut_clip.py"), workDir(cfg, p.day), String(job.index), String(job.from), String(job.to)], { log: l => log(cfg, p, l) });
}

async function stepSync(cfg, p) {
  const w = workDir(cfg, p.day);
  log(cfg, p, "syncing scenes to the voice, frame by frame…");
  await U.run(cfg.python, [path.join(cfg.root, "py", "sync.py"), w, "--mode", p.voiceMode === "recording" ? "recording" : "clips", "--fps", String(cfg.fps)], { log: l => log(cfg, p, l) });
  writeScriptTxt(cfg, p, U.readJson(path.join(w, "timeline.json")));
  await stepCaptions(cfg, p);
  await buildPreview(cfg, p);
}

// Word-timed captions from the final voice (only changed scenes are listened to again); off in Settings removes them.
async function stepCaptions(cfg, p) {
  const w = workDir(cfg, p.day), f = path.join(w, "captions.json");
  if (cfg.captions === false) { if (fs.existsSync(f)) fs.rmSync(f); return; }
  log(cfg, p, "timing the captions to your voice…");
  await U.run(cfg.python, [path.join(cfg.root, "py", "captions.py"), w, "--whisper", cfg.voice.whisper === "off" ? "base.en" : cfg.voice.whisper],
    { log: l => /✓|error|Error/.test(l) && log(cfg, p, l), env: { HF_HUB_DISABLE_SYMLINKS_WARNING: "1" } });
}

// Paint the Clawd scenes that have no clip yet (lib/clawd.js). p.paintJob = { index } paints just that scene again.
// Painting is visual only (no words, no voice), so it may run before approval, like the preview.
async function stepPaint(cfg, p) {
  const C = require("./clawd"), w = workDir(cfg, p.day), tl = U.readJson(path.join(w, "timeline.json"));
  if (!tl) throw new Error("Write the script first.");
  const only = p.paintJob; p.paintJob = null;
  const todo = tl.scenes.map((s, i) => ({ s, i })).filter(({ s, i }) => s.type === "clawd"
    && (only ? i === only.index : !fs.existsSync(path.join(w, "art", C.artKey(s), "clip.mp4"))));
  if (!todo.length) return log(cfg, p, only ? "that scene isn't a Clawd scene" : "all Clawd scenes are painted");
  const before = p.status; p.status = "painting"; save(cfg, p);
  for (const { s, i } of todo) { log(cfg, p, `scene ${i + 1}:`); await C.paint(w, s, s.dur || estimateDur(s), l => log(cfg, p, l)); }
  p.status = before; save(cfg, p);
  await buildPreview(cfg, p);
}

// Collage B-roll for one scene (py/broll.py, Gemini on the user's key): p.brollJob = { index, what: "still" | "animate" }.
// Gate 1 is the approved script (the metaphor), gate 2 the still you look at, gate 3 the paid clip.
async function stepBroll(cfg, p) {
  const job = p.brollJob; p.brollJob = null;
  const C = require("./clawd"), w = workDir(cfg, p.day), tl = U.readJson(path.join(w, "timeline.json")), sc = tl?.scenes[job?.index];
  if (!sc || sc.type !== "broll") throw new Error("Pick a B-roll scene.");
  const b = { imageModel: "gemini-2.5-flash-image", videoModel: "gemini-omni-flash-preview", ...(cfg.broll || {}) };
  const { say, dur, _art, ...look } = sc, before = p.status; p.status = "designing"; save(cfg, p);
  log(cfg, p, `scene ${job.index + 1}: B-roll ${job.what === "still" ? "still" : "clip"} (paid Gemini call)…`);
  await U.run(cfg.python, [path.join(cfg.root, "py", "broll.py"), job.what, path.join(w, "art", C.artKey(sc)), JSON.stringify(look),
    "--model", job.what === "still" ? b.imageModel : b.videoModel, "--seconds", String(Math.max(3, Math.min(10, Math.round(dur || 5))))],
    { log: l => log(cfg, p, "  " + l), env: { GEMINI_API_KEY: U.loadEnv().GEMINI_API_KEY || process.env.GEMINI_API_KEY || "" } });
  p.status = before; save(cfg, p);
  await buildPreview(cfg, p);
}

// Studio film (lib/studio.js): Claude Code with tools makes a custom film in a pulled skill's world, on the approved
// script and synced voice. p.studioJob = { skill, style }. Long (30–120 min) and uses many tokens.
async function stepStudio(cfg, p) {
  const job = p.studioJob; p.studioJob = null;
  if (!job) throw new Error("Pick a skill for the Studio film.");
  if (!p.approved) throw new Error("Approve the script first.");
  const w = workDir(cfg, p.day);
  if (!fs.existsSync(path.join(w, "voice.wav"))) throw new Error("Make the voice first (Render video once, or the Voice tab).");
  const Studio = require("./studio"), before = p.status; p.status = "studio"; save(cfg, p);
  const { dir, name, total } = await Studio.prepare(cfg, p, w, job, l => log(cfg, p, l));
  log(cfg, p, `Claude Code is making the ${S.get(job.skill).name} film (tools on, only inside the studio folder)…`);
  const said = await Studio.runAgent(cfg, dir, l => log(cfg, p, l));
  if (said) log(cfg, p, "Claude: " + said.split("\n")[0].slice(0, 200));
  const r = await Studio.finish(w, dir, name, total, l => log(cfg, p, l));
  p.studioFilms = { ...(p.studioFilms || {}), [name]: { file: r.file, len: r.len, off: r.off, at: new Date().toISOString(), skill: job.skill, style: job.style || null } };
  p.status = before;
}

async function stepRender(cfg, p) {
  p.status = "rendering"; save(cfg, p);
  log(cfg, p, "rendering (only changed scenes are redrawn)…");
  await U.run(process.execPath, [path.join(cfg.root, "render.js"), workDir(cfg, p.day), "--fps", String(cfg.fps)],
    { log: l => log(cfg, p, l), env: { PYTHON: cfg.python } });
}

function lufs(file) {
  try {
    const out = execFileSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true }).toString();
    return out;
  } catch (e) { return String(e.stderr || ""); }
}

async function stepChecks(cfg, p) {
  p.status = "checking"; save(cfg, p);
  const w = workDir(cfg, p.day), b = path.join(w, "build"), items = [];
  const add = (name, ok, detail, level = ok ? "ok" : "error") => items.push({ name, ok, level: ok ? "ok" : level, detail });
  const sync = U.readJson(path.join(w, "sync.json"), {}), info = U.readJson(path.join(b, "render-info.json"), {}), tl = U.readJson(path.join(w, "timeline.json"));
  const fps = cfg.fps;
  add("Voice length = video length", !!sync.exact && sync.frames === info.frames,
      `${sync.voice_samples} voice samples for ${info.frames} frames (${(info.frames / fps).toFixed(3)} s); exact to the sample`);
  const starts = (info.starts || []).map(s => Math.round(s * fps)), want = (sync.scenes || []).map(s => s.start_frame);
  const bad = starts.map((s, i) => Math.abs(s - want[i])).filter(d => d > 1).length;
  add("Every scene starts on its clip", starts.length === want.length && bad === 0, bad ? `${bad} scene(s) more than one frame off` : `${starts.length} scenes, all within one frame`);
  const final = path.join(b, "final.mp4");
  if (fs.existsSync(final)) {
    const v = U.ffprobeDuration(final, "v:0"), a = U.ffprobeDuration(final, "a:0");
    add("Final file: audio and video tracks", Math.abs(v - a) <= 0.025, `video ${v.toFixed(3)} s, audio ${a.toFixed(3)} s (within one audio packet)`);
  } else add("Final file exists", false, "build/final.mp4 is missing");
  const slow = (info.lens || []).map((len, i) => ({ i, k: len / Math.max(0.5, info.durs[i] - 0.4) })).filter(x => x.k > 1.25);
  add("No animation squeezed", !slow.length, slow.length ? "sped up: " + slow.map(x => `scene ${x.i + 1} ×${x.k.toFixed(1)}`).join(", ") + " (shorten its text or add words to its line)" : "every animation fits its voice line", "warn");
  const lo = lufs(path.join(w, "voice.wav"));
  const I = parseFloat((lo.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)[0]);
  const P = parseFloat((lo.match(/Peak:\s+(-?[\d.]+) dBFS/g) || []).pop()?.match(/-?[\d.]+/)?.[0]);
  if (!isNaN(I)) add("Voice loudness", I > -20 && I < -12 && (isNaN(P) || P < -0.5), `${I.toFixed(1)} LUFS integrated${isNaN(P) ? "" : `, true peak ${P.toFixed(1)} dBFS`} (target about −16, peak below −1)`, "warn");
  if (fs.existsSync(path.join(b, "video-only.mp4"))) {
    let still = "";
    try { still = execFileSync("ffmpeg", ["-hide_banner", "-nostats", "-i", path.join(b, "video-only.mp4"), "-vf", "freezedetect=n=0.0005:d=3", "-map", "0:v", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true }).toString(); }
    catch (e) { still = String(e.stderr || ""); }
    const freezes = (still.match(/freeze_duration: ([\d.]+)/g) || []).map(s => parseFloat(s.split(": ")[1]));
    add("Something changes every 3 s", !freezes.length, freezes.length ? `${freezes.length} still stretch(es) over 3 s, longest ${Math.max(...freezes).toFixed(1)} s` : "no still stretch over 3 s", "warn");
  }
  if (p.voiceFlags?.length) add("Voice read-back", false, p.voiceFlags.map(f => `scene ${f.scene}: ${f.why}`).join("; "), "warn");
  else if (p.voiceMode !== "recording") add("Voice read-back", true, "every clip matched its script line");
  const cta = tl.scenes.find(s => s.type === "cta");
  add("Comment keyword in the video", !cta || (cta.word === tl.keyword && cta.say.toUpperCase().includes(tl.keyword)), cta ? `"${cta.word}" on screen; said in the CTA line: ${cta.say.toUpperCase().includes(tl.keyword) ? "yes" : "no"}` : "no CTA scene", "warn");
  add("Page errors", !(info.pageErrors || []).length, (info.pageErrors || []).join("; ") || "none");
  add("Contact sheet", fs.existsSync(path.join(b, "sheet.png")), "look at it for clipped or overlapping text", "warn");
  const used = new Set(tl.scenes.flatMap(s => [s.media, s.logo]).filter(Boolean));
  const small = M.load(w).items.filter(m => used.has(m.id) && m.kind !== "logo" && m.w < 700);
  if (used.size) add("Images sharp enough", !small.length, small.length ? small.map(m => `"${m.id}" is only ${m.w}px wide (use 700px or more)`).join("; ") : `${used.size} image(s) used, all sharp enough`, "warn");
  const errors = items.filter(i => i.level === "error").length, warns = items.filter(i => i.level === "warn").length;
  U.writeJson(path.join(w, "checks.json"), { at: new Date().toISOString(), errors, warns, items });
  p.checks = { errors, warns };
  log(cfg, p, `checks: ${items.length - errors - warns} passed, ${warns} warning(s), ${errors} error(s)`);
  if (errors) throw new Error(`${errors} check(s) failed: ` + items.filter(i => i.level === "error").map(i => i.name).join(", "));
}

function copyChecks(cfg, c, keyword) {
  const L = U.readJson(path.join(cfg.root, "data", "limits.json"), {}), out = [];
  const q = `"${keyword}"`, has = s => String(s || "").includes(keyword);
  const tags = a => (a || []).map(t => t.startsWith("#") ? t : "#" + t);
  const igText = `${c.instagram?.caption || ""}\n\n${tags(c.instagram?.hashtags).join(" ")}`;
  const ytDesc = `${c.youtube?.description || ""}\n\n${tags(c.youtube?.hashtags).join(" ")}`;
  const liText = `${c.linkedin?.post || ""}\n\n${tags(c.linkedin?.hashtags).join(" ")}`;
  const chk = (name, ok, detail) => out.push({ name, ok, detail });
  chk("YouTube title length", (c.youtube?.title || "").length <= L.youtubeTitle, `${(c.youtube?.title || "").length}/${L.youtubeTitle}`);
  chk("YouTube description length", ytDesc.length <= L.youtubeDescription, `${ytDesc.length}/${L.youtubeDescription}`);
  chk("Instagram caption length", igText.length <= L.instagramCaption, `${igText.length}/${L.instagramCaption}`);
  chk("Instagram hashtags", tags(c.instagram?.hashtags).length <= L.instagramHashtags, `${tags(c.instagram?.hashtags).length}/${L.instagramHashtags}`);
  chk("X post length", (c.x?.post || "").length <= L.xPost, `${(c.x?.post || "").length}/${L.xPost}`);
  chk("LinkedIn post length", liText.length <= L.linkedinPost, `${liText.length}/${L.linkedinPost}`);
  for (const [name, text] of [["YouTube", ytDesc], ["Instagram", igText], ["X", c.x?.post], ["LinkedIn", liText], ["DM reply", c.dm_reply]])
    chk(`Keyword ${q} in ${name}`, has(text), has(text) ? "found" : "missing: the DM automation would break");
  return { texts: { youtubeDescription: ytDesc, instagram: igText, linkedin: liText }, checks: out };
}

async function stepCopy(cfg, p) {
  p.status = "writing copy"; save(cfg, p);
  const w = workDir(cfg, p.day), tl = U.readJson(path.join(w, "timeline.json"));
  log(cfg, p, "writing posts for YouTube, Instagram, X and LinkedIn…");
  const script = tl.scenes.map((s, i) => `${i + 1}. [${s.type}] ${s.say}`).join("\n");
  let c = await LLM.askJson(fill(prompt(cfg, "copy.md"), { DAY: p.day, NEXT: p.day + 1, TITLE: tl.title, KEYWORD: tl.keyword, DM_OFFER: p.dmOffer, SCRIPT: script }), cfg);
  let res = copyChecks(cfg, c, tl.keyword);
  const failed = res.checks.filter(x => !x.ok);
  if (failed.length) {
    log(cfg, p, `fixing the copy: ${failed.map(f => f.name).join(", ")}`);
    c = await LLM.askJson(`${fill(prompt(cfg, "copy.md"), { DAY: p.day, NEXT: p.day + 1, TITLE: tl.title, KEYWORD: tl.keyword, DM_OFFER: p.dmOffer, SCRIPT: script })}\n\nYour previous JSON failed these checks; fix only those:\n- ${failed.map(f => `${f.name}: ${f.detail}`).join("\n- ")}\n\nPrevious JSON:\n${JSON.stringify(c)}`, cfg);
    res = copyChecks(cfg, c, tl.keyword);
  }
  U.writeJson(path.join(w, "copy.json"), c);
  p.copyChecks = res.checks;
  writeCopyMd(cfg, p, c, res);
  const bad = res.checks.filter(x => !x.ok);
  p.status = "ready";
  log(cfg, p, bad.length ? `copy written; ${bad.length} check(s) need a look before export` : "copy written; all checks passed. Preview the video, then export.");
}

function aiNote(p) {
  return p.voiceMode === "recording" ? "" :
    "\n> AI voice used: switch on the AI / altered-content label when you post (YouTube Studio: answer Yes to \"Altered content\"; Instagram: Advanced settings → AI label).\n";
}

// credits for the images the video shows (links I added them from; uploads are mine)
function imageSources(cfg, p) {
  const w = workDir(cfg, p.day), tl = U.readJson(path.join(w, "timeline.json")) || { scenes: [] };
  const used = new Set(tl.scenes.flatMap(s => [s.media, s.logo]).filter(Boolean));
  const items = M.load(w).items.filter(m => used.has(m.id));
  const ai = items.some(m => m.ai);
  return items.length ? "\n## Image sources\n" + items.map(m => `- ${m.note}: ${m.source === "upload" ? "my own upload" : m.source}${m.credit ? ` (${m.credit})` : ""}`).join("\n")
    + (ai ? "\n\n> AI-generated images are used: switch on the AI / altered-content label when you post." : "") : "";
}

function writeCopyMd(cfg, p, c, res) {
  const tags = a => (a || []).map(t => t.startsWith("#") ? t : "#" + t).join(" ");
  const md = [`# Day ${p.day}: ${p.title}`, aiNote(p), `**Comment keyword:** ${p.keyword}`, "",
    "## YouTube Shorts", `**Title:** ${c.youtube?.title}`, "", "**Description:**", "", res.texts.youtubeDescription, "",
    `**Other titles:** ${(c.youtube?.alt_titles || []).join(" · ")}`, "",
    "## Instagram Reels", "", res.texts.instagram, "",
    "## X", "", c.x?.post || "", "",
    "## LinkedIn", "", res.texts.linkedin, "",
    "## DM reply (for the keyword automation)", "", c.dm_reply || "", "",
    "## Thumbnail prompts", ...(c.thumbnails || []).map(t => `\n**${t.angle}** (sticker: "${t.sticker}")\n\n${t.prompt}`), "",
    "## Checks", ...res.checks.map(x => `- ${x.ok ? "✓" : "✗"} ${x.name}: ${x.detail}`),
    p.factsToCheck?.length ? "\n## Facts to verify before posting\n" + p.factsToCheck.map(f => `- ${f}`).join("\n") : "",
    imageSources(cfg, p)].join("\n");
  fs.writeFileSync(path.join(workDir(cfg, p.day), "copy.md"), md);
}

async function stepExport(cfg, p) {
  const w = workDir(cfg, p.day), d = dayDir(cfg, p.day), tl = U.readJson(path.join(w, "timeline.json"));
  const final = path.join(w, "build", p.finalFile || "final.mp4");          // a Studio film when "Use as final" picked one
  if (!fs.existsSync(final)) throw new Error(p.finalFile ? `${p.finalFile} is missing: pick the rendered video again.` : "Render the video first.");
  const name = `day${p.day}-${U.slug(tl.title)}`;
  fs.copyFileSync(final, path.join(d, `${name}.mp4`));
  for (const f of ["copy.md", "script.txt"]) if (fs.existsSync(path.join(w, f))) fs.copyFileSync(path.join(w, f), path.join(d, `${name}-${f}`));
  if (fs.existsSync(path.join(w, "build", "sheet.png"))) fs.copyFileSync(path.join(w, "build", "sheet.png"), path.join(d, `${name}-sheet.png`));
  // the calendar item is done, and the hook is remembered so it isn't reused for 30 days
  const cal = U.readJson(calPath(cfg), { topics: [] });
  const item = (cal.topics || []).find(t => t.id === p.calendarId);
  if (item) { item.status = "done"; item.day = p.day; U.writeJson(calPath(cfg), cal); }
  const hist = U.readJson(histPath(cfg), { hooks: [] });
  const hook = tl.scenes.find(s => s.type === "hook");
  if (hook && !hist.hooks.some(h => h.day === p.day)) { hist.hooks.push({ day: p.day, say: hook.say, at: new Date().toISOString() }); U.writeJson(histPath(cfg), hist); }
  p.status = "exported"; p.exportedAs = name;
  log(cfg, p, `exported to ${d}: ${name}.mp4, copy, script and contact sheet`);
}

const STEPS = { script: stepScript, scene: stepScene, visual: stepVisual, place: stepPlace, preview: buildPreview, paint: stepPaint, broll: stepBroll, studio: stepStudio, cut: stepCut, voice: stepVoice, sync: stepSync, render: stepRender, checks: stepChecks, copy: stepCopy, export: stepExport,
  suggest: (cfg, p) => require("./suggest").stepSuggest(cfg, p), genimage: (cfg, p) => require("./suggest").stepGenImage(cfg, p) };

// ---------------------------------------------------------------- job queue (one at a time)
const queue = []; let busy = null;
function enqueue(cfg, day, steps) {
  if (busy?.day === day || queue.some(j => j.day === day)) throw new Error(`Day ${day} already has a job running or waiting`);
  queue.push({ day, steps });
  const p = load(cfg, day); p.job = { steps, state: "waiting" }; save(cfg, p); LIVE.set(day, p);
  pump(cfg);
}
async function pump(cfg) {
  if (busy || !queue.length) return;
  busy = queue.shift();
  let p = load(cfg, busy.day);
  try {
    for (const s of busy.steps) {
      if (busy.stopped) throw new Error("stopped");
      p.job = { steps: busy.steps, current: s, state: "running" }; save(cfg, p);
      await STEPS[s](cfg, p);
      p.done = { ...(p.done || {}), [s]: new Date().toISOString() };
      save(cfg, p);
    }
    p.error = null;
    // fresh timings: versions already made in the gallery are remade to match (lib/gallery.js); nothing new is made
    if (busy.steps.includes("sync") && p.approved) require("./gallery").refresh(cfg, busy.day);
  } catch (e) {
    if (busy.stopped) { p.error = null; p.status = "stopped"; log(cfg, p, "■ stopped by you. Finished scenes are kept; run it again to continue."); }
    else {
      p.error = e.message; log(cfg, p, "✗ " + e.message);
      if (["scripting", "designing", "painting", "studio", "voicing", "rendering", "checking", "writing copy"].includes(p.status)) p.status = "error";
    }
  } finally {
    p.job = null; save(cfg, p); LIVE.delete(busy.day); busy = null;
    pump(cfg);
  }
}
const isBusy = day => busy?.day === day || queue.some(j => j.day === day);
const queueIdle = () => !busy && !queue.length;
// Stop: drop this day's waiting job, and end the running one (its child processes are killed; caches only keep finished scenes).
function stop(cfg, day) {
  const k = queue.findIndex(j => j.day === day);
  if (k >= 0) { queue.splice(k, 1); const p = load(cfg, day); p.job = null; log(cfg, p, "■ removed from the queue"); save(cfg, p); LIVE.delete(day); }
  if (busy?.day === day) { busy.stopped = true; U.killAll(); }
}

module.exports = { AUDIENCES, VISUALS, pickVisual, setSkill, listProjects, createProject, load, save, dayDir, workDir, enqueue, isBusy, queueIdle, stop, nextDay, nextFromCalendar, LIVE, STEP_ORDER, writeScriptTxt, copyChecks, writeCopyMd, STEPS, log,
  // used by lib/gallery.js and lib/suggest.js
  prompt, fill, typesFor, skillVars, library, imageProblems, FIXED_TYPES, buildPreview };
