import Link from "next/link";
import { currentBrand } from "@/lib/brand";
import { brandGoals, GOAL_LABEL, short, yppStatus, type Goal } from "@/lib/goals";
import { NETWORK_LABEL } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const STATUS: Record<Goal["status"], { label: string; cls: string }> = {
  push: { label: "Push goal hit 🔥", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  done: { label: "Target hit ✓", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  ahead: { label: "Ahead", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  on_track: { label: "On track", cls: "bg-primary/15 text-primary" },
  behind: { label: "Slightly behind", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  off_track: { label: "Off track", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
};
const fmtMonth = (p: string) => new Date(p + "-15").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

function GoalCard({ g }: { g: Goal }) {
  const max = Math.max(g.push, g.actual, 1);
  const pct = (v: number) => `${Math.min(100, Math.max(0, (100 * v) / max))}%`;
  const sub = g.metric === "subscribers";
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">{NETWORK_LABEL[g.account.network]} · {sub ? "net new" : "this month"}</div>
          <div className="text-base font-semibold">{GOAL_LABEL[g.metric]}</div>
        </div>
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS[g.status].cls}`}>{STATUS[g.status].label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">{sub && g.actual > 0 ? "+" : ""}{short(g.actual, g.unit)}{g.unit === "h" ? "h" : ""}</span>
        <span className="text-sm text-muted-foreground">of {sub ? "+" : ""}{short(g.realistic, g.unit)}{g.unit === "h" ? "h" : ""} target</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-muted">
        <div className={`absolute inset-y-0 left-0 rounded-full ${g.status === "off_track" ? "bg-red-500" : g.status === "behind" ? "bg-amber-500" : "bg-primary"}`} style={{ width: pct(Math.max(0, g.actual)) }} />
        <div className="absolute -top-1 h-4.5 w-0.5 bg-foreground/60" style={{ left: pct(g.expected) }} title="where you should be today" />
        <div className="absolute -top-1 h-4.5 w-0.5 bg-foreground" style={{ left: pct(g.realistic) }} title="target" />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>| should be at {short(g.expected, g.unit)}{g.unit === "h" ? "h" : ""} by {g.dataThrough.slice(5)}</span>
        <span>🚀 push {sub ? "+" : ""}{short(g.push, g.unit)}{g.unit === "h" ? "h" : ""}</span>
      </div>
      {g.hint && <p className="rounded-lg bg-muted/60 p-2 text-xs">{g.hint}</p>}
      <div className="text-[11px] text-muted-foreground">{g.daysLeft} days left · now {short(g.perDayNow, g.unit)}/day{g.perDayNeeded > 0 ? ` · need ${short(g.perDayNeeded, g.unit)}/day` : ""}</div>
    </div>
  );
}

export default async function GoalsPage() {
  const brand = await currentBrand();
  const goals = brandGoals(brand.id);
  const ypp = yppStatus(brand.id);
  const period = goals[0]?.period ?? new Date().toISOString().slice(0, 7);
  const byAccount = new Map<number, Goal[]>();
  for (const g of goals) byAccount.set(g.account.id, [...(byAccount.get(g.account.id) ?? []), g]);
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-xl font-bold">{brand.name} · Goals for {fmtMonth(period)}</h1>
        <p className="text-sm text-muted-foreground">Targets are set automatically on the 1st from each account&apos;s last 30 days: <b>target</b> ≈ 10% better than your pace, <b>push</b> ≈ 35–50% better. They stay fixed for the month. YouTube data lags about 2 days.</p>
      </div>

      {ypp.map((y) => (
        <section key={y.account.id} className="card p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {y.account.picture && <img src={y.account.picture} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full" />}
            <div>
              <h2 className="font-semibold">{y.monetized ? "Earnings" : "Monetization progress"} · {y.account.handle}</h2>
              <p className="text-xs text-muted-foreground">{y.monetized ? "YouTube Partner Program: monetized" : "YouTube Partner Program requirements"}{y.eta && !y.monetized ? ` · at the current Shorts pace you'd qualify around ${y.eta}` : ""}</p>
            </div>
          </div>
          {y.monetized ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div><div className="text-xs text-muted-foreground">Revenue, last 30 days</div><div className="text-2xl font-bold">{short(y.revenue30 ?? 0, "₹")}</div>
                {y.revenuePrev30 ? <div className="text-xs text-muted-foreground">{(((y.revenue30! - y.revenuePrev30) / y.revenuePrev30) * 100).toFixed(0)}% vs previous 30 days</div> : null}</div>
              <div><div className="text-xs text-muted-foreground">RPM (per 1,000 views)</div><div className="text-2xl font-bold">₹{(y.rpm30 ?? 0).toFixed(2)}</div></div>
              <div><div className="text-xs text-muted-foreground">Subscribers</div><div className="text-2xl font-bold">{short(y.subs)}</div></div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {y.tiers.map((t) => (
                <div key={t.name} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between"><div className="font-medium">{t.name}</div>{t.done && <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600">Eligible ✓ apply in YouTube Studio</span>}</div>
                  <p className="mb-3 text-xs text-muted-foreground">{t.perks}</p>
                  <div className="space-y-2.5">
                    {t.checks.map((c) => (
                      <div key={c.label}>
                        <div className="flex justify-between text-xs"><span>{c.ok ? "✓ " : ""}{c.label}</span><span className="tabular-nums text-muted-foreground">{short(c.value)} / {short(c.target)}</span></div>
                        <div className="mt-1 h-1.5 rounded-full bg-muted"><div className={`h-1.5 rounded-full ${c.ok ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${Math.min(100, (100 * c.value) / c.target)}%` }} /></div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">{t.paths}</p>
                </div>
              ))}
            </div>
          )}
          {!y.monetized && y.subs >= 1000 && <p className="mt-3 text-xs text-muted-foreground">Already monetized? <Link href="/settings" className="text-primary underline">Reconnect YouTube</Link> to allow revenue access and this card will show earnings, RPM and revenue targets.</p>}
        </section>
      ))}

      {goals.length === 0 && <div className="card p-8 text-center text-sm text-muted-foreground">No live accounts with enough history yet. Targets appear once an account has about a week of data.</div>}
      {[...byAccount.values()].map((gs) => (
        <section key={gs[0].account.id} className="space-y-3">
          <h2 className="flex items-center gap-2 font-semibold">
            {gs[0].account.picture && <img src={gs[0].account.picture} alt="" referrerPolicy="no-referrer" className="size-6 rounded-full" />}
            {NETWORK_LABEL[gs[0].account.network]} · {gs[0].account.handle}
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{gs.map((g) => <GoalCard key={g.metric} g={g} />)}</div>
        </section>
      ))}
    </div>
  );
}
