// Cloud queue (Phase 3): after export, upload the MP4 to Supabase Storage and upsert the
// post_queue row the poster worker reads. Config: cloud { supabaseUrl, bucket, keyEnv } with
// SUPABASE_URL / SUPABASE_KEY (service-role) in .env. Without them this only logs a skip line:
// local export always works, cloud posting just isn't armed yet. Never throws.
const fs = require("fs"), path = require("path");
const { loadEnv, readJson } = require("./util");

async function req(url, key, init = {}) {
  const r = await fetch(url, { ...init, headers: { apikey: key, authorization: `Bearer ${key}`, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r;
}

async function push(cfg, p) {
  const env = loadEnv(), cloud = cfg.cloud || {};
  const base = cloud.supabaseUrl || env.SUPABASE_URL, key = env[cloud.keyEnv || "SUPABASE_KEY"], bucket = cloud.bucket || "reel-factory";
  if (!base || !key) return "cloud queue skipped (SUPABASE_URL / SUPABASE_KEY missing in .env)";
  const file = `${p.exportedAs}.mp4`, local = path.join(require("./pipeline").dayDir(cfg, p.day), file);
  if (!fs.existsSync(local)) return `cloud queue skipped (${file} missing)`;
  try {
    await req(`${base}/storage/v1/object/${bucket}/${file}`, key, { method: "POST", headers: { "content-type": "video/mp4", "x-upsert": "true" }, body: fs.readFileSync(local) });
    const videoUrl = `${base}/storage/v1/object/public/${bucket}/${file}`;
    const c = readJson(path.join(require("./pipeline").workDir(cfg, p.day), "copy.json"), {});
    const tags = a => (a || []).map(t => t.startsWith("#") ? t : "#" + t).join(" ");
    const caption = `${c.instagram?.caption || p.title || p.topic}\n\n${tags(c.instagram?.hashtags)}`.trim();
    const row = { day: p.day, title: p.title || p.topic, caption, video_file: file, video_url: videoUrl,
      scheduled_for: p.scheduledFor || new Date(Date.now() + 86400000).toISOString(), status: "ready", updated_at: new Date().toISOString() };
    await req(`${base}/rest/v1/post_queue?on_conflict=day`, key, { method: "POST", headers: { "content-type": "application/json", prefer: "resolution=merge-duplicates" }, body: JSON.stringify(row) });
    return `cloud queue: Day ${p.day} uploaded, scheduled ${row.scheduled_for}`;
  } catch (e) {
    return `cloud queue failed (${String(e.message).slice(0, 160)}) — local export is fine, poster will miss this Day until re-export`;
  }
}

module.exports = { push };
