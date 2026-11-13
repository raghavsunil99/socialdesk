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
      className="text-xs text-brand hover:underline disabled:text-muted disabled:no-underline"
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
                className="text-muted hover:text-bad"
              >×</button>
            )}
          </span>
        ))}
        {keywords.length === 0 && <span className="text-sm text-muted">No keywords yet.</span>}
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

type Idea = { title: string; hook: string; format: string; why: string; outline: string[] };

export function AiIdeas({ network }: { network: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [saved, setSaved] = useState<Record<number, string>>({});
  return (
    <div className="card space-y-3 border-brand p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">✨ Write me 8 video ideas</div>
          <p className="text-xs text-muted">AI (Gemini) reads everything on this page and suggests specific videos for you, with a hook, an outline and why it should work.</p>
        </div>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true); setError(null);
            const r = await fetch(`/api/ideas/ai?network=${network}`, { method: "POST" });
            const j = await r.json();
            setBusy(false);
            if (!r.ok) return setError(j.error);
            setIdeas(j.data); setSaved({});
          }}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Thinking… (up to a minute)" : ideas ? "Suggest again" : "Suggest ideas"}
        </button>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      {ideas && (
        <ol className="grid gap-3 lg:grid-cols-2">
          {ideas.map((idea, i) => (
            <li key={i} className="rounded-lg border border-line p-3 text-sm">
              <div className="font-semibold">{i + 1}. {idea.title} <span className="ml-1 rounded bg-line px-1.5 text-[10px] font-semibold uppercase text-muted">{idea.format}</span></div>
              <p className="mt-1 text-xs"><b>Hook:</b> {idea.hook}</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted">{idea.outline?.map((b, j) => <li key={j}>{b}</li>)}</ul>
              <p className="mt-1 text-xs text-muted"><b className="text-ink">Why:</b> {idea.why}</p>
              <button
                disabled={!!saved[i]}
                onClick={async () => {
                  const err = await saveDraft(network, idea.title, `Hook: ${idea.hook}\n\n${(idea.outline ?? []).map((b) => `• ${b}`).join("\n")}\n\nWhy: ${idea.why}`);
                  setSaved({ ...saved, [i]: err ?? "✓ Saved as a draft in Planner" });
                }}
                className="mt-2 text-xs text-brand hover:underline disabled:text-muted disabled:no-underline"
              >
                {saved[i] ?? "+ Save to Planner"}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
