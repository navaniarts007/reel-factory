// Reel Factory: open http://localhost:5757 after `node server.js` (or double-click start.bat).
const http = require("http"), fs = require("fs"), path = require("path"), { execFile } = require("child_process");
const U = require("./lib/util"), P = require("./lib/pipeline"), M = require("./lib/media"), S = require("./lib/skills");
const G = require("./lib/gallery"), SG = require("./lib/suggest"), CHAT = require("./lib/chat"), CAL = require("./lib/calendar");
const PULLS = {};                                   // skill id -> { busy, log } while its GitHub repo is pulled

let cfg = U.loadConfig();
const WEB = path.join(__dirname, "web");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".mp4": "video/mp4", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8" };

const send = (res, code, body, type = "application/json") => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const body = req => new Promise((ok, bad) => { let b = ""; req.on("data", d => b += d); req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(e); } }); });

function sendFile(req, res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: "not found" });
  const size = fs.statSync(file).size, type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (m) {
    const a = m[1] ? +m[1] : 0, b = m[2] ? +m[2] : size - 1;
    res.writeHead(206, { "content-type": type, "content-range": `bytes ${a}-${b}/${size}`, "accept-ranges": "bytes", "content-length": b - a + 1, "cache-control": "no-store" });
    return fs.createReadStream(file, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}

function projectView(day) {
  const p = P.LIVE.get(day) || P.load(cfg, day);
  if (!p) return null;
  const w = P.workDir(cfg, day), j = f => U.readJson(path.join(w, f));
  const exists = f => fs.existsSync(path.join(w, f));
  const tl = j("timeline.json"), { artKey } = require("./lib/clawd");
  // clip scenes (clawd, broll): is their clip / still made yet?
  const art = (tl?.scenes || []).map(s => ["clawd", "broll"].includes(s.type) ? (k => ({ key: k, clip: exists(`art/${k}/clip.mp4`), still: exists(`art/${k}/still.png`) }))(artKey(s)) : null);
  return { ...p, busy: P.isBusy(day), timeline: tl, art, gallery: G.status(cfg, day), suggestions: SG.load(w).items, checks: j("checks.json"), copy: j("copy.json"),
    voiceReport: j("clips/report.json"), sync: j("sync.json"), media: M.load(w).items, editReport: exists("edit-report.txt") ? fs.readFileSync(path.join(w, "edit-report.txt"), "utf8") : null,
    files: { final: exists("build/final.mp4"), preview: exists("build/preview.html"), sheet: exists("build/sheet.png"), voice: exists("voice.wav"), copyMd: exists("copy.md"),
      recording: ["raw-voice.wav", "raw-voice.mp3", "raw-voice.m4a", "raw-voice.aac", "raw-voice.webm"].find(exists) || null },
    folder: P.dayDir(cfg, day) };
}

function setupStatus() {
  const ref = path.resolve(cfg.root, cfg.voice.reference);
  return { reference: fs.existsSync(ref), referencePath: ref, python: cfg.python, provider: cfg.llm.provider, daysRoot: cfg.daysRoot };
}

function saveConfig(patch) {
  const user = U.readJson(path.join(__dirname, "config.json"), {});
  const next = { ...user, ...patch, llm: { ...user.llm, ...patch.llm }, voice: { ...user.voice, ...patch.voice } };
  U.writeJson(path.join(__dirname, "config.json"), next);
  cfg = U.loadConfig();
}

function upload(req, dest) {
  return new Promise((ok, bad) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const out = fs.createWriteStream(dest);
    req.pipe(out); out.on("finish", ok); out.on("error", bad); req.on("error", bad);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x"), parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    // ---- static page
    if (req.method === "GET" && (url.pathname === "/" || parts[0] === "web")) return sendFile(req, res, path.join(WEB, url.pathname === "/" ? "index.html" : parts.slice(1).join("/")));
    // ---- files inside a Day's work folder (video, contact sheet, clips)
    if (req.method === "GET" && parts[0] === "files") {
      const w = P.workDir(cfg, +parts[1]), f = path.resolve(w, parts.slice(2).join("/"));
      if (!f.startsWith(path.resolve(w))) return send(res, 403, { error: "forbidden" });
      return sendFile(req, res, f);
    }
    if (parts[0] !== "api") return send(res, 404, { error: "not found" });
    if (req.method === "GET" && parts[1] === "reference.wav") return sendFile(req, res, path.resolve(cfg.root, cfg.voice.reference));

    // ---- api
    if (req.method === "GET" && parts[1] === "state") {
      const cal = CAL.load(cfg);
      // the calendar page counts days from Day 1's date: from the earliest Day made in the app, counted back to Day 1
      const first = P.listProjects(cfg).filter(x => x.status !== "manual").map(x => P.load(cfg, x.day)).filter(x => x?.createdAt).sort((a, b) => a.day - b.day)[0];
      const d1 = first && { createdAt: new Date(new Date(first.createdAt).getTime() - (first.day - 1) * 864e5).toISOString() };
      return send(res, 200, { projects: P.listProjects(cfg), nextDay: P.nextDay(cfg), nextTopic: P.nextFromCalendar(cfg), calendar: cal,
        day1Date: d1?.createdAt ? new Date(d1.createdAt).toLocaleDateString("en-CA") : null,
        config: { llm: cfg.llm, voice: cfg.voice, captions: cfg.captions !== false, fps: cfg.fps, daysRoot: cfg.daysRoot, dailyRunAt: cfg.dailyRunAt }, setup: setupStatus(),
        skills: S.list(), skillStatus: S.status().map(x => ({ ...x, pull: PULLS[x.id] || null })), lemoStyles: S.lemoStyles() });
    }
    // ---- master chat (lib/chat.js): Claude Code with tools, acting on the app through this API
    if (parts[1] === "chat") {
      if (req.method === "GET") return send(res, 200, CHAT.view(+url.searchParams.get("since") || 0));
      if (req.method === "POST" && parts[2] === "stop") { CHAT.stop(); return send(res, 200, CHAT.view(0)); }
      if (req.method === "POST" && parts[2] === "new") { CHAT.reset(); return send(res, 200, CHAT.view(0)); }
      if (req.method === "POST" && !parts[2]) { const b = await body(req); CHAT.send(cfg, b.message, { day: b.day, tab: b.tab, page: b.page }); return send(res, 200, CHAT.view(+b.since || 0)); }
    }
    // ---- restart (after the assistant changed the app's code): a detached starter waits for the port, then this server exits
    if (req.method === "POST" && parts[1] === "restart") {
      const busy = P.listProjects(cfg).some(x => P.isBusy(x.day)) || CHAT.running();
      if (busy && !(await body(req)).force) return send(res, 409, { error: "A job or the chat is still running. Wait for it, or stop it first." });
      CHAT.codeRestarted();
      // On Windows the new server gets its own minimized console window (like start.bat): without a console, every
      // ffmpeg, git or python it starts would flash a window of its own.
      const run = process.platform === "win32"
        ? `spawn("cmd.exe", ["/c", "start", "Reel Factory", "/min", process.execPath, "server.js", "--no-open"], { cwd: ${JSON.stringify(__dirname)}, detached: true, stdio: "ignore", windowsHide: true })`
        : `spawn(process.execPath, ["server.js", "--no-open"], { cwd: ${JSON.stringify(__dirname)}, detached: true, stdio: "ignore" })`;
      const starter = `const { spawn } = require("child_process"); setTimeout(() => ${run}.unref(), 1500)`;
      require("child_process").spawn(process.execPath, ["-e", starter], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      send(res, 200, { ok: true });
      setTimeout(() => process.exit(0), 300);
      return;
    }
    if (req.method === "POST" && parts[1] === "skills" && parts[2] === "pull") {
      const b = await body(req), id = S.get(b.id).id;
      if (PULLS[id]?.busy) return send(res, 409, { error: "Already pulling." });
      const st = PULLS[id] = { busy: true, log: [] };
      S.pull(id, l => { st.log = [...st.log, l].slice(-6); }).catch(e => st.log.push("✗ " + e.message)).finally(() => { st.busy = false; });
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && parts[1] === "projects" && !parts[2]) {
      const b = await body(req);
      let topic = (b.topic || "").trim(), notes = (b.notes || "").trim(), calendarId = null;
      if (!topic) {
        const t = P.nextFromCalendar(cfg);
        if (!t) return send(res, 400, { error: "No ready topic in the calendar. Type a topic." });
        topic = t.topic; notes = notes || t.notes || ""; calendarId = t.id;
        const calPath = path.join(__dirname, "data", "calendar.json"), cal = U.readJson(calPath);
        const it = cal.topics.find(x => x.id === t.id); it.status = "in progress"; U.writeJson(calPath, cal);
      }
      const p = P.createProject(cfg, { topic, notes, calendarId, audience: b.audience, visual: b.visual, skill: b.skill, look: b.look });
      P.enqueue(cfg, p.day, ["script"]);
      return send(res, 200, { day: p.day });
    }
    // ---- a Day's number, title and post date, shared by the Reels page and the Calendar (lib/calendar.js); works for hand-made Days too
    if (parts[1] === "days" && parts[2] != null) {
      const day = +parts[2], b = req.method === "GET" ? {} : await body(req);
      try {
        if (req.method === "POST" && parts[3] === "renumber") return send(res, 200, CAL.renumber(cfg, day, b.to));
        if (req.method === "PUT" && !parts[3]) return send(res, 200, { topic: CAL.setDay(cfg, day, { title: b.title, postedAt: b.postedAt }) });
        if (req.method === "DELETE" && !parts[3]) return send(res, 200, CAL.removeDay(cfg, day));
      } catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (parts[1] === "projects" && parts[2]) {
      const day = +parts[2], action = parts[3];
      let p = P.load(cfg, day);
      if (!p) return send(res, 404, { error: `Day ${day} was not made with the app` });
      if (req.method === "GET" && !action) return send(res, 200, projectView(day));
      if (req.method === "POST" && action === "stop") { P.stop(cfg, day); return send(res, 200, projectView(day)); }
      // ---- version gallery (its own background lane: allowed while a job runs)
      if (req.method === "POST" && action === "gallery") {
        if (!p.approved) return send(res, 400, { error: "Approve the script first." });
        const b = await body(req), list = (a, ok) => (Array.isArray(a) ? a : []).map(String).filter(ok);
        const looks = S.list().flatMap(k => k.looks.map(l => l.id));
        const only = { visuals: list(b.visuals, v => P.VISUALS.includes(v)), looks: list(b.looks, l => looks.includes(l)) };
        if (!only.visuals.length || !only.looks.length) return send(res, 400, { error: "Tick at least one visual style and one look." });
        G.start(cfg, day, { only, renderAll: !!b.renderAll }); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "gallery-stop") { G.stop(cfg, day); return send(res, 200, projectView(day)); }
      if (P.isBusy(day) && req.method !== "GET" && action !== "recording") return send(res, 409, { error: "A job is running for this day. Wait for it to finish, or press Stop." });
      if (req.method === "PUT" && action === "timeline") {
        const b = await body(req);
        U.writeJson(path.join(P.workDir(cfg, day), "timeline.json"), b.timeline);
        P.writeScriptTxt(cfg, p, b.timeline);
        p.edited = new Date().toISOString(); if (b.timeline.keyword) p.keyword = b.timeline.keyword;
        P.save(cfg, p); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "approve") {
        Object.assign(p, { approved: true, approvedAt: new Date().toISOString(), status: "approved" }); P.save(cfg, p);
        // after approval: image suggestions, then the voice and sync; the version gallery starts when sync is done
        const rec = ["raw-voice.wav", "raw-voice.mp3", "raw-voice.m4a", "raw-voice.aac", "raw-voice.webm"].some(f => fs.existsSync(path.join(P.workDir(cfg, day), f)));
        // suggestions only the first time: approving again (after a visual change) goes straight to voice and sync
        const suggested = fs.existsSync(path.join(P.workDir(cfg, day), "suggestions.json"));
        P.enqueue(cfg, day, [...(suggested ? [] : ["suggest"]), ...(p.voiceMode !== "recording" || rec ? ["voice", "sync"] : [])]);
        return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "use-version") {
        const b = await body(req); G.use(cfg, p, String(b.id || ""));
        P.enqueue(cfg, day, ["render", "checks", "copy"]); return send(res, 200, projectView(day));
      }
      // ---- image suggestions (Media tab)
      if (req.method === "POST" && action === "suggest-use") {
        const b = await body(req); await SG.useCandidate(cfg, p, String(b.id), b.k | 0); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "suggest-status") {
        const b = await body(req); SG.setStatus(cfg, p, String(b.id), b.status === "skipped" ? "skipped" : b.status === "used" ? "used" : "open", b.mediaId ? String(b.mediaId) : null);
        return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "suggest-gen") {
        const b = await body(req); p.genJob = { id: String(b.id), aspect: b.aspect }; P.save(cfg, p);
        P.enqueue(cfg, day, ["genimage"]); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "voice-mode") {
        const b = await body(req); p.voiceMode = b.mode === "recording" ? "recording" : "clone"; P.save(cfg, p); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "audience") {
        const b = await body(req); if (P.AUDIENCES.includes(b.audience)) p.audience = b.audience; P.save(cfg, p); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "visual-style") {
        const b = await body(req); if (P.VISUALS.includes(b.visual)) p.visual = b.visual; P.save(cfg, p); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "skill") {
        const b = await body(req); await P.setSkill(cfg, p, b.skill, b.look); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "broll") {
        const b = await body(req);
        if (!p.approved) return send(res, 400, { error: "Approve the script first: the B-roll is a paid Gemini call." });
        if (!["still", "animate"].includes(b.what)) return send(res, 400, { error: "still or animate" });
        p.brollJob = { index: b.index | 0, what: b.what }; P.save(cfg, p); P.enqueue(cfg, day, ["broll"]); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "studio") {
        const b = await body(req), k = S.get(b.skill);
        if (!p.approved) return send(res, 400, { error: "Approve the script first." });
        if (!k.studio) return send(res, 400, { error: `${k.name} has no Studio film.` });
        p.studioJob = { skill: k.id, style: k.id === "lemo" ? String(b.style || "").replace(/[^a-z0-9-]/g, "") || null : null }; P.save(cfg, p);
        P.enqueue(cfg, day, ["studio"]); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "use-final") {
        const b = await body(req), f = String(b.file || "");
        if (f && !(/^studio-[a-z0-9-]+\.mp4$/.test(f) && fs.existsSync(path.join(P.workDir(cfg, day), "build", f)))) return send(res, 400, { error: "No such film." });
        p.finalFile = f || null; P.save(cfg, p); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "paint-scene") {
        const b = await body(req); p.paintJob = { index: b.index | 0 }; P.save(cfg, p); P.enqueue(cfg, day, ["paint"]); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "visual-version") {
        const b = await body(req);
        await P.pickVisual(cfg, p, b.index, b.version); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "visual-scene") {
        const b = await body(req), n = (U.readJson(path.join(P.workDir(cfg, day), "timeline.json"))?.scenes || []).length;
        if (!(Number.isInteger(b.index) && b.index >= 0 && b.index < n)) return send(res, 400, { error: "Pick a scene." });
        p.visualJob = { index: b.index, instruction: String(b.instruction || "").slice(0, 300) }; P.save(cfg, p);
        P.enqueue(cfg, day, ["visual"]); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "rewrite-scene") {
        const b = await body(req), n = (U.readJson(path.join(P.workDir(cfg, day), "timeline.json"))?.scenes || []).length;
        if (!(Number.isInteger(b.index) && b.index >= 0 && b.index < n)) return send(res, 400, { error: "Pick a scene to rewrite." });
        p.sceneJob = { index: b.index, instruction: String(b.instruction || "").slice(0, 300) }; P.save(cfg, p);
        P.enqueue(cfg, day, ["scene"]); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "cut-voice") {
        const b = await body(req), from = +b.from, to = +b.to;
        if (!p.approved) return send(res, 400, { error: "Approve the script first." });
        if (!Number.isInteger(b.index) || !(from >= 0) || !(to > from)) return send(res, 400, { error: "Type 'from' and 'to' in seconds, with 'to' after 'from'." });
        p.cutJob = { index: b.index, from, to }; P.save(cfg, p);
        P.enqueue(cfg, day, ["cut", "sync"]); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "redo-voice") {
        const b = await body(req);
        if (!p.approved) return send(res, 400, { error: "Approve the script first." });
        if (!Number.isInteger(b.index) || b.index < 0) return send(res, 400, { error: "Pick a scene." });
        p.voiceRedo = [b.index]; P.save(cfg, p);
        P.enqueue(cfg, day, ["voice", "sync"]); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "run") {
        const b = await body(req);
        const steps = (b.steps || P.STEP_ORDER).filter(s => P.STEPS[s]);
        if (steps.some(s => !["script", "preview", "paint"].includes(s)) && !p.approved) return send(res, 400, { error: "Approve the script first." });
        P.enqueue(cfg, day, steps); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "recording") {
        const ext = (url.searchParams.get("ext") || "m4a").replace(/[^a-z0-9]/gi, "").toLowerCase();
        const w = P.workDir(cfg, day);
        for (const f of fs.readdirSync(w)) if (f.startsWith("raw-voice.")) fs.rmSync(path.join(w, f));
        await upload(req, path.join(w, `raw-voice.${ext}`));
        p = P.load(cfg, day); p.voiceMode = "recording"; P.save(cfg, p);
        return send(res, 200, projectView(day));
      }
      if (req.method === "PUT" && action === "copy") {
        const b = await body(req), w = P.workDir(cfg, day);
        U.writeJson(path.join(w, "copy.json"), b.copy);
        const r = P.copyChecks(cfg, b.copy, U.readJson(path.join(w, "timeline.json")).keyword);
        p.copyChecks = r.checks; P.writeCopyMd(cfg, p, b.copy, r); P.save(cfg, p);
        return send(res, 200, projectView(day));
      }
      // ---- my images (Media tab)
      if (req.method === "POST" && action === "media-video") {        // streamed to disk, then re-encoded (can take a minute)
        if (+(req.headers["content-length"] || 0) > M.MAX_VIDEO_BYTES) return send(res, 413, { error: "Video is over 500 MB." });
        const w = P.workDir(cfg, day), tmp = path.join(w, "media", `_upload-${Date.now()}`);
        await upload(req, tmp);
        await M.addVideo(w, tmp, { name: url.searchParams.get("name") || "", note: url.searchParams.get("note") || "" });
        return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "media") {
        if (+(req.headers["content-length"] || 0) > 15 * 1024 * 1024) return send(res, 413, { error: "Image is over 15 MB." });
        const chunks = []; for await (const c of req) chunks.push(c);
        M.add(P.workDir(cfg, day), Buffer.concat(chunks), { name: url.searchParams.get("name") || "", note: url.searchParams.get("note") || "" });
        return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "media-link") {
        const b = await body(req); await M.addFromLink(P.workDir(cfg, day), String(b.url || "").trim(), String(b.note || "")); return send(res, 200, projectView(day));
      }
      if (req.method === "PUT" && action === "media") {
        const b = await body(req); M.update(P.workDir(cfg, day), b.items || []); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "place-media") {
        if (!M.load(P.workDir(cfg, day)).items.length) return send(res, 400, { error: "Add an image first." });
        P.enqueue(cfg, day, ["place"]); return send(res, 200, projectView(day));
      }
      if (req.method === "POST" && action === "open-folder") {
        const dir = P.dayDir(cfg, day);
        if (process.platform === "win32") execFile("explorer.exe", [dir], { windowsHide: true });
        return send(res, 200, { ok: true, dir });
      }
    }
    if (req.method === "PUT" && parts[1] === "calendar") {
      const b = await body(req); CAL.save(cfg, b.calendar); return send(res, 200, { ok: true });
    }
    if (req.method === "PUT" && parts[1] === "settings") { saveConfig(await body(req)); return send(res, 200, { ok: true }); }
    if (req.method === "POST" && parts[1] === "reference") {
      const ext = (url.searchParams.get("ext") || "webm").replace(/[^a-z0-9]/gi, "").toLowerCase();
      const tmp = path.join(__dirname, "voice", `upload.${ext}`), dest = path.resolve(cfg.root, cfg.voice.reference);
      await upload(req, tmp);
      await U.run("ffmpeg", ["-y", "-v", "error", "-i", tmp, "-ac", "1", "-ar", "24000", "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse", dest]);
      fs.rmSync(tmp);
      const dur = U.ffprobeDuration(dest);
      return send(res, 200, { ok: true, seconds: dur, warning: dur < 6 ? "Shorter than 6 s: record about 10 s for a better clone." : dur > 20 ? "Longer than 20 s: about 10 s works best." : null });
    }
    send(res, 404, { error: "unknown api" });
  } catch (e) { console.error(e); send(res, 500, { error: e.message }); }
});

server.requestTimeout = 0;                   // big video uploads + re-encoding can take longer than Node's default 5 minutes
server.listen(cfg.port, "127.0.0.1", () => {
  console.log(`Reel Factory is running: http://localhost:${cfg.port}`);
  console.log(`Day folders: ${cfg.daysRoot}`);
  if (process.platform === "win32" && !process.argv.includes("--no-open")) execFile("cmd", ["/c", "start", "", `http://localhost:${cfg.port}`], { windowsHide: true });
});
