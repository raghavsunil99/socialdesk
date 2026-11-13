"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PostCard, type PostView } from "@/components/PostCard";

export function AddCompetitor({ network }: { network: string }) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card flex flex-wrap items-center gap-2 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        const r = await fetch("/api/competitors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ network, handle }) });
        setBusy(false);
        if (!r.ok) return setError((await r.json()).error);
        setHandle("");
        router.refresh();
      }}
    >
      <label htmlFor="comp" className="text-sm font-medium">Track {network === "youtube" ? "a YouTube channel" : "an Instagram account"}</label>
      <input id="comp" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={network === "youtube" ? "@handle or channel link" : "@username (Business/Creator accounts)"} className="min-w-56 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm" />
      <button disabled={busy || !handle.trim()} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Fetching…" : "Track"}</button>
      {error && <p className="w-full text-xs text-bad">{error}</p>}
    </form>
  );
}

export function CompetitorActions({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (method: "POST" | "DELETE") => {
    if (method === "DELETE" && !confirm("Stop tracking this account?")) return;
    setBusy(true);
    const r = await fetch(`/api/competitors/${id}`, { method });
    setBusy(false);
    if (!r.ok) alert((await r.json()).error);
    router.refresh();
  };
  return (
    <span className="flex justify-end gap-3 text-xs">
      <button disabled={busy} onClick={() => act("POST")} className="text-muted-foreground hover:text-brand">{busy ? "…" : "Refresh"}</button>
      <button disabled={busy} onClick={() => act("DELETE")} className="text-muted-foreground hover:text-bad">Remove</button>
    </span>
  );
}

export function TrendingSearch({ network }: { network: string }) {
  const [q, setQ] = useState("");
  const [days, setDays] = useState(7);
  const [shorts, setShorts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PostView[] | null>(null);
  const yt = network === "youtube";
  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="font-semibold">Trending in your niche</h2>
        <p className="text-xs text-muted-foreground">
          {yt
            ? "Most-viewed YouTube videos in India for a keyword, ranked by views per day. Each search uses 100 of YouTube's 10,000 free daily quota units."
            : "Top Instagram posts for a hashtag, ranked by likes + comments per day. Meta allows 30 different hashtags per 7 days per account."}
        </p>
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError(null);
          const qs = new URLSearchParams({ network, q, days: String(days), shorts: shorts ? "1" : "0" });
          const r = await fetch(`/api/trending?${qs}`);
          const j = await r.json();
          setBusy(false);
          if (!r.ok) { setRows(null); return setError(j.error); }
          setRows(j.data);
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={yt ? "e.g. telugu tech, AI tools telugu" : "#hashtag, e.g. #telugutech"} className="min-w-56 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="Keyword or hashtag" />
        {yt && (
          <>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-line px-2 py-1.5 text-sm" aria-label="Published within">
              {[1, 7, 30, 90].map((d) => <option key={d} value={d}>Last {d} day{d > 1 ? "s" : ""}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={shorts} onChange={(e) => setShorts(e.target.checked)} /> Shorts only</label>
          </>
        )}
        <button disabled={busy || !q.trim()} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Searching…" : "Search"}</button>
      </form>
      {error && <p className="text-xs text-bad">{error}</p>}
      {rows && rows.length === 0 && <p className="text-xs text-muted-foreground">Nothing found.</p>}
      {rows && rows.length > 0 && <div className="grid gap-2 lg:grid-cols-2">{rows.map((p) => <PostCard key={p.external_id} p={p} showChannel />)}</div>}
    </section>
  );
}
