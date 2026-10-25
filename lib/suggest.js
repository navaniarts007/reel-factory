// Image suggestions for the Media tab, after approval: Claude says which scenes want a real picture and where it comes from;
// Wikimedia Commons candidates (free licences, credited) are found for you; Gemini pictures only on a button press (paid).
// State: work/suggestions.json { at, items: [{ id, scene, what, kind, why, source, query, prompt, candidates, status, mediaId }] }.
const fs = require("fs"), path = require("path");
const U = require("./util"), LLM = require("./llm"), M = require("./media");

const P = () => require("./pipeline");
const file = w => path.join(w, "suggestions.json");
const load = w => U.readJson(file(w), { items: [] });
const save = (w, s) => U.writeJson(file(w), s);
const KINDS = ["screenshot", "logo", "photo", "diagram"];
const FREE = /^(cc0|public domain|pd|cc by(-sa)?( \d\.\d)?|cc-by(-sa)?-\d\.\d|gpl|lgpl|apache|mit)/i;
const UA = "ReelFactory/1.0 (personal video tool; image search)";

// The rules the prompt states, enforced: screenshots are mine to take, logos are never generated.
function clean(sg, n) {
  const kind = KINDS.includes(sg.kind) ? sg.kind : "photo";
  let source = ["upload", "commons", "gemini"].includes(sg.source) ? sg.source : "upload";
  if (kind === "screenshot") source = "upload";
  if (kind === "logo" && source === "gemini") source = "commons";
  const scene = Math.round(+sg.scene);
  if (!(scene >= 1 && scene <= n) || !String(sg.what || "").trim()) return null;
  return { scene, what: String(sg.what).slice(0, 160), kind, why: String(sg.why || "").slice(0, 160), source,
    query: String(sg.commons_query || "").slice(0, 80) || (source === "commons" ? String(sg.what).slice(0, 60) : ""),
    prompt: String(sg.gemini_prompt || "").slice(0, 400) };
}

const getJson = async (base, params) => {
  const u = new URL(base); Object.entries({ format: "json", origin: "*", ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let i = 0; ; i++) {                            // Wikimedia asks to slow down with 429: wait and try again
    const r = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429 && i < 3) { await new Promise(ok => setTimeout(ok, 2000 * (i + 1))); continue; }
    if (!r.ok) throw new Error(`${u.hostname} answered ${r.status}`);
    return r.json();
  }
};
const INFO = { prop: "imageinfo", iiprop: "url|size|extmetadata|mime", iiurlwidth: 1280 };

// Official logos: Wikidata's "logo image" (P154) of the best-matching items, then that file on Commons.
async function logos(query, limit = 3) {
  const brand = query.replace(/\b(official|logo|icon|brand|mark)\b/gi, "").trim() || query;
  const found = await getJson("https://www.wikidata.org/w/api.php", { action: "wbsearchentities", search: brand, language: "en", limit: 6, type: "item" });
  const ids = (found.search || []).map(x => x.id);
  if (!ids.length) return [];
  const ents = (await getJson("https://www.wikidata.org/w/api.php", { action: "wbgetentities", ids: ids.join("|"), props: "claims" })).entities || {};
  const files = ids.map(id => ents[id]?.claims?.P154?.[0]?.mainsnak?.datavalue?.value).filter(Boolean);
  if (!files.length) return [];
  return fromPages((await getJson("https://commons.wikimedia.org/w/api.php", { action: "query", titles: files.map(f => "File:" + f).join("|"), ...INFO })).query?.pages, limit, files);
}

// Wikimedia Commons: images only, free licences only, a 1280-wide thumbnail (also for SVG logos).
async function commons(query, limit = 4, kind = "") {
  if (kind === "logo") { try { const l = await logos(query, limit); if (l.length) return l; } catch {} }
  const j = await getJson("https://commons.wikimedia.org/w/api.php", { action: "query", generator: "search", gsrsearch: `${query} filetype:bitmap|drawing`, gsrnamespace: 6, gsrlimit: 12, ...INFO });
  const found = fromPages(j.query?.pages, 12);
  if (kind !== "logo") return found.slice(0, limit);
  const brand = query.replace(/(official|logo|icon|brand|mark)/gi, "").trim().toLowerCase();   // a logo search keeps only files named after the brand
  return found.filter(c => c.title.toLowerCase().includes(brand) && /logo/i.test(c.title)).slice(0, limit);
}
function fromPages(pagesIn, limit, order) {
  const pages = Object.values(pagesIn || {}).sort((a, b) => order ? order.indexOf(a.title.replace(/^File:/, "")) - order.indexOf(b.title.replace(/^File:/, "")) : a.index - b.index);
  const strip = s => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return pages.map(pg => {
    const ii = pg.imageinfo?.[0], md = ii?.extmetadata || {}, lic = strip(md.LicenseShortName?.value);
    if (!ii?.thumburl || !/image\/(png|jpeg|webp|svg)/.test(ii.mime) || !FREE.test(lic)) return null;
    return { title: pg.title.replace(/^File:/, ""), thumb: ii.thumburl, page: ii.descriptionurl, licence: lic,
      artist: strip(md.Artist?.value).slice(0, 80) || "unknown", w: ii.thumbwidth, h: ii.thumbheight };
  }).filter(Boolean).slice(0, limit);
}

// The step: Claude's suggestions + Commons candidates. Never fails the job (suggestions are optional).
async function stepSuggest(cfg, p) {
  const pl = P(), w = pl.workDir(cfg, p.day), tl = U.readJson(path.join(w, "timeline.json"));
  if (!tl) return;
  try {
    pl.log(cfg, p, "suggesting images for the Media tab…");
    const j = await LLM.askJson(pl.fill(pl.prompt(cfg, "suggest.md"), { TOPIC: p.topic, AUDIENCE: p.audience || "mixed", MEDIA: M.forPrompt(w),
      SCRIPT: tl.scenes.map((s, i) => { const { say, dur, _art, ...sc } = s; return `${i + 1}. (${sc.type}) says: "${say}"`; }).join("\n") }), cfg);
    const old = load(w), items = [];
    for (const sg of (j.suggestions || []).slice(0, 6)) {
      const c = clean(sg, tl.scenes.length); if (!c) continue;
      const it = { id: "s" + (items.length + 1) + "-" + Date.now().toString(36), ...c, status: "open", candidates: [] };
      if (c.source === "commons" || c.kind === "logo" || c.kind === "photo") {
        try { it.candidates = await commons(c.query || c.what, 4, c.kind); } catch (e) { it.searchError = e.message; }
        await new Promise(ok => setTimeout(ok, 1500));              // be gentle with Wikimedia (it rate-limits)
      }
      items.push(it);
    }
    save(w, { at: new Date().toISOString(), items: [...items, ...(old.items || []).filter(x => x.status === "used")] });
    pl.log(cfg, p, `✓ ${items.length} image suggestion(s) on the Media tab`);
  } catch (e) { pl.log(cfg, p, `! image suggestions failed (${e.message.slice(0, 160)}); the Media tab works as before`); }
}

// Accept a Commons candidate: downloaded into my media with its licence and author.
async function useCandidate(cfg, p, sid, k) {
  const w = P().workDir(cfg, p.day), s = load(w), it = s.items.find(x => x.id === sid), c = it?.candidates?.[k];
  if (!c) throw new Error("That suggestion isn't there any more.");
  const m = await M.addFromLink(w, c.thumb, it.what, { source: c.page, credit: `${c.licence}, ${c.artist}, Wikimedia Commons`, kind: it.kind === "logo" ? "logo" : it.kind === "diagram" ? "diagram" : "photo" });
  Object.assign(it, { status: "used", mediaId: m.id }); save(w, s);
  return m;
}

// Gemini picture for a suggestion (paid; the server only calls this on a button press). Never logos or screenshots.
async function stepGenImage(cfg, p) {
  const job = p.genJob; p.genJob = null;
  const pl = P(), w = pl.workDir(cfg, p.day), s = load(w), it = s.items.find(x => x.id === job?.id);
  if (!it) throw new Error("Pick a suggestion.");
  if (["logo", "screenshot"].includes(it.kind)) throw new Error("Logos and screenshots are never generated: upload the real one.");
  if (!U.loadEnv().GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing in .env.");
  const model = cfg.images?.model || "gemini-2.5-flash-image", out = path.join(w, "media", `_gen-${Date.now()}.png`);
  pl.log(cfg, p, `generating a picture with ${model} (paid): ${it.what}`);
  await U.run(cfg.python, [path.join(cfg.root, "py", "genimage.py"), out, it.prompt || it.what, "--model", model, "--aspect", job.aspect === "9:16" ? "9:16" : "16:9"],
    { log: l => pl.log(cfg, p, "  " + l), env: { GEMINI_API_KEY: U.loadEnv().GEMINI_API_KEY } });
  try {
    const m = M.add(w, fs.readFileSync(out), { name: "generated.png", note: it.what, source: `AI-generated (Gemini ${model})`, kind: it.kind === "diagram" ? "diagram" : "photo", ai: true });
    Object.assign(it, { status: "used", mediaId: m.id }); save(w, s);
    pl.log(cfg, p, `✓ added "${m.id}" to your media (marked AI-generated)`);
  } finally { fs.rmSync(out, { force: true }); }
}

function setStatus(cfg, p, sid, status, mediaId) {
  const w = P().workDir(cfg, p.day), s = load(w), it = s.items.find(x => x.id === sid);
  if (!it) throw new Error("That suggestion isn't there any more.");
  Object.assign(it, { status }, mediaId ? { mediaId } : {}); save(w, s);
}

module.exports = { load, stepSuggest, stepGenImage, useCandidate, setStatus, commons, clean };
