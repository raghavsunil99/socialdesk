import { notFound } from "next/navigation";
import Link from "next/link";
import { contentList, distribution, getAccount, hashtags, historyStart, NETWORK_LABEL, periodFromDays, previousPeriod, summary, timeline } from "@/lib/metrics";
import { BarChart, fmt, HBars, Kpi, LineChart } from "@/components/charts";
import { PeriodPicker, readDays } from "@/components/PeriodPicker";
import { SyncButton } from "@/components/SyncButton";
import { currentBrand } from "@/lib/brand";

// Audience breakdowns, shown only when the network provides them.
const AUDIENCE: [string, string][] = [
  ["city", "Followers by city"], ["country", "Followers by country"], ["age", "Age"], ["gender", "Gender"],
  ["job_title", "Job titles"], ["industry", "Industries"], ["seniority", "Seniority"], ["company_size", "Company size"], ["company", "Companies"],
];

const SORTS = ["published_at", "reach", "views", "interactions", "engagement"] as const;

export default async function NetworkAnalytics({ params, searchParams }: { params: Promise<{ network: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { network } = await params;
  const sp = await searchParams;
  const acc = getAccount((await currentBrand()).id, network);
  if (!acc || acc.connector === "none") notFound();
  const days = readDays(sp);
  const sort = (SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as (typeof SORTS)[number]) : "published_at";
  const { from, to } = periodFromDays(days);
  const prev = previousPeriod(from, to);
  const s = summary(acc.id, from, to);
  const tl = (subject: string, metric: string) => timeline(acc.id, subject, metric, from, to);
  // Only draw the dashed previous-period line when we actually have history covering that period.
  const tlPrev = (subject: string, metric: string) =>
    historyStart(acc.id, metric) <= prev.from ? timeline(acc.id, subject, metric, prev.from, prev.to) : undefined;
  const content = contentList(acc.id, from, to).sort((a, b) => sort === "published_at" ? b.published_at.localeCompare(a.published_at) : (b[sort] as number) - (a[sort] as number));
  const tags = hashtags(acc.id, from, to).slice(0, 10);
  const shortLabel = network === "youtube" ? "Shorts" : "Reels";
  const base = `/analytics/${network}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{NETWORK_LABEL[network]} <span className="font-normal text-muted-foreground">@{acc.handle}</span></h1>
          <p className="text-sm text-muted-foreground">
            {from} → {to} · dashed line = previous {days} days · {acc.connector === "demo" ? "demo data" : `last sync ${acc.last_sync ?? "never"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {acc.connector === "live" && <SyncButton network={network} />}
          <PeriodPicker days={days} base={base} />
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Community</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={network === "youtube" ? "Subscribers" : "Followers"} {...s.followers} />
          <Kpi label="Gained" {...s.gained} />
          <Kpi label="Lost" {...s.lost} invert />
          <Kpi label="Daily net growth" value={(s.gained.value - s.lost.value) / days} previous={(s.gained.previous - s.lost.previous) / days} digits={1} />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="card p-4"><div className="mb-2 text-sm font-semibold">Followers</div><LineChart series={tl("account", "followers")} compare={tlPrev("account", "followers")} label="followers" /></div>
          <div className="card p-4"><div className="mb-2 text-sm font-semibold">Balance: gained per day</div><BarChart series={tl("account", "followers_gained")} label="followers gained" /></div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Account</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Reach" {...s.reach} />
          <Kpi label="Views" {...s.views} />
          <Kpi label="Profile views" {...s.profileViews} />
          <Kpi label="Avg. reach / day" value={s.reach.value / days} previous={s.reach.previous / days} />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="card p-4"><div className="mb-2 text-sm font-semibold">Reach</div><LineChart series={tl("account", "reach")} compare={tlPrev("account", "reach")} label="reach" /></div>
          <div className="card p-4"><div className="mb-2 text-sm font-semibold">Views</div><LineChart series={tl("account", "views")} compare={tlPrev("account", "views")} color="var(--chart-2)" label="views" /></div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Content</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Posts" {...s.posts} />
          <Kpi label={shortLabel} {...s.reels} />
          <Kpi label="Interactions" {...s.interactions} />
          <Kpi label="Post engagement" {...s.postEngagement} digits={2} suffix="%" />
          <Kpi label={`${shortLabel} engagement`} {...s.reelEngagement} digits={2} suffix="%" />
        </div>
        <div className="card mt-3 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
            <div className="text-sm font-semibold">Published content ({content.length})</div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">Sort:</span>
              {SORTS.map((k) => (
                <Link key={k} href={`${base}?days=${days}&sort=${k}`} className={k === sort ? "font-semibold text-brand" : "text-muted-foreground hover:text-ink"}>{k === "published_at" ? "date" : k}</Link>
              ))}
              <a className="rounded border border-line px-2 py-1 hover:border-brand" href={`/api/v2/analytics/posts/${network}?from=${from}&to=${to}&format=csv`}>Download CSV</a>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg text-left text-xs text-muted-foreground">
                <tr>{["Content", "Type", "Date", "Reach", "Views", "Likes", "Comments", "Saved", "Shares", "Eng."].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {content.slice(0, 50).map((c) => (
                  <tr key={c.id} className="border-t border-line align-top">
                    <td className="max-w-md px-3 py-2"><div className="line-clamp-2">{c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="hover:text-brand">{c.caption}</a> : c.caption}</div></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.kind}{c.format ? ` · ${c.format.toLowerCase()}` : ""}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{new Date(c.published_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                    {[c.reach, c.views, c.likes, c.comments, c.saved, c.shares].map((v, i) => <td key={i} className="px-3 py-2 tabular-nums">{fmt(v)}</td>)}
                    <td className="px-3 py-2 font-semibold tabular-nums">{c.engagement.toFixed(2)}%</td>
                  </tr>
                ))}
                {content.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">Nothing published in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {tags.length > 0 && (
          <div className="card p-4">
            <div className="mb-3 text-sm font-semibold">Top hashtags by views</div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="pb-1 font-medium">Hashtag</th><th className="font-medium">Posts</th><th className="font-medium">Views</th><th className="font-medium">Eng.</th></tr></thead>
              <tbody>
                {tags.map((t) => (
                  <tr key={t.tag} className="border-t border-line"><td className="py-1.5">{t.tag}</td><td>{t.posts}</td><td className="tabular-nums">{fmt(t.views)}</td><td className="tabular-nums">{t.reach ? ((100 * t.interactions) / t.reach).toFixed(2) : "0"}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {AUDIENCE.map(([metric, title]) => {
          const rows = distribution(acc.id, metric).slice(0, 8);
          if (!rows.length) return null;
          return <div key={metric} className="card p-4"><div className="mb-3 text-sm font-semibold">{metric === "city" && network === "linkedin" ? "Followers by location" : title}</div><HBars rows={rows} /></div>;
        })}
      </section>
    </div>
  );
}
