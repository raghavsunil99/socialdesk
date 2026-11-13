import "server-only";
import { db } from "./db";
import { competitorPosts, trendingInstagram, trendingYouTube, type Post } from "./competitors";

// The Ideas tab: what to record next, from three kinds of evidence.
//  1. Proven by competitors: their recent outliers (≥ 2.5× their own median).
//  2. Rising in your niche: trend searches for the brand's saved keywords (cached 6 h to save API quota).
//  3. Your winners: your own best posts, to turn into a part 2 or a series.

export type IdeaSource = Post & { source: "competitor" | "trend" | "yours"; from: string; keyword?: string };

const TREND_TTL_H = 6;
const DAYS = (n: number) => Date.now() - n * 864e5;

export function keywords(brandId: number, network: string) {
  return (db().prepare("SELECT keyword FROM brand_keywords WHERE brand_id = ? AND network = ? ORDER BY keyword").all(brandId, network) as { keyword: string }[]).map((r) => r.keyword);
}

/** Competitor posts from the last 60 days that did at least 2.5× that account's usual. */
export function competitorOutliers(brandId: number, network: string): IdeaSource[] {
  const comps = db().prepare("SELECT id, name, handle FROM competitors WHERE brand_id = ? AND network = ? AND handle NOT LIKE 'demo%'").all(brandId, network) as { id: number; name: string | null; handle: string }[];
  return comps
    .flatMap((c) => competitorPosts(c.id).map((p) => ({ ...p, source: "competitor" as const, from: c.name ?? c.handle })))
    .filter((p) => (p.outlier ?? 0) >= 2.5 && new Date(p.published_at).getTime() >= DAYS(60))
    .sort((a, b) => (b.outlier ?? 0) - (a.outlier ?? 0))
    .slice(0, 24);
}

/** Trend search per saved keyword, served from cache when it's fresh. Errors are returned, not thrown. */
export async function trends(brandId: number, network: string, refresh = false): Promise<{ items: IdeaSource[]; errors: string[]; fetchedAt: string | null }> {
  const d = db();
  const items: IdeaSource[] = [];
  const errors: string[] = [];
  let fetchedAt: string | null = null;
  for (const kw of keywords(brandId, network)) {
    const row = d.prepare("SELECT fetched_at, data FROM trend_cache WHERE brand_id = ? AND network = ? AND keyword = ?").get(brandId, network, kw) as { fetched_at: string; data: string } | undefined;
    let data: Post[] | null = row && !refresh && Date.now() - new Date(row.fetched_at + "Z").getTime() < TREND_TTL_H * 3600e3 ? JSON.parse(row.data) : null;
    if (!data) {
      try {
        data = network === "instagram" ? await trendingInstagram(brandId, kw) : await trendingYouTube(brandId, kw, 7, true);
        d.prepare("INSERT OR REPLACE INTO trend_cache (brand_id, network, keyword, fetched_at, data) VALUES (?, ?, ?, datetime('now'), ?)").run(brandId, network, kw, JSON.stringify(data));
      } catch (e) {
        errors.push(`${kw}: ${(e as Error).message}`);
        data = row ? JSON.parse(row.data) : [];
      }
    }
    const at = (d.prepare("SELECT fetched_at FROM trend_cache WHERE brand_id = ? AND network = ? AND keyword = ?").get(brandId, network, kw) as { fetched_at: string } | undefined)?.fetched_at ?? null;
    if (at && (!fetchedAt || at < fetchedAt)) fetchedAt = at;
    items.push(...(data ?? []).slice(0, 8).map((p) => ({ ...p, source: "trend" as const, from: p.channel ?? kw, keyword: kw })));
  }
  // one entry per video, fastest first
  const seen = new Set<string>();
  return { items: items.filter((p) => !seen.has(p.external_id) && seen.add(p.external_id)).sort((a, b) => (b.perDay ?? 0) - (a.perDay ?? 0)).slice(0, 24), errors, fetchedAt };
}

/** Your own best posts on the network (all time), as part-2 candidates. */
export function yourWinners(brandId: number, network: string): IdeaSource[] {
  const rows = db().prepare(
    `SELECT c.external_id, c.kind, c.published_at, c.url, c.caption, c.image_url AS thumbnail, c.views, c.likes, c.comments, a.handle
     FROM content c JOIN accounts a ON a.id = c.account_id WHERE a.brand_id = ? AND a.network = ? AND a.connector != 'demo' ORDER BY c.views DESC LIMIT 60`
  ).all(brandId, network) as (Post & { handle: string })[];
  const views = rows.map((r) => r.views ?? 0).sort((a, b) => a - b);
  const med = views[Math.floor(views.length / 2)] || 1;
  const perDay = (r: Post) => Math.round((r.views ?? 0) / Math.max(1, (Date.now() - new Date(r.published_at).getTime()) / 864e5));
  return rows.slice(0, 6).map((r) => ({ ...r, url: r.url ?? "", caption: (r.caption ?? "").split("\n")[0], perDay: perDay(r), outlier: +((r.views ?? 0) / med).toFixed(1), source: "yours" as const, from: r.handle }));
}

/** Words that keep showing up in titles that work — a quick read on hooks and topics. */
export function hookWords(items: IdeaSource[]) {
  const stop = new Set(["the", "and", "for", "you", "this", "with", "in", "to", "of", "a", "is", "shorts", "short", "ytshorts", "viral", "trending", "telugu", "video", "videos", "shortsvideo", "shortvideo", "shortsfeed", "youtubeshorts", "tech", "technology", "funny", "new", "latest", "updates", "ai"]);
  // Channel names repeat in their own titles ("| DAR FOCUS #darfocus"); leave them out so topics show.
  for (const p of items) for (const w of p.from.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []) stop.add(w);
  for (const p of items) stop.add(p.from.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
  const count = new Map<string, number>();
  for (const p of items) {
    const words = new Set((p.caption.toLowerCase().match(/[#₹]?[\p{L}\p{N}]{3,}/gu) ?? []).map((w) => w.replace(/^#/, "")));
    for (const w of words) if (!stop.has(w) && !/^\d+$/.test(w)) count.set(w, (count.get(w) ?? 0) + 1);
  }
  return [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 18);
}
