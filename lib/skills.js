// Skills: the video "worlds" a reel can be made in (skills/<id>/skill.json + guide.md, our own files).
// Each skill has looks (kit/themes.js), a camera ("cut" or "onetake") and maybe extra scene types (clawd, broll).
// The original GitHub skills are pulled into vendor/skills/<id>/ (not committed) for Studio films and for Clawd's painter.
const fs = require("fs"), path = require("path");
const U = require("./util");

const DIR = path.join(U.ROOT, "skills");
const ORDER = ["whiteboard", "hyperframes", "onetake", "collage", "clawd", "lemo"];
const THEMES = require("../kit/themes.js");

function list() {
  return ORDER.map(id => U.readJson(path.join(DIR, id, "skill.json"))).filter(Boolean)
    .map(s => ({ ...s, looks: s.looks.map(l => ({ id: l, name: (THEMES[l] || {}).name || l })) }));
}
const get = id => list().find(s => s.id === id) || list()[0];
const lookOf = (id, look) => { const s = get(id); return s.looks.some(l => l.id === look) ? look : s.looks[0].id; };

// The skill's guide for the script writer: the general part plus the "### <look>" section for this look only.
function guide(id, look) {
  const md = fs.existsSync(path.join(DIR, id, "guide.md")) ? fs.readFileSync(path.join(DIR, id, "guide.md"), "utf8") : "";
  const [head, ...parts] = md.split(/^### /m);
  const mine = parts.find(p => p.split("\n")[0].trim() === look);
  return (head.trim() + (mine ? `\nLook "${look}": ` + mine.split("\n").slice(1).join("\n").trim() : "")).trim();
}

// ---------------------------------------------------------------- pulled repos
const vendorDir = id => path.join(U.ROOT, "vendor", "skills", id);
const GIT = new Map();                 // dir → { at, info }: the page asks on every refresh, git is asked at most once a minute
function gitInfo(dir, fresh) {
  const hit = GIT.get(dir);
  if (hit && !fresh && Date.now() - hit.at < 60000) return hit.info;
  let info = null;
  try {
    const out = require("child_process").execFileSync("git", ["-C", dir, "log", "-1", "--format=%h|%cs"], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).toString().trim();
    const [commit, date] = out.split("|"); info = { commit, date };
  } catch {}
  GIT.set(dir, { at: Date.now(), info });
  return info;
}
function status() {
  const env = { ...U.loadEnv(), ...process.env };              // only checks that a key is set; never returns its value
  return list().map(s => {
    const dir = vendorDir(s.id), pulled = !!s.repo && fs.existsSync(path.join(dir, ".git"));
    return { id: s.id, pulled, ...(pulled ? gitInfo(dir) : {}), needs: Object.fromEntries((s.needs || []).map(k => [k, !!env[k]])) };
  });
}
// Clone (or update) one skill's repo. Long paths on: HyperFrames has files deeper than Windows' 260-character limit.
async function pull(id, log = () => {}) {
  const s = get(id);
  if (!s.repo) return log(`${s.name} is built in: nothing to pull`);
  const dir = vendorDir(id), git = ["-c", "core.longpaths=true"];
  if (fs.existsSync(path.join(dir, ".git"))) {
    log(`updating ${s.name}…`);
    await U.run("git", [...git, "-C", dir, "pull", "--ff-only", "--depth", "1"], { log });
  } else {
    log(`pulling ${s.name} from ${s.repo}…`);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    await U.run("git", [...git, "clone", "--depth", "1", s.repo + ".git", dir], { log });
    await U.run("git", ["-C", dir, "config", "core.longpaths", "true"]);
  }
  const i = gitInfo(dir, true);
  log(`✓ ${s.name} at ${i ? `${i.commit} (${i.date})` : "?"}`);
}

// Lemo's style list (for Studio films), read from its styles/README.md table.
function lemoStyles() {
  const f = path.join(vendorDir("lemo"), "styles", "README.md");
  if (!fs.existsSync(f)) return [];
  return [...fs.readFileSync(f, "utf8").matchAll(/^\| ([^|]+?) \| [^|]+ \| \[`([a-z0-9-]+)`\]/gm)].map(m => ({ id: m[2], name: m[1].trim() }));
}

// Extra scene types a skill adds to the script writer's library (skills/<id>/library.md), and their rules.
const library = id => { const f = path.join(DIR, id, "library.md"); return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim() : ""; };
const CLAWD = {
  actions: ["wave", "think", "idea", "walk", "work", "celebrate", "shrug", "sleep", "dance", "scared", "sad", "proud"],
  emotions: ["happy", "excited", "laugh", "love", "proud", "starstruck", "playful", "hopeful", "relieved", "smug", "cool", "mischief", "suspicious",
    "sad", "cry", "bored", "sleepy", "ko", "angry", "furious", "determined", "disgusted", "scared", "nervous", "surprised", "confused", "dizzy",
    "neutral", "thinking", "idea", "shy"],
  props: ["laptop", "box", "bug", "coffee", "book", "rocket", "star"], hats: ["party", "hard", "crown", "wizard", "headphones", "beanie"],
  settings: ["desk", "night", "meadow", "paper"],
};
const BROLL_COLORS = ["orange", "mustard", "green", "purple", "teal"];
// Problems with a clawd/broll scene (fixable ones are fixed in place: unknown optional values are dropped).
function sceneProblems(s, label) {
  if (s.type === "clawd") {
    const p = [];
    if (!CLAWD.actions.includes(s.action)) p.push(`${label}: "action" must be one of ${CLAWD.actions.join("|")}`);
    for (const k of ["from", "to"]) if (!CLAWD.emotions.includes(s[k])) p.push(`${label}: "${k}" must be one of the Clawd emotions`);
    if (s.prop && !CLAWD.props.includes(s.prop)) delete s.prop;
    if (s.hat && !CLAWD.hats.includes(s.hat)) delete s.hat;
    if (!CLAWD.settings.includes(s.setting)) s.setting = "paper";
    return p;
  }
  if (s.type === "broll") {
    const p = [];
    if (typeof s.metaphor !== "string" || s.metaphor.length < 10) p.push(`${label}: "metaphor" must describe the picture in one sentence`);
    if (!Array.isArray(s.objects) || s.objects.length < 2) p.push(`${label}: "objects" must list 3–6 physical things`);
    if (!BROLL_COLORS.includes(s.color)) s.color = "orange";
    return p;
  }
  return [];
}
module.exports = { list, get, lookOf, guide, library, sceneProblems, status, pull, vendorDir, lemoStyles, CLAWD, BROLL_COLORS, ORDER };
