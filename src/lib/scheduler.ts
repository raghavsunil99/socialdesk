import "server-only";
import { db } from "./db";
import { getAccount } from "./metrics";
import { PUBLISH, SYNC } from "./connectors";
import type { PostMeta } from "./posts";

type Due = { id: number; brand_id: number; networks: string; text: string; media_url: string | null; media_type: string; format: string | null; meta: string | null };

/** YouTube gets title/description/tags; other networks get the shared caption. */
function postFor(network: string, p: Due) {
  const m = (p.meta ? JSON.parse(p.meta) : {}) as PostMeta;
  const base = { text: p.text, media_url: p.media_url, media_type: p.media_type, format: p.format };
  if (network !== "youtube" || !m.title) return base;
  const tags = (m.hashtags ?? []).map((h) => (h.startsWith("#") ? h : "#" + h)).join(" ");
  return { ...base, title: m.title, description: [m.description, tags].filter(Boolean).join("\n\n"), tags: m.tags ?? [] };
}

/** Publish one claimed-or-claimable post to all its networks and record the result per network. */
async function publishRow(p: Due) {
  const d = db();
  // claim it so two ticks never publish twice
    const claimed = d.prepare("UPDATE scheduled_posts SET status = 'publishing' WHERE id = ? AND status = 'scheduled'").run(p.id);
    if (claimed.changes === 0) return null;
    const result: Record<string, { ok: boolean; id?: string; error?: string; simulated?: boolean }> = {};
    for (const network of JSON.parse(p.networks) as string[]) {
      const acc = getAccount(p.brand_id, network);
      try {
        if (!acc) throw new Error("no account connected");
        if (acc.connector === "demo") result[network] = { ok: true, simulated: true };
        else if (PUBLISH[network]) result[network] = { ok: true, id: await PUBLISH[network](acc, postFor(network, p)) };
        else throw new Error(`publishing to ${network} is not implemented yet`);
      } catch (e) {
        result[network] = { ok: false, error: (e as Error).message };
      }
    }
    const ok = Object.values(result).every((r) => r.ok);
    d.prepare("UPDATE scheduled_posts SET status = ?, result = ? WHERE id = ?").run(ok ? "published" : "failed", JSON.stringify(result), p.id);
    return { ok, result };
}

/** "Post now": publish one post immediately instead of waiting for the next scheduler tick. */
export async function publishNow(id: number, brandId: number) {
  const p = db().prepare("SELECT * FROM scheduled_posts WHERE id = ? AND brand_id = ? AND status = 'scheduled'").get(id, brandId) as Due | undefined;
  if (!p) return null;
  return publishRow(p);
}

/** Publish every scheduled post whose time has come. Demo accounts are marked published without calling any network. */
export async function publishDue() {
  const due = db()
    .prepare("SELECT * FROM scheduled_posts WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 20")
    .all(new Date().toISOString()) as Due[];
  for (const p of due) await publishRow(p);
  return due.length;
}

/** Keep a daily history like Metricool: re-sync every live account that hasn't synced in 6 hours. */
export async function syncStale() {
  const stale = db()
    .prepare("SELECT brand_id, network FROM accounts WHERE connector = 'live' AND (last_sync IS NULL OR last_sync < datetime('now', '-6 hours'))")
    .all() as { brand_id: number; network: string }[];
  for (const { brand_id, network } of stale) {
    const acc = getAccount(brand_id, network);
    const run = SYNC[network];
    if (acc && run) await run(acc).catch((e) => console.error(`[sync] ${network}:`, (e as Error).message));
  }
}

/** Keep competitor stats fresh: refresh anything older than 12 hours (a few per tick to stay inside API quotas). */
export async function refreshStaleCompetitors() {
  const { refreshCompetitor } = await import("./competitors");
  const rows = db().prepare("SELECT id FROM competitors WHERE handle NOT LIKE 'demo%' AND (updated_at IS NULL OR updated_at < datetime('now', '-12 hours')) LIMIT 5").all() as { id: number }[];
  for (const r of rows) await refreshCompetitor(r.id).catch(() => { /* error is stored on the row */ });
}

const g = globalThis as unknown as { __sched?: NodeJS.Timeout; __sync?: NodeJS.Timeout };
export function startScheduler() {
  if (g.__sched) return;
  g.__sched = setInterval(() => publishDue().catch((e) => console.error("[scheduler]", e)), 30_000);
  g.__sync = setInterval(() => { syncStale().catch((e) => console.error("[sync]", e)); refreshStaleCompetitors().catch((e) => console.error("[competitors]", e)); }, 15 * 60_000);
  console.log("[scheduler] publishing every 30s, syncing live accounts every 6h");
}
