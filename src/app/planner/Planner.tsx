"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScheduledPost } from "@/lib/posts";

type Acc = { network: string; handle: string; connector: string };
type Cell = { dow: number; hour: number; value: number };

const LABEL: Record<string, string> = { instagram: "IG", facebook: "FB", youtube: "YT", tiktok: "TT", linkedin: "IN", x: "X" };
const LIMIT: Record<string, number> = { instagram: 2200, facebook: 63206, youtube: 5000, tiktok: 2200, linkedin: 3000, x: 280 };
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-line text-muted",
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
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

type Draft = { id?: number; networks: string[]; text: string; media_url: string; media_type: string; when: string; status: string; result?: ScheduledPost["result"] };

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
    setDraft({ networks: [heatNet], text: "", media_url: "", media_type: "IMAGE", when: toLocalInput(at), status: canSchedule ? "scheduled" : "pending_approval" });
  };
  const openEdit = (p: ScheduledPost) =>
    setDraft({ id: p.id, networks: p.networks, text: p.text, media_url: p.media_url ?? "", media_type: p.media_type, when: toLocalInput(new Date(p.scheduled_at)), status: p.status, result: p.result });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Planner</h1>
          <p className="text-sm text-muted">{canWrite ? "Click any slot to schedule." : "Read-only (viewer role)."} Shading = when your {heatNet} audience is most active; ★ = top 3 slots.</p>
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
              <div key={d.toISOString()} className={`border-b border-l border-line px-2 py-2 text-center text-xs ${today ? "font-bold text-brand" : "text-muted"}`}>
                {d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </div>
            );
          })}
          {HOURS.map((h) => (
            <div key={h} className="contents">
              <div className="border-b border-line pr-2 pt-1 text-right text-[10px] text-muted">{String(h).padStart(2, "0")}:00</div>
              {days.map((d) => {
                const slotPosts = posts.filter((p) => { const t = new Date(p.scheduled_at); return t.toDateString() === d.toDateString() && t.getHours() === h; });
                const star = top3.has(`${((d.getDay() + 6) % 7) + 1}-${h}`);
                return (
                  <div
                    key={d.toISOString() + h}
                    onClick={() => openNew(d, h)}
                    className="relative min-h-10 cursor-pointer border-b border-l border-line p-0.5 hover:outline hover:outline-1 hover:outline-brand"
                    style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(heatAt(d, h) * 28)}%, transparent)` }}
                  >
                    {star && <span className="absolute right-1 top-0.5 text-[10px] text-accent">★</span>}
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

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {Object.entries(STATUS_STYLE).map(([k, v]) => <span key={k} className={`rounded px-2 py-0.5 ${v}`}>{k.replace("_", " ")}</span>)}
        <span>Posts at a past time are published by the scheduler within 30 seconds.</span>
      </div>

      {draft && <Composer canSchedule={canSchedule} canWrite={canWrite} accounts={accounts} draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); load(); }} />}
    </div>
  );
}

function Composer({ accounts, draft: initial, onClose, onSaved, canSchedule, canWrite }: { accounts: Acc[]; draft: Draft; onClose: () => void; onSaved: () => void; canSchedule: boolean; canWrite: boolean }) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idea, setIdea] = useState("");
  const [ai, setAi] = useState<{ busy: boolean; options: string[]; error?: string }>({ busy: false, options: [] });
  const locked = !canWrite || d.status === "published" || d.status === "publishing" || (!canSchedule && d.status === "scheduled");

  const save = async (status: string) => {
    setBusy(true); setError(null);
    const body = { networks: d.networks, text: d.text, media_url: d.media_url, media_type: d.media_type, scheduled_at: new Date(d.when).toISOString(), status };
    const r = await fetch(d.id ? `/api/v2/scheduler/posts/${d.id}` : "/api/v2/scheduler/posts", { method: d.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) onSaved(); else setError((await r.json()).error);
  };
  const remove = async () => {
    if (!d.id || !confirm("Delete this post?")) return;
    await fetch(`/api/v2/scheduler/posts/${d.id}`, { method: "DELETE" });
    onSaved();
  };
  const suggest = async () => {
    setAi({ busy: true, options: [] });
    const r = await fetch("/api/ai/caption", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idea, networks: d.networks, draft: d.text }) });
    const j = await r.json();
    setAi(r.ok ? { busy: false, options: j.data } : { busy: false, options: [], error: j.error });
  };

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-3xl p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Post editor">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{d.id ? "Edit post" : "New post"}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">✕</button>
        </div>
        <div className="grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {accounts.map((a) => {
                const on = d.networks.includes(a.network);
                return (
                  <button key={a.network} disabled={locked} onClick={() => setD({ ...d, networks: on ? d.networks.filter((n) => n !== a.network) : [...d.networks, a.network] })}
                    className={`rounded-full border px-3 py-1 text-sm ${on ? "border-brand bg-brand text-white" : "border-line text-muted"}`}>
                    {a.network}{a.connector === "demo" ? " (demo)" : ""}
                  </button>
                );
              })}
            </div>
            <textarea value={d.text} disabled={locked} onChange={(e) => setD({ ...d, text: e.target.value })} rows={9} placeholder="Write your caption…" className="w-full rounded-lg border border-line p-3 text-sm outline-brand" />
            <div className="flex flex-wrap gap-3 text-xs text-muted">
              {d.networks.map((n) => <span key={n} className={d.text.length > LIMIT[n] ? "font-semibold text-bad" : ""}>{n}: {d.text.length}/{LIMIT[n]}</span>)}
              <span>{(d.text.match(/#\w+/g) ?? []).length} hashtags</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input value={d.media_url} disabled={locked} onChange={(e) => setD({ ...d, media_url: e.target.value })} placeholder="Public image/video URL (required for Instagram)" className="rounded-lg border border-line px-3 py-2 text-sm" />
              <select value={d.media_type} disabled={locked} onChange={(e) => setD({ ...d, media_type: e.target.value })} className="rounded-lg border border-line px-2 py-2 text-sm" aria-label="Media type">
                <option value="IMAGE">Image post</option><option value="REELS">Reel / video</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">When
              <input type="datetime-local" value={d.when} disabled={locked} onChange={(e) => setD({ ...d, when: e.target.value })} className="rounded-lg border border-line px-2 py-1.5" />
            </label>
            {d.result && <pre className="overflow-x-auto rounded-lg bg-bg p-2 text-xs">{JSON.stringify(d.result, null, 1)}</pre>}
            {error && <p className="text-sm text-bad">{error}</p>}
            {!locked && (
              <div className="flex flex-wrap gap-2 pt-1">
                {canSchedule && <button disabled={busy} onClick={() => save("scheduled")} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{d.status === "pending_approval" ? "Approve & schedule" : "Schedule"}</button>}
                <button disabled={busy} onClick={() => save("pending_approval")} className="rounded-lg border border-line px-4 py-2 text-sm">Send for approval</button>
                <button disabled={busy} onClick={() => save("draft")} className="rounded-lg border border-line px-4 py-2 text-sm">Save draft</button>
                {d.id && <button onClick={remove} className="ml-auto rounded-lg px-3 py-2 text-sm text-bad hover:bg-red-50">Delete</button>}
              </div>
            )}
          </div>
          <aside className="space-y-2 rounded-lg bg-bg p-3">
            <div className="text-sm font-semibold">✨ Caption assistant</div>
            <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={3} placeholder="e.g. Carousel: 5 SQL interview questions, Telugu, CTA comment LINK" className="w-full rounded-lg border border-line p-2 text-xs" />
            <button onClick={suggest} disabled={ai.busy || locked} className="w-full rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {ai.busy ? "Writing…" : d.text ? "Improve my draft" : "Suggest captions"}
            </button>
            {ai.error && <p className="text-xs text-bad">{ai.error}</p>}
            {ai.options.map((o, i) => (
              <button key={i} onClick={() => setD({ ...d, text: o })} className="block w-full whitespace-pre-wrap rounded-lg border border-line bg-surface p-2 text-left text-xs hover:border-brand">{o}</button>
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}
