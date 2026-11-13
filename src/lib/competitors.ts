import "server-only";
import { db } from "./db";
import { getAccount } from "./metrics";
import { api, freshToken } from "./oauth";
import { graph } from "./connectors/instagram";

// Competitor & niche research.
// YouTube: public channel/video data via the YouTube Data API — with YOUTUBE_API_KEY if set, otherwise the
//   brand's own connected YouTube token. Quota: channel/videos lookups ~1 unit each; search costs 100 units.
// Instagram: Business Discovery (a competitor's recent media) and Hashtag Search (top media for a hashtag) via the
//   brand's connected Instagram. Only works for professional accounts; Meta doesn't expose others' views or reach.

export type Competitor = {
  id: number; brand_id: number; network: string; handle: string; name: string | null; picture: string | null;
  external_id: string | null; followers: number | null; followers_30d_ago: number | null; posts_30d: number | null;
  avg_engagement: number | null; avg_reach: number | null; updated_at: string | null; error: string | null;
};
export type Post = {
  external_id: string; kind: string; published_at: string; url: string; caption: string; thumbnail: string | null;
  views: number | null; likes: number; comments: number; duration_s?: number | null;
  channel?: string; perDay?: number; outlier?: number | null;
};

const YT = "https://www.googleapis.com/youtube/v3";

/** GET a YouTube Data API path using the API key (preferred) or the brand's YouTube token. */
async function yt<T>(brandId: number, path: string): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (key) return api<T>(`${YT}${path}${path.includes("?") ? "&" : "?"}key=${key}`, "");
  const acc = getAccount(brandId, "youtube");
  if (!acc || acc.connector !== "live") {
    // fall back to any YouTube connection in another brand
    const other = db().prepare("SELECT brand_id FROM accounts WHERE network = 'youtube' AND connector = 'live' LIMIT 1").get() as { brand_id: number } | undefined;
    if (!other) throw new Error("Connect a YouTube channel in Connections (or set YOUTUBE_API_KEY) to look up YouTube channels");
    return api<T>(`${YT}${path}`, await freshToken(getAccount(other.brand_id, "youtube")!));
  }
  return api<T>(`${YT}${path}`, await freshToken(acc));
}

function igAccount(brandId: number) {
  const acc = getAccount(brandId, "instagram");
  if (!acc || acc.connector !== "live" || !acc.access_token) throw new Error("Connect this brand's Instagram (Connections → Continue with Facebook) to look up Instagram accounts and hashtags");
  return acc;
}

const iso8601Seconds = (d: string) => {
  const m = d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0)) : 0;
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const ageDays = (iso: string) => Math.max(1, (Date.now() - new Date(iso).getTime()) / 864e5);

/** Views (or likes+comments when views aren't public) per day since publishing, and × the channel's median. */
export function score(posts: Post[]): Post[] {
  const metric = (p: Post) => p.views ?? p.likes + p.comments;
  const med = median(posts.map(metric));
  return posts.map((p) => ({ ...p, perDay: Math.round(metric(p) / ageDays(p.published_at)), outlier: med ? +(metric(p) / med).toFixed(1) : null }));
}

type YtVideo = { id: string; snippet: { title: string; description: string; publishedAt: string; channelTitle: string; thumbnails: { medium?: { url: string } } }; statistics: { viewCount?: string; likeCount?: string; commentCount?: string }; contentDetails: { duration: string } };
const ytPost = (v: YtVideo): Post => {
  const dur = iso8601Seconds(v.contentDetails.duration);
  return {
    external_id: v.id, kind: dur <= 180 ? "short" : "video", published_at: v.snippet.publishedAt, url: `https://www.youtube.com/watch?v=${v.id}`,
    caption: v.snippet.title, thumbnail: v.snippet.thumbnails.medium?.url ?? null, views: Number(v.statistics.viewCount ?? 0),
    likes: Number(v.statistics.likeCount ?? 0), comments: Number(v.statistics.commentCount ?? 0), duration_s: dur, channel: v.snippet.channelTitle,
  };
};

/** Accepts @handle, a channel URL (/@handle or /channel/UC…), or a UC… id. */
function ytLookup(input: string) {
  const s = input.trim();
  const id = s.match(/(UC[\w-]{22})/)?.[1];
  if (id) return `id=${id}`;
  const handle = s.match(/youtube\.com\/@([\w.-]+)/)?.[1] ?? s.replace(/^@/, "");
  return `forHandle=${encodeURIComponent("@" + handle)}`;
}

async function refreshYouTube(c: Competitor) {
  const ch = (await yt<{ items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails: { default?: { url: string } } }; statistics: { subscriberCount?: string }; contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(
    c.brand_id, `/channels?part=snippet,statistics,contentDetails&${c.external_id ? `id=${c.external_id}` : ytLookup(c.handle)}`)).items?.[0];
  if (!ch) throw new Error(`No YouTube channel found for "${c.handle}"`);
  const items = await yt<{ items: { contentDetails: { videoId: string } }[] }>(c.brand_id, `/playlistItems?part=contentDetails&maxResults=50&playlistId=${ch.contentDetails.relatedPlaylists.uploads}`);
  const ids = items.items.map((i) => i.contentDetails.videoId).join(",");
  const vids = ids ? (await yt<{ items: YtVideo[] }>(c.brand_id, `/videos?part=snippet,statistics,contentDetails&id=${ids}`)).items.map(ytPost) : [];
  return {
    externalId: ch.id, name: ch.snippet.title, handle: ch.snippet.customUrl ?? c.handle, picture: ch.snippet.thumbnails.default?.url ?? null,
    followers: Number(ch.statistics.subscriberCount ?? 0), posts: vids,
  };
}

async function refreshInstagram(c: Competitor) {
  const acc = igAccount(c.brand_id);
  const username = c.handle.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
  const r = await graph<{ business_discovery: { id: string; name?: string; username: string; profile_picture_url?: string; followers_count: number; media: { data: { id: string; caption?: string; like_count?: number; comments_count?: number; media_type: string; media_product_type?: string; permalink: string; timestamp: string; thumbnail_url?: string; media_url?: string }[] } } }>(
    `/${acc.external_id}?fields=business_discovery.username(${encodeURIComponent(username)}){id,name,username,profile_picture_url,followers_count,media.limit(50){id,caption,like_count,comments_count,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url}}`,
    acc.access_token!
  );
  const bd = r.business_discovery;
  return {
    externalId: bd.id, name: bd.name ?? bd.username, handle: bd.username, picture: bd.profile_picture_url ?? null, followers: bd.followers_count,
    posts: bd.media.data.map<Post>((m) => ({
      external_id: m.id, kind: m.media_product_type === "REELS" ? "reel" : m.media_type === "CAROUSEL_ALBUM" ? "carousel" : "post",
      published_at: m.timestamp, url: m.permalink, caption: m.caption ?? "", thumbnail: m.thumbnail_url ?? (m.media_type === "IMAGE" ? m.media_url ?? null : null),
      views: null, likes: m.like_count ?? 0, comments: m.comments_count ?? 0,
    })),
  };
}

/** Fetch a competitor's profile + recent content and store it. Errors are saved on the row and rethrown. */
export async function refreshCompetitor(id: number) {
  const d = db();
  const c = d.prepare("SELECT * FROM competitors WHERE id = ?").get(id) as Competitor | undefined;
  if (!c) throw new Error("competitor not found");
  if (c.handle.startsWith("demo_")) return;
  try {
    const r = c.network === "youtube" ? await refreshYouTube(c) : await refreshInstagram(c);
    const since = Date.now() - 30 * 864e5;
    const recent = r.posts.filter((p) => new Date(p.published_at).getTime() >= since);
    const engagement = r.posts.length
      ? r.posts.reduce((s, p) => s + (p.views ? (p.likes + p.comments) / p.views : (p.likes + p.comments) / Math.max(1, r.followers)), 0) / r.posts.length * 100
      : null;
    d.exec("BEGIN");
    d.prepare(`UPDATE competitors SET external_id = ?, name = ?, handle = ?, picture = ?, followers = ?, followers_30d_ago = COALESCE(followers_30d_ago, ?),
               posts_30d = ?, avg_engagement = ?, avg_reach = ?, updated_at = datetime('now'), error = NULL WHERE id = ?`)
      .run(r.externalId, r.name, r.handle, r.picture, r.followers, r.followers, recent.length, engagement,
        Math.round(median(r.posts.map((p) => p.views ?? 0))), id);
    const up = d.prepare(`INSERT OR REPLACE INTO competitor_posts (competitor_id, external_id, kind, published_at, url, caption, thumbnail, views, likes, comments, duration_s)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const p of r.posts) up.run(id, p.external_id, p.kind, p.published_at, p.url, p.caption.slice(0, 1000), p.thumbnail, p.views, p.likes, p.comments, p.duration_s ?? null);
    d.exec("COMMIT");
  } catch (e) {
    try { d.exec("ROLLBACK"); } catch { /* not in a transaction */ }
    d.prepare("UPDATE competitors SET error = ?, updated_at = datetime('now') WHERE id = ?").run((e as Error).message.slice(0, 300), id);
    throw e;
  }
}

export function competitorPosts(competitorId: number): Post[] {
  return score((db().prepare("SELECT * FROM competitor_posts WHERE competitor_id = ? ORDER BY published_at DESC").all(competitorId) as Post[]).map((p) => ({ ...p })));
}

/** YouTube: most-viewed videos for a keyword published in the last N days (search costs 100 quota units). */
export async function trendingYouTube(brandId: number, q: string, days: number, shortsOnly: boolean) {
  const after = new Date(Date.now() - days * 864e5).toISOString();
  const s = await yt<{ items: { id: { videoId: string } }[] }>(brandId,
    `/search?part=id&type=video&order=viewCount&maxResults=25&regionCode=IN&publishedAfter=${after}&q=${encodeURIComponent(q)}${shortsOnly ? "&videoDuration=short" : ""}`);
  const ids = s.items.map((i) => i.id.videoId).join(",");
  if (!ids) return [];
  const vids = (await yt<{ items: YtVideo[] }>(brandId, `/videos?part=snippet,statistics,contentDetails&id=${ids}`)).items.map(ytPost);
  return score(vids).sort((a, b) => (b.perDay ?? 0) - (a.perDay ?? 0));
}

/** Instagram: top media for a hashtag (Meta allows 30 different hashtags per 7 days per account). */
export async function trendingInstagram(brandId: number, tag: string) {
  const acc = igAccount(brandId);
  const name = tag.replace(/^#/, "").trim();
  const h = await graph<{ data: { id: string }[] }>(`/ig_hashtag_search?user_id=${acc.external_id}&q=${encodeURIComponent(name)}`, acc.access_token!);
  if (!h.data[0]) return [];
  const m = await graph<{ data: { id: string; caption?: string; like_count?: number; comments_count?: number; media_type: string; media_product_type?: string; permalink: string; timestamp: string; media_url?: string }[] }>(
    `/${h.data[0].id}/top_media?user_id=${acc.external_id}&fields=id,caption,like_count,comments_count,media_type,media_product_type,permalink,timestamp,media_url&limit=50`, acc.access_token!);
  const posts = m.data.map<Post>((x) => ({
    external_id: x.id, kind: x.media_product_type === "REELS" ? "reel" : x.media_type === "CAROUSEL_ALBUM" ? "carousel" : "post",
    published_at: x.timestamp, url: x.permalink, caption: x.caption ?? "", thumbnail: x.media_type === "IMAGE" ? x.media_url ?? null : null,
    views: null, likes: x.like_count ?? 0, comments: x.comments_count ?? 0,
  }));
  return score(posts).sort((a, b) => (b.perDay ?? 0) - (a.perDay ?? 0));
}
