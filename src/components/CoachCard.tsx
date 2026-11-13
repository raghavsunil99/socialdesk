"use client";
import { useState } from "react";
import Link from "next/link";
import { Flame, Sparkles } from "lucide-react";
import type { CoachState } from "@/lib/coach";

export function CoachCard({ s, canAsk }: { s: CoachState; canAsk: boolean }) {
  const [tip, setTip] = useState(s.tip);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = async () => {
    setBusy(true); setError(null);
    const r = await fetch("/api/coach", { method: "POST" });
    const j = await r.json();
    setBusy(false);
    if (r.ok) setTip(j.data); else setError(j.error);
  };
  return (
    <div className="card flex flex-wrap items-center gap-x-6 gap-y-4 p-4">
      <div className="flex items-center gap-3">
        <div className={`flex size-12 items-center justify-center rounded-xl ${s.streak ? "bg-orange-500/15 text-orange-500" : "bg-muted text-muted-foreground"}`}><Flame className="size-6" /></div>
        <div>
          <div className="text-2xl font-bold leading-none tabular-nums">{s.streak}<span className="ml-1 text-sm font-medium text-muted-foreground">day streak</span></div>
          <div className="mt-1 text-xs text-muted-foreground">{s.thisWeek}/{s.goal} days posted this week</div>
        </div>
      </div>
      <div className="flex gap-1">
        {s.week.map((w) => (
          <div key={w.day} className="flex flex-col items-center gap-1">
            <div className={`size-6 rounded-md ${w.posted ? "bg-primary" : w.today ? "border-2 border-dashed border-primary/60" : "bg-muted"}`} title={w.posted ? "posted" : ""} />
            <span className={`text-[10px] ${w.today ? "font-semibold" : "text-muted-foreground"}`}>{w.day[0]}</span>
          </div>
        ))}
      </div>
      <div className="min-w-[16rem] flex-1 space-y-1.5 text-sm">
        <p className="font-medium">{s.nudge}</p>
        {s.goalLine && <p className="text-xs"><Link href="/goals" className="text-primary hover:underline">🎯 {s.goalLine}</Link></p>}
        {s.idea && <p className="text-xs text-muted-foreground">Idea to record: <Link href="/ideas" className="text-primary hover:underline">{s.idea.title}</Link> <span>({s.idea.format})</span></p>}
        {tip && <p className="whitespace-pre-wrap rounded-lg bg-muted/60 p-2 text-xs">{tip}</p>}
        {error && <p className="text-xs text-bad">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <Link href="/planner?new=1" className="rounded-lg bg-primary px-3 py-1.5 text-center text-sm font-semibold text-primary-foreground">+ Create post</Link>
        {canAsk && !tip && <button onClick={ask} disabled={busy} className="flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50"><Sparkles className="size-3.5" />{busy ? "Thinking…" : "Coach me (1 credit)"}</button>}
      </div>
    </div>
  );
}
