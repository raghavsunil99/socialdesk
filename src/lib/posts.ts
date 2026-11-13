export type ScheduledPost = {
  id: number; networks: string[]; text: string; media_url: string | null; media_type: string;
  scheduled_at: string; status: string; result: Record<string, unknown> | null;
  format: Format | null; meta: PostMeta | null;
};
/** short = vertical video (YouTube Shorts + Reels), long = YouTube only, post = image/text. */
export type Format = "post" | "short" | "long";
export type PostMeta = { keyword?: string; title?: string; description?: string; tags?: string[]; hashtags?: string[] };
export const FORMAT_NETWORKS: Record<Format, string[]> = {
  short: ["youtube", "instagram", "facebook"],
  long: ["youtube"],
  post: ["instagram", "facebook", "linkedin", "x"],
};
/** Caption for Instagram/Facebook/etc. built from the composer fields. */
export function socialCaption(m: PostMeta) {
  return [m.title, m.description, (m.hashtags ?? []).map((h) => (h.startsWith("#") ? h : "#" + h)).join(" ")].map((x) => x?.trim()).filter(Boolean).join("\n\n");
}
const STATUSES = ["draft", "pending_approval", "scheduled"];

export function rowToPost(r: Record<string, unknown>): ScheduledPost {
  return { ...(r as unknown as ScheduledPost), networks: JSON.parse(String(r.networks)), result: r.result ? JSON.parse(String(r.result)) : null, meta: r.meta ? JSON.parse(String(r.meta)) : null, format: (r.format as Format) ?? null };
}

export function validate(b: Record<string, unknown>) {
  if (!Array.isArray(b.networks) || b.networks.length === 0) return "pick at least one network";
  if (typeof b.text !== "string" || !b.text.trim()) return "text is required";
  if (!b.scheduled_at || isNaN(new Date(String(b.scheduled_at)).getTime())) return "scheduled_at must be a date";
  if (b.status && !STATUSES.includes(String(b.status))) return `status must be one of ${STATUSES.join(", ")}`;
  const nets = b.networks as string[];
  const format = b.format as Format | undefined;
  if (format && !FORMAT_NETWORKS[format]) return "format must be post, short or long";
  if (format) { const bad = nets.filter((n) => !FORMAT_NETWORKS[format].includes(n)); if (bad.length) return `${format === "long" ? "Long videos go to YouTube only" : `${bad.join(", ")} can't take a ${format}`}`; }
  if (nets.includes("instagram") && !b.media_url && b.status === "scheduled") return "Instagram posts need an image or video URL";
  if (nets.includes("youtube") && b.status === "scheduled" && (!b.media_url || b.media_type !== "REELS")) return "YouTube posts need a video URL (choose Reel / video)";
  if (nets.includes("x") && String(b.text).length > 280) return `X allows 280 characters; this post has ${String(b.text).length}`;
  return null;
}
