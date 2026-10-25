// Ask Claude for text. Two providers:
//   "claude-code" (default): my Claude subscription through Claude Code in headless mode (`claude -p`), no extra cost.
//   "api": the Anthropic API with ANTHROPIC_API_KEY from .env (pay per use, works without Claude Code).
const { spawn } = require("child_process"), os = require("os");
const { loadEnv, track } = require("./util");

function viaClaudeCode(prompt, { cwd, timeoutMs = 300000, bin = "claude" } = {}) {
  return new Promise((resolve, reject) => {
    const instruction = "Follow the instructions in the input exactly. Do not use any tools. Reply with only what it asks for.";
    const win = process.platform === "win32";
    const args = ["-p", win ? `"${instruction}"` : instruction, "--output-format", "json"];
    const child = track(spawn(bin, args, { cwd, shell: win, windowsHide: true }));
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Claude Code took too long (timeout)")); }, timeoutMs);
    child.stdout.on("data", d => out += d);
    child.stderr.on("data", d => err += d);
    child.on("error", e => { clearTimeout(timer); reject(new Error(`Could not start Claude Code ("${bin}"): ${e.message}. Is it installed and signed in?`)); });
    child.on("close", code => {
      clearTimeout(timer);
      try {
        const j = JSON.parse(out);
        if (j.is_error) return reject(new Error("Claude Code error: " + (j.result || j.error || "unknown")));
        resolve(String(j.result ?? ""));
      } catch {
        if (code === 0 && out.trim()) return resolve(out);
        reject(new Error(`Claude Code exited with code ${code}: ${(err || out).slice(0, 600)}`));
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function viaApi(prompt, { model = "claude-sonnet-5-5", maxTokens = 8000 } = {}) {
  const key = loadEnv().ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is missing in .env (needed for the API provider)");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Anthropic API ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return j.content.filter(c => c.type === "text").map(c => c.text).join("");
}

async function ask(prompt, cfg) {
  if (process.env.REEL_FAKE_LLM) return require(process.env.REEL_FAKE_LLM)(prompt);   // tests only
  return cfg.llm.provider === "api"
    ? viaApi(prompt, { model: cfg.llm.apiModel })
    : viaClaudeCode(prompt, { cwd: os.tmpdir(), bin: cfg.llm.claudeBin || "claude" });   // neutral folder: no project settings or tools
}

function parseJson(text) {
  const t = String(text).replace(/```(?:json)?/g, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("No JSON found in Claude's reply: " + t.slice(0, 300));
  return JSON.parse(t.slice(a, b + 1));
}

async function askJson(prompt, cfg, retries = 1) {
  let last;
  for (let i = 0; i <= retries; i++) {
    const text = await ask(i ? prompt + "\n\nYour previous reply was not valid JSON. Reply with only the JSON object." : prompt, cfg);
    try { return parseJson(text); } catch (e) { last = e; }
  }
  throw last;
}

module.exports = { ask, askJson, parseJson };
