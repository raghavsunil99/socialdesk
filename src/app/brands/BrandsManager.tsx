"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type BrandRow = { id: number; name: string; timezone: string; role: string; scheduled: number; accounts: { network: string; connector: string; handle: string }[] };

export function BrandsManager({ brands, currentId }: { brands: BrandRow[]; currentId: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async (url: string, init: RequestInit, then?: string) => {
    setBusy(true); setMsg(null);
    const r = await fetch(url, { headers: { "content-type": "application/json" }, ...init });
    setBusy(false);
    if (!r.ok) { setMsg((await r.json()).error); return false; }
    if (then) router.push(then);
    router.refresh();
    return true;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Brands</h1>
        <p className="text-sm text-muted">Each brand has its own connected accounts, planner, competitors, reports and link-in-bio page.</p>
        {msg && <p className="mt-2 text-sm text-bad">{msg}</p>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {brands.map((b) => (
          <div key={b.id} className={`card p-4 ${b.id === currentId ? "border-brand" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{b.name}</div>
                <div className="text-xs text-muted">{b.timezone} · {b.scheduled} upcoming post{b.scheduled === 1 ? "" : "s"} · you&apos;re {b.role}</div>
              </div>
              {b.id === currentId
                ? <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">current</span>
                : <button disabled={busy} onClick={() => call("/api/brands/select", { method: "POST", body: JSON.stringify({ id: b.id }) }, "/analytics")} className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white">Switch</button>}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {b.accounts.length === 0 && <span className="text-xs text-muted">No accounts connected</span>}
              {b.accounts.map((a) => (
                <span key={a.network} className={`rounded px-2 py-0.5 text-xs ${a.connector === "live" ? "bg-emerald-100 text-emerald-800" : "bg-line text-muted"}`}>
                  {a.network} {a.connector === "live" ? `@${a.handle}` : "· demo"}
                </span>
              ))}
            </div>
            {b.role === "owner" && <div className="mt-3 flex gap-3 text-xs">
              {b.accounts.length < 5 && (
                <button disabled={busy} onClick={() => call(`/api/brands/${b.id}`, { method: "POST", body: JSON.stringify({ action: "demo" }) })} className="text-brand hover:underline">Fill unconnected networks with demo data</button>
              )}
              <button
                disabled={busy}
                onClick={() => {
                  if (confirm(`Delete "${b.name}" and all its data (accounts, history, scheduled posts, link page)? This can't be undone.`))
                    call(`/api/brands/${b.id}`, { method: "DELETE" });
                }}
                className="ml-auto text-muted hover:text-bad"
              >
                Delete brand
              </button>
            </div>}
          </div>
        ))}
      </div>

      <NewBrandForm />
    </div>
  );
}

export function NewBrandForm() {
  const [name, setName] = useState("");
  const [tz, setTz] = useState("Asia/Kolkata");
  const [demo, setDemo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
        className="card space-y-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setMsg(null);
          const r = await fetch("/api/brands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, timezone: tz, demo }) });
          setBusy(false);
          if (!r.ok) return setMsg((await r.json()).error);
          window.location.href = "/settings";
        }}
      >
        <div className="font-semibold">Add a brand</div>
        <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. a new YouTube channel" className="rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="Brand name" />
          <select value={tz} onChange={(e) => setTz(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-sm" aria-label="Timezone">
            {["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"].map((z) => <option key={z}>{z}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> Start with demo data (replace it later by connecting real accounts)</label>
        <div className="flex items-center gap-3">
          <button disabled={busy || !name.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create brand</button>
          {msg && <span className="text-sm text-bad">{msg}</span>}
        </div>
      </form>
  );
}
