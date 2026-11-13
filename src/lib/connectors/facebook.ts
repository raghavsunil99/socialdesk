import "server-only";
import { db } from "../db";
import type { Account } from "../metrics";
import { graph, recomputeBestTimes } from "./instagram";

// Facebook Pages connector. external_id = Page id, access_token = Page access token.
// Meta has renamed/retired several Page Insights metrics over time, so every metric is fetched
// on its own and anything Meta rejects is skipped and reported instead of failing the sync.

type Insight = { name: string; values?: { value: number | Record<string, number>; end_time: string }[] };

export async function syncFacebook(acc: Account) {
  if (!acc.external_id || !acc.access_token) throw new Error("Facebook Page is missing its id or token");
  const token = acc.access_token, id = acc.external_id, d = db();
  const warnings: string[] = [];
  const tryGraph = async <T,>(label: string, path: string): Promise<T | null> => {
    try { return await graph<T>(path, token); } catch (e) { warnings.push(`${label}: ${(e as Error).message}`); return null; }
  };
  const today = new Date().toISOString().slice(0, 10);
  const put = d.prepare("INSERT OR REPLACE INTO metric_points (account_id, subject, metric, date, value) VALUES (?, 'account', ?, ?, ?)");

  const page = await graph<{ name: string; followers_count?: number; fan_count?: number; picture?: { data?: { url?: string } } }>(`/${id}?fields=name,followers_count,fan_count,picture.type(large)`, token);
  d.prepare("UPDATE accounts SET handle = ?, picture = ? WHERE id = ?").run(page.name, page.picture?.data?.url ?? null, acc.id);
  put.run(acc.id, "followers", today, page.followers_count ?? page.fan_count ?? 0);

  const until = Math.floor(Date.now() / 1000);
  const since = until - (acc.last_sync ? 3 : 30) * 86400;
  // our metric name -> candidate Page Insights metrics, newest name first
  const daily: Record<string, string[]> = {
    reach: ["page_impressions_unique"],
    views: ["page_media_view", "page_impressions"],
    followers_gained: ["page_daily_follows_unique", "page_fan_adds_unique"],
    followers_lost: ["page_daily_unfollows_unique", "page_fan_removes_unique"],
    profile_views: ["page_views_total"],
  };
  for (const [ours, candidates] of Object.entries(daily)) {
    for (const metric of candidates) {
      const r = await tryGraph<{ data: Insight[] }>(`${ours} (${metric})`, `/${id}/insights?metric=${metric}&period=day&since=${since}&until=${until}`);
      const values = r?.data[0]?.values;
      if (!values) continue;
      for (const v of values) put.run(acc.id, ours, v.end_time.slice(0, 10), typeof v.value === "number" ? v.value : Object.values(v.value).reduce((a, b) => a + b, 0));
      break;
    }
  }

  const posts = await tryGraph<{ data: { id: string; message?: string; created_time: string; permalink_url?: string; full_picture?: string; shares?: { count: number }; reactions?: { summary: { total_count: number } }; comments?: { summary: { total_count: number } }; attachments?: { data: { media_type?: string }[] } }[] }>(
    "posts",
    `/${id}/posts?fields=id,message,created_time,permalink_url,full_picture,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),attachments{media_type}&limit=50`
  );
  const upsert = d.prepare(
    `INSERT INTO content (account_id, external_id, kind, format, published_at, url, caption, image_url, likes, comments, shares, saved, reach, views)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(account_id, external_id) DO UPDATE SET likes=excluded.likes, comments=excluded.comments, shares=excluded.shares,
       reach=excluded.reach, views=excluded.views, caption=excluded.caption, image_url=excluded.image_url`
  );
  for (const p of posts?.data ?? []) {
    let reach = 0, views = 0;
    for (const metric of ["post_impressions_unique", "post_media_view", "post_impressions"]) {
      try {
        const r = await graph<{ data: Insight[] }>(`/${p.id}/insights?metric=${metric}`, token);
        const v = Number(r.data[0]?.values?.[0]?.value ?? 0);
        if (metric === "post_impressions_unique") reach = v; else if (!views) views = v;
      } catch { /* metric not available for this post or API version */ }
    }
    const mediaType = p.attachments?.data[0]?.media_type?.toUpperCase();
    const kind = mediaType === "VIDEO" ? "reel" : "post";
    upsert.run(acc.id, p.id, kind, mediaType ?? "STATUS", new Date(p.created_time).toISOString(), p.permalink_url ?? null, p.message ?? "", p.full_picture ?? null,
      p.reactions?.summary.total_count ?? 0, p.comments?.summary.total_count ?? 0, p.shares?.count ?? 0, reach, views);
  }

  recomputeBestTimes(acc.id);
  d.prepare("UPDATE accounts SET last_sync = datetime('now') WHERE id = ?").run(acc.id);
  if (warnings.length) console.warn(`[facebook sync] ${warnings.length} metric(s) skipped:\n  ` + warnings.slice(0, 10).join("\n  "));
  return { warnings };
}

/** Publish to the Page feed: a photo post when there's an image URL, otherwise a text post. Videos aren't supported yet. */
export async function publishFacebook(acc: Account, post: { text: string; media_url: string | null; media_type: string }) {
  if (!acc.external_id || !acc.access_token) throw new Error("Facebook Page is not connected");
  if (post.media_type === "REELS") {
    if (!post.media_url) throw new Error("Facebook Reels need a video");
    // Reels API: start an upload session, let Facebook pull the file from its URL, then publish.
    const start = await graph<{ video_id: string; upload_url: string }>(`/${acc.external_id}/video_reels`, acc.access_token, { method: "POST", body: { upload_phase: "start" } });
    const up = await fetch(start.upload_url, { method: "POST", headers: { authorization: `OAuth ${acc.access_token}`, file_url: post.media_url } });
    if (!up.ok) throw new Error(`Facebook Reel upload failed: ${(await up.text()).slice(0, 200)}`);
    await graph(`/${acc.external_id}/video_reels`, acc.access_token, { method: "POST", body: { upload_phase: "finish", video_id: start.video_id, video_state: "PUBLISHED", description: post.text } });
    return start.video_id;
  }
  const r = post.media_url
    ? await graph<{ id?: string; post_id?: string }>(`/${acc.external_id}/photos`, acc.access_token, { method: "POST", body: { url: post.media_url, caption: post.text } })
    : await graph<{ id?: string }>(`/${acc.external_id}/feed`, acc.access_token, { method: "POST", body: { message: post.text } });
  return (r as { post_id?: string }).post_id ?? r.id ?? "";
}
