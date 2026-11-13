import "server-only";
import { db } from "../db";
import type { Account } from "../metrics";
import { api, freshToken } from "../oauth";
import { recomputeBestTimes } from "./instagram";

// X API v2 (OAuth 2.0 with PKCE). Posting works on the free tier; reading followers and tweet metrics
// is heavily rate-limited there (the paid Basic tier lifts that), so reads are best-effort.

const X = "https://api.x.com/2";

export async function identifyX(token: string) {
  const me = await api<{ data: { id: string; username: string } }>(`${X}/users/me`, token);
  return { externalId: me.data.id, handle: me.data.username };
}

export async function syncX(acc: Account) {
  const token = await freshToken(acc);
  const d = db();
  const warnings: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const put = d.prepare("INSERT OR REPLACE INTO metric_points (account_id, subject, metric, date, value) VALUES (?, 'account', ?, ?, ?)");
  try {
    const me = await api<{ data: { username: string; profile_image_url?: string; public_metrics: { followers_count: number; following_count: number; tweet_count: number } } }>(`${X}/users/me?user.fields=public_metrics,profile_image_url`, token);
    d.prepare("UPDATE accounts SET handle = ?, picture = ? WHERE id = ?").run(me.data.username, me.data.profile_image_url?.replace("_normal", "_200x200") ?? null, acc.id);
    put.run(acc.id, "followers", today, me.data.public_metrics.followers_count);
    put.run(acc.id, "following", today, me.data.public_metrics.following_count);
    put.run(acc.id, "postsCount", today, me.data.public_metrics.tweet_count);
    const prev = d.prepare("SELECT value FROM metric_points WHERE account_id = ? AND metric = 'followers' AND date < ? ORDER BY date DESC LIMIT 1").get(acc.id, today) as { value: number } | undefined;
    if (prev) put.run(acc.id, "followers_gained", today, Math.max(0, me.data.public_metrics.followers_count - prev.value));
  } catch (e) { warnings.push(`profile: ${(e as Error).message}`); }
  try {
    const t = await api<{ data?: { id: string; text: string; created_at: string; public_metrics: { like_count: number; reply_count: number; retweet_count: number; quote_count: number; bookmark_count?: number; impression_count?: number } }[] }>(
      `${X}/users/${acc.external_id}/tweets?max_results=20&exclude=retweets,replies&tweet.fields=created_at,public_metrics`, token);
    const upsert = d.prepare(
      `INSERT INTO content (account_id, external_id, kind, format, published_at, url, caption, likes, comments, shares, saved, reach, views)
       VALUES (?, ?, 'post', 'TEXT', ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, external_id) DO UPDATE SET likes=excluded.likes, comments=excluded.comments, shares=excluded.shares, saved=excluded.saved, reach=excluded.reach, views=excluded.views`
    );
    for (const tw of t.data ?? []) {
      const m = tw.public_metrics;
      const imp = m.impression_count ?? 0;
      upsert.run(acc.id, tw.id, new Date(tw.created_at).toISOString(), `https://x.com/i/web/status/${tw.id}`, tw.text,
        m.like_count, m.reply_count, m.retweet_count + m.quote_count, m.bookmark_count ?? 0, imp, imp);
    }
  } catch (e) { warnings.push(`posts: ${(e as Error).message}`); }
  recomputeBestTimes(acc.id);
  d.prepare("UPDATE accounts SET last_sync = datetime('now') WHERE id = ?").run(acc.id);
  return { warnings };
}

export async function publishX(acc: Account, post: { text: string; media_url: string | null }) {
  if (post.text.length > 280) throw new Error("X allows 280 characters");
  const token = await freshToken(acc);
  const r = await api<{ data: { id: string } }>(`${X}/tweets`, token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: post.text }) });
  return r.data.id; // images aren't attached yet
}
