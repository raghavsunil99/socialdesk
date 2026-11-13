export type ScheduledPost = {
  id: number; networks: string[]; text: string; media_url: string | null; media_type: string;
  scheduled_at: string; status: string; result: Record<string, unknown> | null;
};
const STATUSES = ["draft", "pending_approval", "scheduled"];

export function rowToPost(r: Record<string, unknown>): ScheduledPost {
  return { ...(r as unknown as ScheduledPost), networks: JSON.parse(String(r.networks)), result: r.result ? JSON.parse(String(r.result)) : null };
}

export function validate(b: Record<string, unknown>) {
  if (!Array.isArray(b.networks) || b.networks.length === 0) return "pick at least one network";
  if (typeof b.text !== "string" || !b.text.trim()) return "text is required";
  if (!b.scheduled_at || isNaN(new Date(String(b.scheduled_at)).getTime())) return "scheduled_at must be a date";
  if (b.status && !STATUSES.includes(String(b.status))) return `status must be one of ${STATUSES.join(", ")}`;
  const nets = b.networks as string[];
  if (nets.includes("instagram") && !b.media_url && b.status === "scheduled") return "Instagram posts need an image or video URL";
  if (nets.includes("youtube") && b.status === "scheduled" && (!b.media_url || b.media_type !== "REELS")) return "YouTube posts need a video URL (choose Reel / video)";
  if (nets.includes("x") && String(b.text).length > 280) return `X allows 280 characters; this post has ${String(b.text).length}`;
  return null;
}
