// Cloud poster (Phase 4): runs in GitHub Actions (hourly cron in .github/workflows/poster.yml),
// never on the laptop. Reads due rows from Supabase post_queue (status=ready, scheduled_for<=now),
// posts each to Instagram (Reels container -> poll FINISHED -> publish) and YouTube (resumable
// upload as a Short, channel-guarded), then marks the row posted/failed. Idempotent: a row is
// claimed as "posting" first and only "ready" rows are ever picked, so reruns can't double-post.
// Env (GitHub secrets): SUPABASE_URL, SUPABASE_KEY, PERSONAL_IG_TOKEN, IG_USER_ID,
//   YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN, YT_CHANNEL_ID (optional guard),
//   POSTER_DRY_RUN=1 to list due rows without posting.
const E = process.env;
const need = ["SUPABASE_URL", "SUPABASE_KEY", "PERSONAL_IG_TOKEN", "IG_USER_ID"]
  .filter(k => !E[k]);
const tags = a => (a || []).map(t => t.startsWith("#") ? t : "#" + t).join(" ");

async function sb(pathq, init = {}) {
  const r = await fetch(`${E.SUPABASE_URL}/rest/v1/${pathq}`, { ...init, headers: { apikey: E.SUPABASE_KEY, authorization: `Bearer ${E.SUPABASE_KEY}`, "content-type": "application/json", ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}
const patch = (day, body) => sb(`post_queue?day=eq.${day}`, { method: "PATCH", body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }) });

async function graph(host, token, ep, params = {}, method = "GET") {
  const u = new URL(`https://${host}/v21.0/${ep}`);
  const init = { method, headers: { "content-type": "application/json" } };
  if (method === "GET") Object.entries({ access_token: token, ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  else { u.searchParams.set("access_token", token); init.body = JSON.stringify(params); }
  const r = await fetch(u, init), j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Meta ${r.status}: ${JSON.stringify(j.error || j).slice(0, 300)}`);
  return j;
}
async function postInstagram(row) {
  const host = "graph.facebook.com", token = E.PERSONAL_IG_TOKEN, ig = E.IG_USER_ID;
  const created = await graph(host, token, `${ig}/media`, { media_type: "REELS", video_url: row.video_url, caption: row.caption || row.title, share_to_feed: "true" }, "POST");
  if (!created.id) throw new Error("Instagram gave no container");
  for (let i = 0; i < 40; i++) {
    await new Promise(ok => setTimeout(ok, 15000));
    const st = await graph(host, token, String(created.id), { fields: "status_code" });
    if (st.status_code === "FINISHED") break;
    if (st.status_code === "ERROR") throw new Error("Instagram could not process the video");
  }
  const done = await graph(host, token, `${ig}/media_publish`, { creation_id: String(created.id) }, "POST");
  const media = await graph(host, token, String(done.id), { fields: "permalink" }).catch(() => ({}));
  return { ig_id: String(done.id), ig_permalink: media.permalink || null };
}

async function ytToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: E.YT_CLIENT_ID, client_secret: E.YT_CLIENT_SECRET, refresh_token: E.YT_REFRESH_TOKEN, grant_type: "refresh_token" }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`YouTube token refresh failed (${r.status})`);
  return j.access_token;
}
async function postYouTube(row) {
  if (!E.YT_CLIENT_ID || !E.YT_CLIENT_SECRET || !E.YT_REFRESH_TOKEN) return null;   // IG-only mode
  const token = await ytToken();
  if (E.YT_CHANNEL_ID) {
    const r = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", { headers: { authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));
    const ids = (j.items || []).map(i => i.id);
    if (!ids.includes(E.YT_CHANNEL_ID)) throw new Error(`YouTube token channel mismatch (${ids.join(",") || "none"})`);
  }
  const video = Buffer.from(await (await fetch(row.video_url)).arrayBuffer());
  const title = `${row.title} #Shorts`.slice(0, 100);
  const meta = { snippet: { title, description: `${row.caption || ""}\n\n#Shorts`.slice(0, 5000), categoryId: "27" },
    status: { privacyStatus: "public", selfDeclaredMadeForKids: false, containsSyntheticMedia: true } };
  const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-upload-content-length": String(video.length), "x-upload-content-type": "video/mp4" }, body: JSON.stringify(meta) });
  const loc = start.headers.get("location");
  if (!loc) throw new Error(`YouTube upload start failed (${start.status})`);
  const done = await fetch(loc, { method: "PUT", headers: { "content-type": "video/mp4", "content-length": String(video.length) }, body: video });
  const j = await done.json().catch(() => ({}));
  if (!done.ok || !j.id) throw new Error(`YouTube upload failed (${done.status})`);
  return { yt_id: j.id, yt_url: `https://www.youtube.com/watch?v=${j.id}` };
}

(async () => {
  if (need.length) { console.log(`poster skipped: missing env ${need.join(", ")}`); return; }
  const due = await sb(`post_queue?status=eq.ready&scheduled_for=lte.${new Date().toISOString()}&order=scheduled_for.asc`);
  console.log(`due: ${due.length} row(s)`);
  for (const row of due) {
    if (E.POSTER_DRY_RUN) { console.log(`[dry] Day ${row.day}: ${row.title} @ ${row.scheduled_for}`); continue; }
    const platforms = ["both", "insta", "youtube"].includes(row.platforms) ? row.platforms : "both";
    try {
      await patch(row.day, { status: "posting" });
      const out = {};
      if (platforms !== "youtube") Object.assign(out, await postInstagram(row));       // throws: nothing marked posted
      if (platforms !== "insta") {
        const yt = await postYouTube(row).catch(e => { console.log(`Day ${row.day} YouTube failed: ${e.message}`); return { yt_error: e.message }; });
        if (yt && !yt.yt_error) Object.assign(out, yt); else if (yt?.yt_error && platforms === "youtube") throw new Error(yt.yt_error);
        else if (yt?.yt_error) out.error = yt.yt_error;
      }
      await patch(row.day, { status: "posted", ...out });
      console.log(`Day ${row.day} posted (${platforms}): IG ${out.ig_permalink || out.ig_id || "-"} · YT ${out.yt_url || "-"}`);
    } catch (e) {
      await patch(row.day, { status: "failed", error: String(e.message).slice(0, 400) }).catch(() => {});
      console.log(`Day ${row.day} FAILED: ${e.message}`);
    }
  }
})().catch(e => { console.error("poster error:", e.message); process.exit(1); });
