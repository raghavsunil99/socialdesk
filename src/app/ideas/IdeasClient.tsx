"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Saves an idea as a draft in the Planner (tomorrow 10:00), with where it came from. */
async function saveDraft(network: string, title: string, notes: string) {
  const at = new Date();
  at.setDate(at.getDate() + 1);
  at.setHours(10, 0, 0, 0);
  const r = await fetch("/api/v2/scheduler/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ networks: [network], text: `${title}\n\n${notes}`.trim(), scheduled_at: at.toISOString(), status: "draft" }),
  });
  return r.ok ? null : ((await r.json()).error as string);
}

export function SaveIdea({ title, source, from }: { title: string; source: string; from: string }) {
  const [state, setState] = useState<"idle" | "busy" | "saved" | string>("idle");
  return (
    <button
      disabled={state === "busy" || state === "saved"}
      onClick={async () => {
        setState("busy");
        const net = source.includes("youtube.com") ? "youtube" : "instagram";
        const err = await saveDraft(net, `💡 Idea: ${title}`, `Inspired by ${from}: ${source}\n(Remix the topic in your own style.)`);
        setState(err ?? "saved");
      }}
      className="text-xs text-brand hover:underline disabled:text-muted-foreground disabled:no-underline"
    >
      {state === "saved" ? "✓ Saved as a draft in Planner" : state === "busy" ? "Saving…" : state === "idle" ? "+ Save idea to Planner" : state}
    </button>
  );
}

export function KeywordChips({ network, keywords, canEdit }: { network: string; keywords: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [kw, setKw] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {keywords.map((k) => (
          <span key={k} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm">
            {k}
            {canEdit && (
              <button
                aria-label={`Remove ${k}`}
                onClick={async () => { await fetch(`/api/ideas/keywords?network=${network}&keyword=${encodeURIComponent(k)}`, { method: "DELETE" }); router.refresh(); }}
                className="text-muted-foreground hover:text-bad"
              >×</button>
            )}
          </span>
        ))}
        {keywords.length === 0 && <span className="text-sm text-muted-foreground">No keywords yet.</span>}
      </div>
      {canEdit && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const r = await fetch("/api/ideas/keywords", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ network, keyword: kw }) });
            if (!r.ok) return setError((await r.json()).error);
            setKw("");
            router.refresh();
          }}
        >
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder={network === "youtube" ? "e.g. AI telugu, govt schemes telugu" : "e.g. #telugutech"} className="min-w-56 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="New keyword" />
          <button disabled={!kw.trim()} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Add keyword</button>
          {error && <p className="w-full text-xs text-bad">{error}</p>}
        </form>
      )}
    </div>
  );
}

export function RefreshTrends({ network }: { network: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => { setBusy(true); await fetch(`/api/ideas/refresh?network=${network}`, { method: "POST" }); setBusy(false); router.refresh(); }}
      className="rounded-lg border border-line px-3 py-1 text-xs hover:border-brand disabled:opacity-50"
    >
      {busy ? "Checking…" : "Refresh now"}
    </button>
  );
}

type Idea = { id: number; format: "short" | "long"; title: string; hook: string; why: string; outline: string[]; vote: number };

function IdeaCard({ idea, network, canWrite }: { idea: Idea; network: string; canWrite: boolean }) {
  const router = useRouter();
  const [vote, setVote] = useState(idea.vote);
  const [saved, setSaved] = useState<string | null>(null);
  const cast = async (v: number) => {
    const next = vote === v ? 0 : v; // clicking again clears the vote
    setVote(next);
    await fetch(`/api/ideas/ai/${idea.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ vote: next }) });
    router.refresh();
  };
  return (
    <li className={`rounded-lg border p-3 text-sm ${vote > 0 ? "border-good" : "border-line"} ${vote < 0 ? "opacity-50" : ""}`}>
      <div className="font-semibold">{idea.title}</div>
      {idea.hook && <p className="mt-1 text-xs"><b>Hook:</b> {idea.hook}</p>}
      {idea.outline.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{idea.outline.map((b, j) => <li key={j}>{b}</li>)}</ul>}
      {idea.why && <p className="mt-1 text-xs text-muted-foreground"><b className="text-ink">Why:</b> {idea.why}</p>}
      <div className="mt-2 flex items-center gap-3 text-xs">
        {canWrite && (
          <>
            <button onClick={() => cast(1)} aria-pressed={vote > 0} title="More like this" className={`rounded-md border px-2 py-0.5 ${vote > 0 ? "border-good bg-emerald-100 text-good" : "border-line hover:border-good"}`}>👍</button>
            <button onClick={() => cast(-1)} aria-pressed={vote < 0} title="Less like this" className={`rounded-md border px-2 py-0.5 ${vote < 0 ? "border-bad bg-red-100 text-bad" : "border-line hover:border-bad"}`}>👎</button>
            <button
              disabled={!!saved}
              onClick={async () => {
                const err = await saveDraft(network, idea.title, `Format: ${idea.format === "long" ? "Long video" : "Short"}\nHook: ${idea.hook}\n\n${idea.outline.map((b) => `• ${b}`).join("\n")}\n\nWhy: ${idea.why}`);
                setSaved(err ?? "✓ Saved to Planner");
              }}
              className="ml-auto text-brand hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              {saved ?? "+ Save to Planner"}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function Column({ title, sub, ideas, network, canWrite }: { title: string; sub: string; ideas: Idea[]; network: string; canWrite: boolean }) {
  const active = ideas.filter((i) => i.vote >= 0);
  const disliked = ideas.filter((i) => i.vote < 0);
  return (
    <div className="space-y-2">
      <div><div className="font-semibold">{title} <span className="text-xs font-normal text-muted-foreground">({active.length})</span></div><div className="text-xs text-muted-foreground">{sub}</div></div>
      {active.length === 0 && <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted-foreground">No ideas yet.</p>}
      <ol className="space-y-2">{active.map((i) => <IdeaCard key={i.id} idea={i} network={network} canWrite={canWrite} />)}</ol>
      {disliked.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">{disliked.length} disliked (used to avoid similar ideas)</summary>
          <ol className="mt-2 space-y-2">{disliked.map((i) => <IdeaCard key={i.id} idea={i} network={network} canWrite={canWrite} />)}</ol>
        </details>
      )}
    </div>
  );
}

export function AiIdeas({ network, ideas, usage, canWrite }: { network: string; ideas: Idea[]; usage: { used: number; limit: number }; canWrite: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = usage.limit - usage.used;
  const votes = ideas.filter((i) => i.vote !== 0).length;
  return (
    <div className="card space-y-4 border-brand p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">✨ AI video ideas</div>
          <p className="text-xs text-muted-foreground">
            Saved here, so opening this page never uses AI credits. Rate ideas with 👍 / 👎 and the next batch follows your taste
            {votes > 0 ? ` (${votes} rated so far)` : ""}.
          </p>
        </div>
        {canWrite && (
          <div className="text-right">
            <button
              disabled={busy || left <= 0}
              onClick={async () => {
                setBusy(true); setError(null);
                const r = await fetch(`/api/ideas/ai?network=${network}`, { method: "POST" });
                const j = await r.json();
                setBusy(false);
                if (!r.ok) setError(j.error);
                router.refresh();
              }}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Thinking…" : ideas.length ? "Suggest 7 more" : "Suggest ideas"}
            </button>
            <a href="/ai-usage" className="mt-1 block text-[11px] text-muted-foreground hover:text-brand">1 AI call · {Math.max(0, left)} of {usage.limit} left today · usage →</a>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Column title="📱 Shorts" sub="Under 60 seconds, one sharp point" ideas={ideas.filter((i) => i.format === "short")} network={network} canWrite={canWrite} />
        <Column title="🎬 Long videos" sub="6–12 minute explainers and tutorials" ideas={ideas.filter((i) => i.format === "long")} network={network} canWrite={canWrite} />
      </div>
    </div>
  );
}
