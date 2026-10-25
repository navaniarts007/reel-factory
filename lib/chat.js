// The master chat (💬 in the app): Claude Code WITH tools in the reel-factory folder, guided by docs/CHATBOT.md, acting
// on the app mostly through its own API. One conversation at a time, resumed with --resume; .env is denied to it.
// State: data/chat/state.json { session, messages: [{ n, role: user|bot|tool|err, text, at }], codeEdited }.
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const U = require("./util");

const FILE = path.join(U.ROOT, "data", "chat", "state.json");
const fresh = () => ({ session: null, messages: [], codeEdited: false, n: 0 });
let ST = U.readJson(FILE, null) || fresh(), child = null;
const save = () => U.writeJson(FILE, ST);
function add(role, text) { ST.messages.push({ n: ++ST.n, role, text: String(text), at: new Date().toISOString() }); ST.messages = ST.messages.slice(-400); save(); }
const CODE = /(^|[\\/])(server\.js|render\.js|cli\.js|lib[\\/]|web[\\/]|kit[\\/]|py[\\/])/;

const view = since => ({ running: !!child, codeEdited: ST.codeEdited, messages: ST.messages.filter(m => m.n > (since || 0)), last: ST.n });

function send(cfg, text, ctx = {}) {
  if (child) throw new Error("I'm still answering the last message (press Stop to end it).");
  text = String(text || "").trim(); if (!text) throw new Error("Type a message.");
  add("user", text);
  const head = `[App context: the user is looking at ${ctx.page === "calendar" ? "the Calendar page" : ctx.day ? `Day ${ctx.day}, ${ctx.tab || "script"} tab` : "the Reels page (no day open)"}. Today is ${new Date().toDateString()}.]`;
  const win = process.platform === "win32", q = s => win ? `"${s}"` : s;
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits",
    "--allowedTools", q("Bash Read Write Edit Glob Grep WebFetch WebSearch TodoWrite"),
    "--disallowedTools", q("Read(./.env)"), q("Edit(./.env)"), q("Write(./.env)"), q("Bash(cat .env:*)"), q("Bash(type .env:*)"), q("Bash(more .env:*)"), q("Bash(Get-Content .env:*)"),
    "--append-system-prompt", q("You are the Reel Factory assistant inside the app. Read docs/CHATBOT.md before acting and follow it. Never read or print .env."),
    ...(ST.session ? ["--resume", ST.session] : [])];
  const bin = cfg.llm.claudeBin || "claude";
  U.inGroup("chat", () => {
    child = U.track(spawn(win && /\s/.test(bin) ? `"${bin}"` : bin, args, { cwd: U.ROOT, shell: win, windowsHide: true }));
  });
  let buf = "", said = false;
  child.stdout.on("data", d => {
    buf += d; const lines = buf.split("\n"); buf = lines.pop();
    for (const l of lines) {
      let j; try { j = JSON.parse(l); } catch { continue; }
      if (j.session_id) ST.session = j.session_id;
      if (j.type === "assistant") for (const c of j.message?.content || []) {
        if (c.type === "text" && c.text.trim()) { add("bot", c.text.trim()); said = true; }
        if (c.type === "tool_use") {
          const i = c.input || {}, f = i.file_path || i.path || "";
          if (["Edit", "Write", "MultiEdit"].includes(c.name) && CODE.test(path.relative(U.ROOT, path.resolve(U.ROOT, f)))) ST.codeEdited = true;
          add("tool", `${c.name}${i.command ? ": " + String(i.command).slice(0, 140) : f ? ": " + path.relative(U.ROOT, path.resolve(U.ROOT, f)) : i.pattern ? ": " + i.pattern : i.url ? ": " + i.url : ""}`);
        }
      }
      if (j.type === "result" && j.is_error) add("err", j.result || "Claude Code stopped with an error.");
    }
  });
  let err = "";
  child.stderr.on("data", d => { err = (err + d).slice(-2000); });
  child.on("error", e => { add("err", `Could not start Claude Code: ${e.message}`); child = null; });
  child.on("close", code => {
    if (code && !said) add("err", stopped ? "■ stopped." : `Claude Code exited (${code}): ${err.trim().slice(-400) || "no output"}`);
    child = null; stopped = false; save();
  });
  child.stdin.write(`${head}\n\n${text}`); child.stdin.end();
}
let stopped = false;
function stop() { if (child) { stopped = true; U.killAll("chat"); } }
function reset() { stop(); ST = fresh(); save(); }
function codeRestarted() { ST.codeEdited = false; save(); }

module.exports = { send, stop, reset, view, codeRestarted, running: () => !!child };
