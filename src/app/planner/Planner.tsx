"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Format, PostMeta, ScheduledPost } from "@/lib/posts";
import { Composer } from "./Composer";

export type Acc = { network: string; handle: string; connector: string };
type Cell = { dow: number; hour: number; value: number };

const LABEL: Record<string, string> = { instagram: "IG", facebook: "FB", youtube: "YT", tiktok: "TT", linkedin: "IN", x: "X" };
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-line text-muted-foreground",
  pending_approval: "bg-amber-100 text-amber-800",
  scheduled: "bg-brand-soft text-brand",
  publishing: "bg-brand-soft text-brand",
  published: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
};
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00 – 23:00

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export type Draft = { id?: number; networks: string[]; text: string; media_url: string; media_type: string; when: string; status: string; result?: ScheduledPost["result"]; format: Format; meta: PostMeta };

export function Planner({ accounts, best, role }: { accounts: Acc[]; best: Record<string, Cell[]>; role: string }) {
  const canWrite = role !== "viewer";
  const canSchedule = role === "editor" || role === "owner";
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [heatNet, setHeatNet] = useState(accounts[0]?.network ?? "instagram");
  const [draft, setDraft] = useState<Draft | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(week.getTime() + i * 864e5)), [week]);
  const load = useCallback(async () => {
    const end = new Date(week.getTime() + 7 * 864e5);
    const r = await fetch(`/api/v2/scheduler/posts?start=${week.toISOString()}&end=${end.toISOString()}`);
    setPosts((await r.json()).data);
  }, [week]);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const heat = best[heatNet] ?? [];
  const heatMax = Math.max(1, ...heat.map((c) => c.value));
  const heatAt = (d: Date, h: number) => (heat.find((c) => c.dow === ((d.getDay() + 6) % 7) + 1 && c.hour === h)?.value ?? 0) / heatMax;
  const top3 = new Set([...heat].sort((a, b) => b.value - a.value).slice(0, 3).map((c) => `${c.dow}-${c.hour}`));

  const openNew = (d: Date, h: number) => {
    if (!canWrite) return;
    const at = new Date(d);
    at.setHours(h, 0, 0, 0);
    if (at < new Date()) at.setTime(Date.now() + 3600e3);
    const shortNets = accounts.map((a) => a.network).filter((n) => ["youtube", "instagram", "facebook"].includes(n));
    setDraft({ networks: shortNets.length ? shortNets : [heatNet], text: "", media_url: "", media_type: "REELS", when: toLocalInput(at), status: canSchedule ? "scheduled" : "pending_approval", format: "short", meta: {} });
  };
  const openEdit = (p: ScheduledPost) =>
    setDraft({ id: p.id, networks: p.networks, text: p.text, media_url: p.media_url ?? "", media_type: p.media_type, when: toLocalInput(new Date(p.scheduled_at)), status: p.status, result: p.result, format: p.format ?? (p.media_type === "REELS" ? "short" : "post"), meta: p.meta ?? {} });

  // "+ Create post" from the coach card opens the composer straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new")) { openNew(new Date(), new Date().getHours() + 1); window.history.replaceState(null, "", "/planner"); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Planner</h1>
          <p className="text-sm text-muted-foreground">{canWrite ? "Click any slot to schedule." : "Read-only (viewer role)."} Shading = when your {heatNet} audience is most active; ★ = top 3 slots.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={heatNet} onChange={(e) => setHeatNet(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" aria-label="Best times for network">
            {accounts.map((a) => <option key={a.network} value={a.network}>Best times: {a.network}</option>)}
          </select>
          <div className="flex rounded-lg border border-line bg-surface text-sm">
            <button className="px-3 py-1.5 hover:text-brand" onClick={() => setWeek(new Date(week.getTime() - 7 * 864e5))} aria-label="Previous week">←</button>
            <button className="border-x border-line px-3 py-1.5 hover:text-brand" onClick={() => setWeek(startOfWeek(new Date()))}>Today</button>
            <button className="px-3 py-1.5 hover:text-brand" onClick={() => setWeek(new Date(week.getTime() + 7 * 864e5))} aria-label="Next week">→</button>
          </div>
          {canWrite && <button className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white" onClick={() => openNew(new Date(), new Date().getHours() + 1)}>+ New post</button>}
        </div>
      </div>

      {accounts.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          This brand has no connected accounts yet, so there&apos;s nowhere to publish. Connect one in <a href="/settings" className="underline">Settings</a>.
        </div>
      )}
      <div className="card overflow-x-auto">
        <div className="grid min-w-[860px]" style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))" }}>
          <div />
          {days.map((d) => {
            const today = d.toDateString() === new Date().toDateString();
            return (
              <div key={d.toISOString()} className={`border-b border-l border-line px-2 py-2 text-center text-xs ${today ? "font-bold text-brand" : "text-muted-foreground"}`}>
                {d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </div>
            );
          })}
          {HOURS.map((h) => (
            <div key={h} className="contents">
              <div className="border-b border-line pr-2 pt-1 text-right text-[10px] text-muted-foreground">{String(h).padStart(2, "0")}:00</div>
              {days.map((d) => {
                const slotPosts = posts.filter((p) => { const t = new Date(p.scheduled_at); return t.toDateString() === d.toDateString() && t.getHours() === h; });
                const star = top3.has(`${((d.getDay() + 6) % 7) + 1}-${h}`);
                return (
                  <div
                    key={d.toISOString() + h}
                    onClick={() => openNew(d, h)}
                    className="relative min-h-10 cursor-pointer border-b border-l border-line p-0.5 hover:outline hover:outline-1 hover:outline-brand"
                    style={{ background: `color-mix(in srgb, var(--chart-2) ${Math.round(heatAt(d, h) * 28)}%, transparent)` }}
                  >
                    {star && <span className="absolute right-1 top-0.5 text-[10px] text-chart-2">★</span>}
                    {slotPosts.map((p) => (
                      <button key={p.id} onClick={(e) => { e.stopPropagation(); openEdit(p); }} className={`mb-0.5 block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] ${STATUS_STYLE[p.status]}`} title={p.text}>
                        <b>{new Date(p.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b> {p.networks.map((n) => LABEL[n]).join("·")} {p.text}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {Object.entries(STATUS_STYLE).map(([k, v]) => <span key={k} className={`rounded px-2 py-0.5 ${v}`}>{k.replace("_", " ")}</span>)}
        <span>Posts at a past time are published by the scheduler within 30 seconds.</span>
      </div>

      {draft && <Composer canSchedule={canSchedule} canWrite={canWrite} accounts={accounts} draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); load(); }} />}
    </div>
  );
}
