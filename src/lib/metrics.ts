import "server-only";
import { db } from "./db";

export const NETWORKS = ["instagram", "facebook", "youtube", "x", "linkedin", "tiktok"] as const;
export type Network = (typeof NETWORKS)[number];
export const NETWORK_LABEL: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok", linkedin: "LinkedIn", x: "X (Twitter)",
};

export type Account = {
  id: number; brand_id: number; network: string; handle: string; connector: string;
  external_id: string | null; access_token: string | null; last_sync: string | null;
  refresh_token?: string | null; token_expires_at?: string | null; scopes?: string | null;
};
export type Point = { date: string; value: number };
export type ContentRow = {
  id: number; kind: string; format: string | null; published_at: string; url: string | null;
  caption: string | null; image_url: string | null; likes: number; comments: number; shares: number;
  saved: number; reach: number; views: number; interactions: number; engagement: number;
};

export function getBrand(id: number) {
  return db().prepare("SELECT * FROM brands WHERE id = ?").get(id) as { id: number; name: string; timezone: string };
}
export function listAccounts(brandId: number): Account[] {
  return db().prepare("SELECT * FROM accounts WHERE brand_id = ? AND connector != 'none' ORDER BY id").all(brandId) as Account[];
}
export function getAccount(brandId: number, network: string): Account | undefined {
  return db().prepare("SELECT * FROM accounts WHERE brand_id = ? AND network = ?").get(brandId, network) as Account | undefined;
}

/** Period helpers. Dates are YYYY-MM-DD. `to` is inclusive. */
export function periodFromDays(days: number, end = new Date()) {
  const to = end.toISOString().slice(0, 10);
  const from = new Date(end.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { from, to };
}
export function previousPeriod(from: string, to: string) {
  const f = new Date(from + "T12:00:00Z").getTime();
  const t = new Date(to + "T12:00:00Z").getTime();
  const len = t - f + 86400000;
  return {
    from: new Date(f - len).toISOString().slice(0, 10),
    to: new Date(t - len).toISOString().slice(0, 10),
  };
}
function eachDay(from: string, to: string) {
  const out: string[] = [];
  for (let t = new Date(from + "T12:00:00Z").getTime(); t <= new Date(to + "T12:00:00Z").getTime(); t += 86400000)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

const CONTENT_METRICS: Record<string, string> = {
  count: "COUNT(*)",
  likes: "SUM(likes)", comments: "SUM(comments)", shares: "SUM(shares)", saved: "SUM(saved)",
  reach: "SUM(reach)", views: "SUM(views)",
  interactions: "SUM(likes + comments + shares + saved)",
  engagement: "CASE WHEN SUM(reach) > 0 THEN 100.0 * SUM(likes + comments + shares + saved) / SUM(reach) ELSE 0 END",
};

/** Mirror of Metricool's GET /api/v2/analytics/timelines. subject = account | posts | reels | videos */
export function timeline(accountId: number, subject: string, metric: string, from: string, to: string): Point[] {
  let rows: { date: string; value: number }[];
  if (subject === "account") {
    rows = db()
      .prepare("SELECT date, value FROM metric_points WHERE account_id = ? AND subject = 'account' AND metric = ? AND date BETWEEN ? AND ? ORDER BY date")
      .all(accountId, metric, from, to) as typeof rows;
  } else {
    const expr = CONTENT_METRICS[metric];
    if (!expr) throw new Error(`unknown metric ${metric}`);
    rows = db()
      .prepare(
        `SELECT substr(published_at, 1, 10) AS date, ${expr} AS value FROM content
         WHERE account_id = ? AND kind = ? AND substr(published_at, 1, 10) BETWEEN ? AND ? GROUP BY date ORDER BY date`
      )
      .all(accountId, kindOf(subject), from, to) as typeof rows;
  }
  const byDate = new Map(rows.map((r) => [r.date, Number(r.value)]));
  const fill = subject === "account" && ["followers", "following", "postsCount"].includes(metric) ? null : 0;
  let last: number | null = null;
  return eachDay(from, to).map((date) => {
    const v = byDate.get(date);
    if (v !== undefined) last = v;
    return { date, value: v ?? (fill === null ? last ?? 0 : 0) };
  });
}

function kindOf(subject: string) {
  return subject === "reels" ? "reel" : subject === "videos" ? "video" : "post";
}

/** Mirror of GET /api/v2/analytics/aggregation: one number for the period. */
export function aggregation(accountId: number, subject: string, metric: string, from: string, to: string): number {
  if (subject === "account") {
    const pts = timeline(accountId, subject, metric, from, to);
    if (["followers", "following", "postsCount"].includes(metric)) return pts.at(-1)?.value ?? 0;
    return pts.reduce((s, p) => s + p.value, 0);
  }
  const expr = CONTENT_METRICS[metric];
  const r = db()
    .prepare(`SELECT ${expr} AS v FROM content WHERE account_id = ? AND kind = ? AND substr(published_at,1,10) BETWEEN ? AND ?`)
    .get(accountId, kindOf(subject), from, to) as { v: number | null };
  return Number(r?.v ?? 0);
}

/** First date we hold for a metric (YYYY-MM-DD), or "9999" when there's none. */
export function historyStart(accountId: number, metric: string): string {
  const r = db().prepare("SELECT MIN(date) AS d FROM metric_points WHERE account_id = ? AND metric = ?").get(accountId, metric) as { d: string | null };
  return r.d ?? "9999";
}

export function distribution(accountId: number, metric: string) {
  return db()
    .prepare("SELECT label, value FROM distributions WHERE account_id = ? AND metric = ? ORDER BY value DESC")
    .all(accountId, metric) as { label: string; value: number }[];
}

export function contentList(accountId: number, from: string, to: string, kind?: string): ContentRow[] {
  const rows = db()
    .prepare(
      `SELECT *, likes + comments + shares + saved AS interactions,
         CASE WHEN reach > 0 THEN 100.0 * (likes + comments + shares + saved) / reach ELSE 0 END AS engagement
       FROM content WHERE account_id = ? AND substr(published_at,1,10) BETWEEN ? AND ? ${kind ? "AND kind = ?" : ""}
       ORDER BY published_at DESC`
    )
    .all(...([accountId, from, to, ...(kind ? [kind] : [])] as (string | number)[])) as ContentRow[];
  return rows;
}

export function hashtags(accountId: number, from: string, to: string) {
  const map = new Map<string, { tag: string; posts: number; views: number; likes: number; comments: number; reach: number; interactions: number }>();
  for (const c of contentList(accountId, from, to)) {
    const tags = new Set((c.caption ?? "").toLowerCase().match(/#[\p{L}\p{N}_]+/gu) ?? []);
    for (const tag of tags) {
      const h = map.get(tag) ?? { tag, posts: 0, views: 0, likes: 0, comments: 0, reach: 0, interactions: 0 };
      h.posts++; h.views += c.views; h.likes += c.likes; h.comments += c.comments; h.reach += c.reach; h.interactions += c.interactions;
      map.set(tag, h);
    }
  }
  return [...map.values()].sort((a, b) => b.views - a.views);
}

/** Mirror of GET /api/v2/scheduler/besttimes/{network}: 7×24 grid. */
export function bestTimes(accountId: number) {
  // node:sqlite rows have a null prototype; copy into plain objects so they can cross to client components.
  return (db().prepare("SELECT dow, hour, value FROM best_times WHERE account_id = ?").all(accountId) as {
    dow: number; hour: number; value: number;
  }[]).map((r) => ({ dow: r.dow, hour: r.hour, value: r.value }));
}

export function summary(accountId: number, from: string, to: string) {
  const prev = previousPeriod(from, to);
  const k = (subject: string, metric: string) => ({
    value: aggregation(accountId, subject, metric, from, to),
    previous: aggregation(accountId, subject, metric, prev.from, prev.to),
  });
  return {
    followers: k("account", "followers"),
    gained: k("account", "followers_gained"),
    lost: k("account", "followers_lost"),
    reach: k("account", "reach"),
    views: k("account", "views"),
    profileViews: k("account", "profile_views"),
    posts: k("posts", "count"),
    reels: k("reels", "count"),
    postEngagement: k("posts", "engagement"),
    reelEngagement: k("reels", "engagement"),
    interactions: {
      value: aggregation(accountId, "posts", "interactions", from, to) + aggregation(accountId, "reels", "interactions", from, to),
      previous: aggregation(accountId, "posts", "interactions", prev.from, prev.to) + aggregation(accountId, "reels", "interactions", prev.from, prev.to),
    },
  };
}
