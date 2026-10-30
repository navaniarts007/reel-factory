// Ask Claude for text. Providers:
//   "claude-code" (default): my Claude subscription through Claude Code in headless mode (`claude -p`), no extra cost.
//   "api": the Anthropic API with ANTHROPIC_API_KEY from .env (pay per use, works without Claude Code).
//   "openai-compatible": any OpenAI-compatible chat-completions endpoint (Muse Spark / Musepark / OpenRouter / local).
//     config llm: { provider, baseURL, apiKeyEnv, model }. Key is read from .env via apiKeyEnv (default LLM_API_KEY).
//   "meta-responses" (alias "muse-api"): Meta Responses API, e.g. baseURL https://api.meta.ai/v1, POST /responses.
//     Body: { model, input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }], stream: false }.
//     config llm: { provider: "meta-responses", baseURL, apiKeyEnv, model }. Key from .env via apiKeyEnv
//     (default MODEL_API_KEY, falls back to LLM_API_KEY / META_API_KEY). NOTE: "muse" (no suffix) is the local CLI.
//   "opencode": headless `opencode run` (uses opencode auth, -m provider/model from llm.model).
//   "muse": headless `muse exec` (Meta provider, --model from llm.model).
// Fallback: config llm.fallback (same fields, any provider above) is used only when the primary call fails, e.g.
//   primary "claude-code" + fallback { provider: "meta-responses", model: "muse-wonder-1.0", ... } = Claude first, Muse
//   only when Claude hits its limit, isn't signed in or times out.
const { spawn } = require("child_process"), os = require("os");
const { loadEnv, track, stoppedSince } = require("./util");

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

async function viaOpenAICompatible(prompt, { baseURL, apiKey, model = "muse-spark", maxTokens = 8000 } = {}) {
  if (!baseURL) throw new Error("llm.baseURL is missing in config.json (needed for the openai-compatible provider)");
  if (!apiKey) throw new Error("API key is missing in .env (see llm.apiKeyEnv, default LLM_API_KEY)");
  const url = String(baseURL).replace(/\/$/, "") + "/chat/completions";
  const r = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`LLM API ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  const text = j.choices?.[0]?.message?.content ?? j.choices?.[0]?.text ?? "";
  if (!text) throw new Error("LLM reply was empty: " + JSON.stringify(j).slice(0, 400));
  return String(text);
}

function extractResponsesText(j) {
  if (typeof j.output_text === "string" && j.output_text.trim()) return j.output_text;
  const out = Array.isArray(j.output) ? j.output : [];
  const parts = [];
  for (const item of out) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (typeof c.text === "string" && c.text) parts.push(c.text);
      else if (typeof c.output_text === "string" && c.output_text) parts.push(c.output_text);
    }
    if (typeof item?.text === "string" && item.text) parts.push(item.text);
  }
  if (parts.length) return parts.join("");
  const ch = j.choices?.[0];
  const t = ch?.message?.content ?? ch?.text ?? "";
  return String(t || "");
}

async function viaMetaResponses(prompt, { baseURL, apiKey, model = "muse-wonder-1.0" } = {}) {
  if (!baseURL) throw new Error("llm.baseURL is missing in config.json (needed for the meta-responses provider, e.g. https://api.meta.ai/v1)");
  if (!apiKey) throw new Error("API key is missing in .env (see llm.apiKeyEnv, default MODEL_API_KEY)");
  const url = String(baseURL).replace(/\/$/, "") + "/responses";
  const r = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model, input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }], stream: false }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Meta Responses API ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  const text = extractResponsesText(j);
  if (!text.trim()) throw new Error("Meta reply was empty: " + JSON.stringify(j).slice(0, 400));
  return text;
}

function viaHeadlessCli(prompt, { bin, args = [], cwd, timeoutMs = 300000, input = null } = {}) {
  return new Promise((resolve, reject) => {
    const win = process.platform === "win32";
    const child = track(spawn(bin, args, { cwd, shell: win, windowsHide: true }));
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${bin} took too long (timeout)`)); }, timeoutMs);
    child.stdout.on("data", d => out += d);
    child.stderr.on("data", d => err += d);
    child.on("error", e => { clearTimeout(timer); reject(new Error(`Could not start ${bin}: ${e.message}. Is it installed and signed in?`)); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) return resolve(out.trim());
      reject(new Error(`${bin} exited with code ${code}: ${(err || out).slice(0, 600)}`));
    });
    if (input) { child.stdin.write(input); }
    child.stdin.end();
  });
}

// Primary first, fallback only when the primary fails (config llm.fallback: { provider, model, baseURL, apiKeyEnv }).
// After a usage-limit error the primary is skipped for a while, so each call doesn't wait for the same refusal.
const LIMIT_RE = /limit|usage|quota|rate.?limit|overloaded|credit balance|\b(429|529)\b/i;
const COOLDOWN_MS = 30 * 60 * 1000;
const STATE = { primaryDownUntil: 0, reason: "", fallbacks: 0, last: null };
const nameOf = l => l?.provider || "claude-code";

async function ask(prompt, cfg) {
  if (process.env.REEL_FAKE_LLM) return require(process.env.REEL_FAKE_LLM)(prompt);   // tests only
  const llm = cfg.llm || {}, fb = llm.fallback?.provider ? llm.fallback : null;
  const useFallback = async why => {
    try {
      const text = await call(prompt, fb);
      STATE.fallbacks++; STATE.last = { provider: nameOf(fb), at: Date.now(), reason: why };
      return text;
    } catch (e2) { throw new Error(`${why}. The fallback (${nameOf(fb)}) failed too: ${e2.message}`); }
  };
  if (fb && Date.now() < STATE.primaryDownUntil) return useFallback(`${nameOf(llm)} is resting after: ${STATE.reason}`);
  const t0 = Date.now();
  try {
    const text = await call(prompt, llm);
    STATE.last = { provider: nameOf(llm), at: Date.now() };
    return text;
  } catch (e) {
    if (!fb || stoppedSince(t0)) throw e;                    // pressed Stop: don't hand the work to the fallback
    if (LIMIT_RE.test(e.message)) { STATE.primaryDownUntil = Date.now() + COOLDOWN_MS; STATE.reason = e.message.slice(0, 200); }
    console.warn(`[llm] ${nameOf(llm)} failed (${e.message.slice(0, 160)}), using the fallback ${nameOf(fb)}`);
    return useFallback(`${nameOf(llm)} failed: ${e.message.slice(0, 200)}`);
  }
}
function status() {
  return { ...STATE, primaryResting: Date.now() < STATE.primaryDownUntil };
}

async function call(prompt, llm) {
  if (llm.provider === "api") return viaApi(prompt, { model: llm.apiModel });
  if (llm.provider === "openai-compatible" || llm.provider === "custom") {
    const env = loadEnv();
    return viaOpenAICompatible(prompt, {
      baseURL: llm.baseURL || env.LLM_BASE_URL,
      apiKey: env[llm.apiKeyEnv || "LLM_API_KEY"],
      model: llm.model || "muse-spark",
    });
  }
  if (llm.provider === "meta-responses" || llm.provider === "muse-api") {
    const env = loadEnv();
    return viaMetaResponses(prompt, {
      baseURL: llm.baseURL || env.LLM_BASE_URL || "https://api.meta.ai/v1",
      apiKey: env[llm.apiKeyEnv || "MODEL_API_KEY"] || env.LLM_API_KEY || env.META_API_KEY,
      model: llm.model || "muse-wonder-1.0",
    });
  }
  if (llm.provider === "opencode") {
    // llm.model like "anthropic/claude-sonnet-4-5" or your Musepark provider/model; see `opencode models`
    const args = ["run", ...(llm.model ? ["-m", llm.model] : []), prompt];
    return viaHeadlessCli(prompt, { bin: llm.bin || "opencode", args, cwd: os.tmpdir() });
  }
  if (llm.provider === "muse") {
    // `muse exec` reads the prompt from argv; --model from llm.model
    const args = ["exec", ...(llm.model ? ["--model", llm.model] : []), prompt];
    return viaHeadlessCli(prompt, { bin: llm.bin || "muse", args, cwd: os.tmpdir() });
  }
  return viaClaudeCode(prompt, { cwd: os.tmpdir(), bin: llm.claudeBin || "claude" });   // neutral folder: no project settings or tools
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

module.exports = { ask, askJson, parseJson, status };
