import type { PublishPost } from "./types";
import "server-only";
import { db } from "../db";
import type { Account } from "../metrics";

// Instagram Graph API connector (Business/Creator account linked to a Facebook Page).
// Needs a long-lived token with instagram_basic, instagram_manage_insights,
// instagram_content_publish, pages_read_engagement. Set it in Settings → Connections.

const GRAPH = "https://graph.facebook.com/v27.0";

export async function graph<T = Record<string, unknown>>(path: string, token: string, init?: { method?: string; body?: Record<string, string> }): Promise<T> {
  const url = new URL(GRAPH + path);
  let body: URLSearchParams | undefined;
  if (init?.body) body = new URLSearchParams({ ...init.body, access_token: token });
  else url.searchParams.set("access_token", token);
  const res = await fetch(url, { method: init?.method ?? "GET", body });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok || json.error) throw new Error(`Instagram API: ${json.error?.message ?? res.statusText}`);
  return json;
}

type Insight = { name: string; values?: { value: number; end_time: string }[]; total_value?: { value: number; breakdowns?: { results: { dimension_values: string[]; value: number }[] }[] } };

/** Check an id + token pair before we switch the account to live. Returns the username. */
export async function verifyInstagram(id: string, token: string) {
  const p = await graph<{ username?: string }>(`/${encodeURIComponent(id)}?fields=username,profile_picture_url,followers_count`, token);
  if (!p.username) throw new Error("That id is not an Instagram Business/Creator account");
  return p.username;
}

/** Pull profile, last 30 days of account insights, recent media with insights, and audience demographics. */
export async function syncInstagram(acc: Account) {
  if (!acc.external_id || !acc.access_token) throw new Error("Instagram account is missing its user id or token");
  const token = acc.access_token;
  const id = acc.external_id;
  const d = db();
  const today = new Date().toISOString().slice(0, 10);
  const put = d.prepare("INSERT OR REPLACE INTO metric_points (account_id, subject, metric, date, value) VALUES (?, 'account', ?, ?, ?)");

  const profile = await graph<{ username: string; profile_picture_url?: string; followers_count: number; follows_count: number; media_count: number }>(
    `/${id}?fields=username,followers_count,follows_count,media_count`, token
  );
  d.prepare("UPDATE accounts SET handle = ?, picture = ? WHERE id = ?").run(profile.username, profile.profile_picture_url ?? null, acc.id);
  put.run(acc.id, "followers", today, profile.followers_count);
  put.run(acc.id, "following", today, profile.follows_count);
  put.run(acc.id, "postsCount", today, profile.media_count);

  // Each metric is fetched on its own so one unsupported/undocumented metric never fails the whole sync.
  const warnings: string[] = [];
  const tryGraph = async <T,>(label: string, path: string): Promise<T | null> => {
    try { return await graph<T>(path, token); } catch (e) { warnings.push(`${label}: ${(e as Error).message}`); return null; }
  };
  const until = Math.floor(Date.now() / 1000);
  const backDays = acc.last_sync ? 3 : 30; // backfill a month on the first sync, then just the last few days

  // reach: documented as time_series with period=day
  const reach = await tryGraph<{ data: Insight[] }>("reach", `/${id}/insights?metric=reach&period=day&metric_type=time_series&since=${until - backDays * 86400}&until=${until}`);
  for (const v of reach?.data[0]?.values ?? []) put.run(acc.id, "reach", v.end_time.slice(0, 10), v.value);

  // views, follows/unfollows: total_value only, so ask one day at a time
  for (let i = 1; i <= backDays; i++) {
    const s = until - i * 86400;
    const date = new Date(s * 1000).toISOString().slice(0, 10);
    const views = await tryGraph<{ data: Insight[] }>("views", `/${id}/insights?metric=views&period=day&metric_type=total_value&since=${s}&until=${s + 86400}`);
    if (views?.data[0]) put.run(acc.id, "views", date, views.data[0].total_value?.value ?? 0);
    const fu = await tryGraph<{ data: Insight[] }>("follows_and_unfollows", `/${id}/insights?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type&since=${s}&until=${s + 86400}`);
    for (const r of fu?.data[0]?.total_value?.breakdowns?.[0]?.results ?? []) {
      // follow_type: FOLLOWER = new follows, NON_FOLLOWER = unfollows (verify on first live sync)
      const t = r.dimension_values[0]?.toUpperCase();
      if (t === "FOLLOWER") put.run(acc.id, "followers_gained", date, r.value);
      else if (t === "NON_FOLLOWER") put.run(acc.id, "followers_lost", date, r.value);
    }
  }
  // Fallback when follows_and_unfollows is unavailable: derive net gain from consecutive daily follower snapshots.
  const prevSnap = d.prepare("SELECT value FROM metric_points WHERE account_id = ? AND metric = 'followers' AND date < ? ORDER BY date DESC LIMIT 1").get(acc.id, today) as { value: number } | undefined;
  const hasGained = d.prepare("SELECT 1 FROM metric_points WHERE account_id = ? AND metric = 'followers_gained' AND date = ?").get(acc.id, today);
  if (prevSnap && !hasGained) put.run(acc.id, "followers_gained", today, Math.max(0, profile.followers_count - prevSnap.value));

  const media = await graph<{ data: { id: string; caption?: string; media_type: string; media_product_type: string; permalink: string; timestamp: string; like_count?: number; comments_count?: number; thumbnail_url?: string; media_url?: string }[] }>(
    `/${id}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url&limit=50`, token
  );
  const upsert = d.prepare(
    `INSERT INTO content (account_id, external_id, kind, format, published_at, url, caption, image_url, likes, comments, shares, saved, reach, views)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, external_id) DO UPDATE SET likes=excluded.likes, comments=excluded.comments, shares=excluded.shares,
       saved=excluded.saved, reach=excluded.reach, views=excluded.views, caption=excluded.caption, image_url=excluded.image_url`
  );
  for (const m of media.data) {
    let reach = 0, views = 0, saved = 0, shares = 0;
    for (const metrics of ["reach,saved,shares", "views"]) {
      try {
        const ins = await graph<{ data: Insight[] }>(`/${m.id}/insights?metric=${metrics}`, token);
        for (const x of ins.data) {
          const v = x.values?.[0]?.value ?? x.total_value?.value ?? 0;
          if (x.name === "reach") reach = v; else if (x.name === "views") views = v; else if (x.name === "saved") saved = v; else if (x.name === "shares") shares = v;
        }
      } catch { /* e.g. media older than the account's business conversion has no insights */ }
    }
    const kind = m.media_product_type === "REELS" ? "reel" : "post";
    const format = m.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : m.media_type;
    upsert.run(acc.id, m.id, kind, format, new Date(m.timestamp).toISOString(), m.permalink, m.caption ?? "", m.thumbnail_url ?? m.media_url ?? null,
      m.like_count ?? 0, m.comments_count ?? 0, shares, saved, reach, views);
  }

  const putDist = d.prepare("INSERT OR REPLACE INTO distributions (account_id, metric, label, value) VALUES (?, ?, ?, ?)");
  for (const [metric, breakdown] of [["age", "age"], ["gender", "gender"], ["country", "country"], ["city", "city"]] as const) {
    try {
      let r: { data: Insight[] } | null = null;
      for (const timeframe of ["last_30_days", "this_month"]) {
        r = await tryGraph<{ data: Insight[] }>(`demographics ${breakdown}`, `/${id}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&timeframe=${timeframe}&breakdown=${breakdown}`);
        if (r?.data[0]) break;
      }
      if (!r?.data[0]) continue;
      const results = r.data[0]?.total_value?.breakdowns?.[0]?.results ?? [];
      const total = results.reduce((s, x) => s + x.value, 0) || 1;
      d.prepare("DELETE FROM distributions WHERE account_id = ? AND metric = ?").run(acc.id, metric);
      for (const x of results) putDist.run(acc.id, metric, x.dimension_values.join(" "), +((100 * x.value) / total).toFixed(2));
    } catch { /* demographics need >= 100 followers */ }
  }

  recomputeBestTimes(acc.id);
  d.prepare("UPDATE accounts SET last_sync = datetime('now') WHERE id = ?").run(acc.id);
  if (warnings.length) console.warn(`[instagram sync] ${warnings.length} metric(s) skipped:\n  ` + [...new Set(warnings)].slice(0, 10).join("\n  "));
  return { warnings: [...new Set(warnings)] };
}

/** Live best times: average interactions-per-reach of our own content by weekday/hour (IST), lightly smoothed. */
export function recomputeBestTimes(accountId: number) {
  const d = db();
  const rows = d.prepare("SELECT published_at, reach, likes + comments + shares + saved AS i FROM content WHERE account_id = ?").all(accountId) as { published_at: string; reach: number; i: number }[];
  if (rows.length < 10) return;
  const grid = Array.from({ length: 8 }, () => Array.from({ length: 24 }, () => ({ s: 0, n: 0 })));
  for (const r of rows) {
    const t = new Date(new Date(r.published_at).getTime() + 5.5 * 3600e3);
    const dow = ((t.getUTCDay() + 6) % 7) + 1;
    for (const dh of [-1, 0, 1]) {
      const h = (t.getUTCHours() + dh + 24) % 24;
      const w = dh === 0 ? 1 : 0.4;
      grid[dow][h].s += w * r.reach;
      grid[dow][h].n += w;
    }
  }
  const ins = d.prepare("INSERT OR REPLACE INTO best_times (account_id, dow, hour, value) VALUES (?, ?, ?, ?)");
  for (let dow = 1; dow <= 7; dow++) for (let h = 0; h < 24; h++) ins.run(accountId, dow, h, grid[dow][h].n ? Math.round(grid[dow][h].s / grid[dow][h].n) : 0);
}

/** Publish an image or reel. Returns the published media id. */
const isVideo = (u: string) => /\.(mp4|mov|webm)(\?|$)/i.test(u);

/** Wait until a media container finishes processing (videos take a while). */
async function waitReady(id: string, token: string) {
  let status = "IN_PROGRESS";
  for (let i = 0; i < 20 && status === "IN_PROGRESS"; i++) {
    status = (await graph<{ status_code: string }>(`/${id}?fields=status_code`, token)).status_code;
    if (status === "IN_PROGRESS") await new Promise((r) => setTimeout(r, 15000)); // up to 5 minutes, per Meta's guidance
  }
  if (status !== "FINISHED") throw new Error(`Instagram media container ended as ${status}`);
}

/** Feed post, Reel, carousel (2–10 items) or story. */
export async function publishInstagram(acc: Account, post: PublishPost) {
  if (!acc.external_id || !acc.access_token) throw new Error("Instagram account is not connected");
  const token = acc.access_token, ig = acc.external_id;
  let containerId: string;
  if (post.format === "carousel") {
    const items = post.media_urls ?? [];
    if (items.length < 2) throw new Error("A carousel needs at least 2 items");
    const children: string[] = [];
    for (const url of items.slice(0, 10)) {
      const c = await graph<{ id: string }>(`/${ig}/media`, token, { method: "POST", body: isVideo(url) ? { media_type: "VIDEO", video_url: url, is_carousel_item: "true" } : { image_url: url, is_carousel_item: "true" } });
      if (isVideo(url)) await waitReady(c.id, token);
      children.push(c.id);
    }
    containerId = (await graph<{ id: string }>(`/${ig}/media`, token, { method: "POST", body: { media_type: "CAROUSEL", children: children.join(","), caption: post.text } })).id;
  } else if (post.format === "story") {
    if (!post.media_url) throw new Error("A story needs an image or video");
    containerId = (await graph<{ id: string }>(`/${ig}/media`, token, { method: "POST", body: isVideo(post.media_url) ? { media_type: "STORIES", video_url: post.media_url } : { media_type: "STORIES", image_url: post.media_url } })).id;
  } else {
    if (!post.media_url) throw new Error("Instagram needs an image or video");
    const body: Record<string, string> = { caption: post.text };
    if (post.media_type === "REELS") { body.media_type = "REELS"; body.video_url = post.media_url; }
    else body.image_url = post.media_url;
    containerId = (await graph<{ id: string }>(`/${ig}/media`, token, { method: "POST", body })).id;
  }
  await waitReady(containerId, token);
  return (await graph<{ id: string }>(`/${ig}/media_publish`, token, { method: "POST", body: { creation_id: containerId } })).id;
}
