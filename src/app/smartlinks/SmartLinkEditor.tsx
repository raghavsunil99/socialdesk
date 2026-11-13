"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type Link = { id: number; slug: string; title: string; bio: string; theme: string; buttons: { label: string; url: string; clicks: number }[] };

export function SmartLinkEditor({ initial, clicks7d }: { initial: Link; clicks7d: number }) {
  const [l, setL] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const total = l.buttons.reduce((s, b) => s + (b.clicks ?? 0), 0);
  const setBtn = (i: number, patch: Partial<Link["buttons"][number]>) => setL({ ...l, buttons: l.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const save = async () => {
    const r = await fetch("/api/smartlinks", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(l) });
    setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: (await r.json()).error });
    router.refresh();
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">SmartLinks</h1>
          <p className="text-sm text-muted-foreground">Your link-in-bio page. Public at <a className="text-brand underline" href={`/l/${l.slug}`} target="_blank">/l/{l.slug}</a> · {total} clicks total · {clicks7d} in the last 7 days</p>
        </div>
        <div className="card space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Title<input value={l.title} onChange={(e) => setL({ ...l, title: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-1.5" /></label>
            <label className="text-sm">URL slug<input value={l.slug} onChange={(e) => setL({ ...l, slug: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-1.5" /></label>
          </div>
          <label className="block text-sm">Bio<input value={l.bio} onChange={(e) => setL({ ...l, bio: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-1.5" /></label>
          <label className="flex items-center gap-2 text-sm">Background<input type="color" value={l.theme} onChange={(e) => setL({ ...l, theme: e.target.value })} /></label>
        </div>
        <div className="card space-y-2 p-4">
          <div className="text-sm font-semibold">Buttons</div>
          {l.buttons.map((b, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto_auto]">
              <input value={b.label} onChange={(e) => setBtn(i, { label: e.target.value })} placeholder="Label" className="rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="Button label" />
              <input value={b.url} onChange={(e) => setBtn(i, { url: e.target.value })} placeholder="https://…" className="rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="Button URL" />
              <span className="self-center text-xs text-muted-foreground">{b.clicks ?? 0} clicks</span>
              <button onClick={() => setL({ ...l, buttons: l.buttons.filter((_, j) => j !== i) })} className="text-xs text-muted-foreground hover:text-bad">Remove</button>
            </div>
          ))}
          <button onClick={() => setL({ ...l, buttons: [...l.buttons, { label: "New link", url: "https://", clicks: 0 }] })} className="text-sm text-brand">+ Add button</button>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={save} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Save</button>
          {msg && <span className={`text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</span>}
        </div>
      </div>
      <div className="mx-auto w-full max-w-[320px]">
        <div className="text-xs text-muted-foreground">Preview</div>
        <div className="mt-1 rounded-[2rem] border-8 border-ink p-5 text-center text-white" style={{ background: l.theme, minHeight: 520 }}>
          <div className="mx-auto mt-4 grid h-16 w-16 place-items-center rounded-full bg-white/20 text-2xl font-bold">{l.title[0]}</div>
          <div className="mt-3 font-bold">{l.title}</div>
          <div className="text-xs opacity-80">{l.bio}</div>
          <div className="mt-5 space-y-2">{l.buttons.map((b, i) => <div key={i} className="rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-ink">{b.label}</div>)}</div>
        </div>
      </div>
    </div>
  );
}
