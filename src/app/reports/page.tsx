import { bestTimes, contentList, listAccounts, NETWORK_LABEL, periodFromDays, summary, timeline } from "@/lib/metrics";
import { fmt, Heatmap, Kpi, LineChart } from "@/components/charts";
import { PeriodPicker, readDays } from "@/components/PeriodPicker";
import { PrintButton } from "@/components/PrintButton";
import { currentBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const days = readDays(sp);
  const { from, to } = periodFromDays(days);
  const brand = await currentBrand();
  const selected = new Set((sp.networks ?? "").split(",").filter(Boolean));
  const accounts = listAccounts(brand.id).filter((a) => selected.size === 0 || selected.has(a.network));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Pick a period, then use “Save as PDF” in the print dialog.</p>
        <div className="flex gap-2"><PeriodPicker days={days} base="/reports" /><PrintButton /></div>
      </div>

      <header className="card p-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand">Social media report</div>
        <h1 className="mt-1 text-2xl font-bold">{brand.name}</h1>
        <p className="text-sm text-muted">{new Date(from).toLocaleDateString("en-IN", { dateStyle: "long" })} – {new Date(to).toLocaleDateString("en-IN", { dateStyle: "long" })} · compared with the previous {days} days</p>
      </header>

      {accounts.map((a) => {
        const s = summary(a.id, from, to);
        const top = contentList(a.id, from, to).sort((x, y) => y.engagement * Math.sqrt(y.reach) - x.engagement * Math.sqrt(x.reach)).slice(0, 5);
        const net = s.gained.value - s.lost.value;
        return (
          <section key={a.id} className="card space-y-4 p-6">
            <h2 className="text-lg font-bold">{NETWORK_LABEL[a.network]} <span className="text-sm font-normal text-muted">@{a.handle}{a.connector === "demo" ? " · demo data" : ""}</span></h2>
            <p className="text-sm">
              {a.network === "youtube" ? "Subscribers" : "Followers"} {net >= 0 ? "grew" : "fell"} by <b>{fmt(Math.abs(net))}</b> to <b>{fmt(s.followers.value)}</b>.
              Accounts reached: <b>{fmt(s.reach.value)}</b>. {fmt(s.posts.value + s.reels.value)} pieces of content drew <b>{fmt(s.interactions.value)}</b> interactions.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Followers" {...s.followers} />
              <Kpi label="Reach" {...s.reach} />
              <Kpi label="Interactions" {...s.interactions} />
              <Kpi label="Post engagement" {...s.postEngagement} digits={2} suffix="%" />
            </div>
            <LineChart series={timeline(a.id, "account", "followers", from, to)} height={140} label="followers" />
            {top.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-semibold">Top content</div>
                <ol className="space-y-1.5 text-sm">
                  {top.map((c) => (
                    <li key={c.id} className="flex gap-3 border-t border-line pt-1.5">
                      <span className="line-clamp-1 flex-1">{c.caption?.split("\n")[0]}</span>
                      <span className="whitespace-nowrap text-muted">{fmt(c.reach)} reach · {c.engagement.toFixed(2)}%</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div>
              <div className="mb-2 text-sm font-semibold">When the audience is active</div>
              <Heatmap cells={bestTimes(a.id)} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
