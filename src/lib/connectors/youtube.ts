import fs from "node:fs";
import { Readable } from "node:stream";
import { localPath } from "../media";
import type { PublishPost } from "./types";
import "server-only";
import { db } from "../db";
import type { Account } from "../metrics";
import { api, freshToken } from "../oauth";
import { recomputeBestTimes } from "./instagram";

// YouTube Data API v3 + YouTube Analytics API v2 (Google OAuth).
// YouTube doesn't expose "reach", so Socialdesk uses views as reach for YouTube; engagement = interactions ÷ views.

const YT = "https://www.googleapis.com/youtube/v3";
const YTA = "https://youtubeanalytics.googleapis.com/v2/reports";

export async function identifyYouTube(token: string) {
  const r = await api<{ items?: { id: string; snippet: { title: string; thumbnails?: Record<string, { url: string }> } }[] }>(`${YT}/channels?part=snippet&mine=true`, token);
  const ch = r.items?.[0];
  if (!ch) throw new Error("This Google account has no YouTube channel");
  return { externalId: ch.id, handle: ch.snippet.title };
}

const iso8601Seconds = (d: string) => {
  const m = d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0)) : 0;
};
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

export async function syncYouTube(acc: Account) {
  const token = await freshToken(acc);
  const d = db();
  const warnings: string[] = [];
  const put = d.prepare("INSERT OR REPLACE INTO metric_points (account_id, subject, metric, date, value) VALUES (?, 'account', ?, ?, ?)");
  const today = ymd(Date.now());

  const ch = (await api<{ items: { snippet: { title: string; thumbnails?: Record<string, { url: string }> }; statistics: { subscriberCount?: string; videoCount: string; hiddenSubscriberCount: boolean }; contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(
    `${YT}/channels?part=snippet,statistics,contentDetails&id=${acc.external_id}`, token)).items[0];
  const subs = Number(ch.statistics.subscriberCount ?? 0);
  d.prepare("UPDATE accounts SET handle = ?, picture = ? WHERE id = ?").run(ch.snippet.title, ch.snippet.thumbnails?.medium?.url ?? ch.snippet.thumbnails?.default?.url ?? null, acc.id);
  put.run(acc.id, "followers", today, subs);
  put.run(acc.id, "postsCount", today, Number(ch.statistics.videoCount));

  // Daily analytics. Data lags ~2 days. Backfill 30 days on first sync.
  const days = acc.last_sync ? 7 : 30;
  const start = ymd(Date.now() - days * 864e5), end = today;
  try {
    const r = await api<{ columnHeaders: { name: string }[]; rows?: (string | number)[][] }>(
      `${YTA}?ids=channel==MINE&startDate=${start}&endDate=${end}&metrics=views,estimatedMinutesWatched,subscribersGained,subscribersLost,likes,comments,shares&dimensions=day&sort=day`, token);
    const col = (n: string) => r.columnHeaders.findIndex((h) => h.name === n);
    const rows = r.rows ?? [];
    for (const row of rows) {
      const date = String(row[col("day")]);
      put.run(acc.id, "views", date, Number(row[col("views")]));
      put.run(acc.id, "reach", date, Number(row[col("views")]));
      put.run(acc.id, "watch_minutes", date, Number(row[col("estimatedMinutesWatched")]));
      put.run(acc.id, "followers_gained", date, Number(row[col("subscribersGained")]));
      put.run(acc.id, "followers_lost", date, Number(row[col("subscribersLost")]));
    }
    // Rebuild the subscriber history backwards from today's count using the daily net change.
    if (!acc.last_sync) {
      let running = subs;
      for (const row of [...rows].reverse()) {
        const date = String(row[col("day")]);
        if (date >= today) continue;
        put.run(acc.id, "followers", date, running);
        running -= Number(row[col("subscribersGained")]) - Number(row[col("subscribersLost")]);
      }
    }
  } catch (e) { warnings.push(`daily analytics: ${(e as Error).message}`); }

  // Monetization (YouTube Partner Program) windows: long-form watch hours over 365 days, Shorts views over 90 days.
  try {
    const byType = async (from: string) => (await api<{ rows?: [string, number, number][] }>(
      `${YTA}?ids=channel==MINE&startDate=${from}&endDate=${end}&metrics=views,estimatedMinutesWatched&dimensions=creatorContentType`, token)).rows ?? [];
    const y = await byType(ymd(Date.now() - 365 * 864e5));
    const q = await byType(ymd(Date.now() - 90 * 864e5));
    put.run(acc.id, "ypp_watch_minutes_365", today, y.filter(([t]) => t.toLowerCase() !== "shorts").reduce((s, r) => s + Number(r[2]), 0));
    put.run(acc.id, "ypp_shorts_views_90", today, q.filter(([t]) => t.toLowerCase() === "shorts").reduce((s, r) => s + Number(r[1]), 0));
    // Daily Shorts vs long-form views for the last month.
    const daily = await api<{ rows?: [string, string, number][] }>(
      `${YTA}?ids=channel==MINE&startDate=${start}&endDate=${end}&metrics=views&dimensions=day,creatorContentType&sort=day`, token);
    const sum = new Map<string, { s: number; l: number }>();
    for (const [day, type, v] of daily.rows ?? []) { const e = sum.get(day) ?? { s: 0, l: 0 }; if (type.toLowerCase() === "shorts") e.s += Number(v); else e.l += Number(v); sum.set(day, e); }
    for (const [day, e] of sum) { put.run(acc.id, "views_shorts", day, e.s); put.run(acc.id, "views_long", day, e.l); }
  } catch (e) { warnings.push(`monetization windows: ${(e as Error).message}`); }

  // Revenue needs the yt-analytics-monetary scope and a monetized channel; skip quietly otherwise.
  try {
    const r = await api<{ rows?: [string, number, number][] }>(
      `${YTA}?ids=channel==MINE&startDate=${acc.last_sync ? start : ymd(Date.now() - 90 * 864e5)}&endDate=${end}&metrics=estimatedRevenue,playbackBasedCpm&dimensions=day&sort=day&currency=INR`, token);
    for (const [day, rev, cpm] of r.rows ?? []) { put.run(acc.id, "revenue", day, Number(rev)); put.run(acc.id, "cpm", day, Number(cpm)); }
  } catch { /* not monetized or no revenue permission */ }

  // Recent uploads with their stats.
  try {
    const items = await api<{ items: { contentDetails: { videoId: string } }[] }>(`${YT}/playlistItems?part=contentDetails&maxResults=50&playlistId=${ch.contentDetails.relatedPlaylists.uploads}`, token);
    const ids = items.items.map((i) => i.contentDetails.videoId).join(",");
    if (ids) {
      const vids = await api<{ items: { id: string; snippet: { title: string; description: string; publishedAt: string; thumbnails: { medium?: { url: string } } }; statistics: { viewCount?: string; likeCount?: string; commentCount?: string }; contentDetails: { duration: string } }[] }>(
        `${YT}/videos?part=snippet,statistics,contentDetails&id=${ids}`, token);
      const upsert = d.prepare(
        `INSERT INTO content (account_id, external_id, kind, format, published_at, url, caption, image_url, likes, comments, shares, saved, reach, views)
         VALUES (?, ?, ?, 'VIDEO', ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
         ON CONFLICT(account_id, external_id) DO UPDATE SET likes=excluded.likes, comments=excluded.comments, reach=excluded.reach, views=excluded.views, caption=excluded.caption`
      );
      for (const v of vids.items) {
        const views = Number(v.statistics.viewCount ?? 0);
        const kind = iso8601Seconds(v.contentDetails.duration) <= 180 ? "reel" : "video";
        upsert.run(acc.id, v.id, kind, new Date(v.snippet.publishedAt).toISOString(), `https://www.youtube.com/watch?v=${v.id}`,
          `${v.snippet.title}\n\n${v.snippet.description}`.slice(0, 2000), v.snippet.thumbnails.medium?.url ?? null,
          Number(v.statistics.likeCount ?? 0), Number(v.statistics.commentCount ?? 0), views, views);
      }
    }
  } catch (e) { warnings.push(`videos: ${(e as Error).message}`); }

  // Audience: age/gender share of views, top countries.
  const putDist = d.prepare("INSERT OR REPLACE INTO distributions (account_id, metric, label, value) VALUES (?, ?, ?, ?)");
  const start90 = ymd(Date.now() - 90 * 864e5);
  try {
    const r = await api<{ rows?: [string, string, number][] }>(`${YTA}?ids=channel==MINE&startDate=${start90}&endDate=${end}&metrics=viewerPercentage&dimensions=ageGroup,gender`, token);
    const age = new Map<string, number>(), gender = new Map<string, number>();
    for (const [a, g, pct] of r.rows ?? []) {
      const label = a.replace("age", "").replace(/-$/, "+").replace("-", "–"); // age18-24 → 18–24, age65- → 65+
      age.set(label, (age.get(label) ?? 0) + pct);
      const gl = g === "user_specified" ? "Unspecified" : g[0].toUpperCase() + g.slice(1);
      gender.set(gl, (gender.get(gl) ?? 0) + pct);
    }
    if (age.size) {
      d.prepare("DELETE FROM distributions WHERE account_id = ? AND metric IN ('age','gender')").run(acc.id);
      for (const [k, v] of age) putDist.run(acc.id, "age", k, +v.toFixed(2));
      for (const [k, v] of gender) putDist.run(acc.id, "gender", k, +v.toFixed(2));
    }
  } catch (e) { warnings.push(`age/gender: ${(e as Error).message}`); }
  try {
    const r = await api<{ rows?: [string, number][] }>(`${YTA}?ids=channel==MINE&startDate=${start90}&endDate=${end}&metrics=views&dimensions=country&sort=-views&maxResults=10`, token);
    const total = (r.rows ?? []).reduce((s, [, v]) => s + v, 0) || 1;
    if (r.rows?.length) {
      d.prepare("DELETE FROM distributions WHERE account_id = ? AND metric = 'country'").run(acc.id);
      for (const [c, v] of r.rows) putDist.run(acc.id, "country", new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? c, +((100 * v) / total).toFixed(2));
    }
  } catch (e) { warnings.push(`countries: ${(e as Error).message}`); }

  recomputeBestTimes(acc.id);
  d.prepare("UPDATE accounts SET last_sync = datetime('now') WHERE id = ?").run(acc.id);
  return { warnings };
}

/** Upload a video (resumable upload). Uses title/description/tags from the composer; Shorts get #Shorts. */
export async function publishYouTube(acc: Account, post: PublishPost) {
  if (!post.media_url || post.media_type !== "REELS") throw new Error("YouTube needs a video");
  const token = await freshToken(acc);
  const local = localPath(post.media_url);
  let body: BodyInit, size: number, type: string;
  if (local && fs.existsSync(local)) {
    size = fs.statSync(local).size;
    type = local.endsWith(".mov") ? "video/quicktime" : local.endsWith(".webm") ? "video/webm" : "video/mp4";
    body = Readable.toWeb(fs.createReadStream(local)) as ReadableStream;
  } else {
    const src = await fetch(post.media_url);
    if (!src.ok) throw new Error(`Couldn't download the video (${src.status})`);
    const bytes = Buffer.from(await src.arrayBuffer());
    size = bytes.length; type = src.headers.get("content-type") ?? "video/mp4"; body = bytes;
  }
  const [first, ...rest] = post.text.split("\n");
  let title = (post.title ?? first).trim().slice(0, 100) || "New video";
  let description = (post.description ?? rest.join("\n")).trim();
  if (post.format === "short" && !/#shorts/i.test(title + description)) description = `${description}\n\n#Shorts`.trim();
  title = title.replace(/[<>]/g, "");
  const tags = (post.tags ?? []).map((t) => t.replace(/^#/, "").trim()).filter(Boolean).slice(0, 30);
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-upload-content-type": type, "x-upload-content-length": String(size) },
    body: JSON.stringify({
      snippet: { title, description: description.slice(0, 5000), tags, categoryId: "27" /* Education */ },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    }),
  });
  const location = init.headers.get("location");
  if (!init.ok || !location) throw new Error(`YouTube upload couldn't start: ${(await init.text()).slice(0, 200)}`);
  const up = await fetch(location, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": type, "content-length": String(size) }, body, duplex: "half" } as RequestInit);
  const j = (await up.json()) as { id?: string; error?: { message: string } };
  if (!up.ok || !j.id) throw new Error(`YouTube upload failed: ${j.error?.message ?? up.statusText}`);
  return j.id;
}
