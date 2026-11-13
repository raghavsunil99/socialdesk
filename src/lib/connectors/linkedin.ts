import "server-only";
import { db } from "../db";
import type { Account } from "../metrics";
import { api, freshToken } from "../oauth";

// LinkedIn: posting to the member's own profile ("Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect").
// LinkedIn's API doesn't give personal-profile analytics; Company Page posting and analytics need the
// Community Management API, which LinkedIn has to approve for the app.

export async function identifyLinkedIn(token: string) {
  const me = await api<{ sub: string; name?: string; picture?: string }>("https://api.linkedin.com/v2/userinfo", token);
  return { externalId: me.sub, handle: me.name ?? "LinkedIn profile", picture: me.picture ?? null };
}

export async function syncLinkedIn(acc: Account) {
  const token = await freshToken(acc);
  const who = await identifyLinkedIn(token);
  db().prepare("UPDATE accounts SET handle = ?, picture = ?, last_sync = datetime('now') WHERE id = ?").run(who.handle, who.picture, acc.id);
  return { warnings: ["LinkedIn doesn't provide analytics for personal profiles through its API. Posting works; numbers need a Company Page with Community Management API access."] };
}

/** LinkedIn's "little text" format: escape reserved characters, keep #hashtags as real hashtags. */
export function toLinkedInCommentary(text: string) {
  return text
    .split(/(#[\p{L}\p{N}_]+)/u)
    .map((part) =>
      /^#[\p{L}\p{N}_]+$/u.test(part)
        ? `{hashtag|\\#|${part.slice(1)}}`
        : part.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => `\\${c}`)
    )
    .join("");
}

/** LinkedIn's versioned API wants a YYYYMM version header; versions stay active for about a year. */
function linkedInVersion() {
  if (process.env.LINKEDIN_VERSION) return process.env.LINKEDIN_VERSION;
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 2);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function publishLinkedIn(acc: Account, post: { text: string; media_url: string | null }) {
  const token = await freshToken(acc);
  const text = post.media_url ? `${post.text}\n\n${post.media_url}` : post.text; // images aren't uploaded yet; the link is appended
  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "linkedin-version": linkedInVersion(), "x-restli-protocol-version": "2.0.0" },
    body: JSON.stringify({
      author: `urn:li:person:${acc.external_id}`,
      commentary: toLinkedInCommentary(text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) throw new Error(`LinkedIn ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.headers.get("x-restli-id") ?? "posted";
}
