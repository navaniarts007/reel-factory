// Page alert emails (Settings → Pages): one entry per Facebook page,
//   pages: { default: "Prompt Kinetic", list: [{ name, alertEmail }] }.
// An alert goes out when a Day is exported and when a job finishes or fails.
// Sending needs RESEND_API_KEY in .env (Resend); RESEND_FROM sets the sender.
// Without a key nothing is sent — the alert is only written to the Day's log.
const { loadEnv } = require("./util");

const list = cfg => ((cfg.pages || {}).list || []);
const defaultPage = cfg => (cfg.pages || {}).default || (list(cfg)[0] || {}).name || "Prompt Kinetic";
const dayPage = (cfg, p) => p.page || defaultPage(cfg);
const emailFor = (cfg, page) => (list(cfg).find(x => x.name === page) || {}).alertEmail || "";

async function sendAlert(cfg, p, kind, detail) {
  // kind: "exported" | "done" | "failed". Never throws: email must not break the pipeline.
  const page = dayPage(cfg, p), to = emailFor(cfg, page);
  const subject = `[Reel Factory] Day ${p.day} ${kind} (${page})`;
  const text = `Day ${p.day} "${p.title || p.topic}" — ${kind}.\nPage: ${page}\n${detail || ""}`.trim();
  const env = loadEnv();
  if (!to) return `alert skipped (no email saved for page "${page}"): ${subject}`;
  if (!env.RESEND_API_KEY) return `alert skipped (no RESEND_API_KEY in .env): ${subject} → ${to}`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.RESEND_FROM || "Reel Factory <onboarding@resend.dev>", to, subject, text }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return `alert failed (${r.status}: ${JSON.stringify(j).slice(0, 200)}): ${subject} → ${to}`;
    return `alert sent to ${to}: ${subject}`;
  } catch (e) {
    return `alert failed (${String(e.message).slice(0, 120)}): ${subject} → ${to}`;
  }
}

module.exports = { list, defaultPage, dayPage, emailFor, sendAlert };
