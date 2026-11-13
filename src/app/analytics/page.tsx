import Link from "next/link";
import { currentBrand } from "@/lib/brand";
import { listAccounts, NETWORK_LABEL, periodFromDays, summary, timeline } from "@/lib/metrics";
import { fmt, Delta, LineChart } from "@/components/charts";
import { PeriodPicker, readDays } from "@/components/PeriodPicker";

export default async function BrandSummary({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const days = readDays(await searchParams);
  const { from, to } = periodFromDays(days);
  const brand = await currentBrand();
  const rows = listAccounts(brand.id).map((a) => ({ a, s: summary(a.id, from, to), followers: timeline(a.id, "account", "followers", from, to) }));
  const total = (k: "followers" | "reach" | "views" | "interactions") => ({
    value: rows.reduce((s, r) => s + r.s[k].value, 0),
    previous: rows.reduce((s, r) => s + r.s[k].previous, 0),
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{brand.name} · summary</h1>
          <p className="text-sm text-muted">{from} → {to} · all connected networks</p>
        </div>
        <PeriodPicker days={days} base="/analytics" />
      </div>
      {rows.length === 0 && (
        <div className="card p-8 text-center">
          <div className="font-semibold">No accounts connected for {brand.name} yet</div>
          <p className="mt-1 text-sm text-muted">Connect Instagram in Settings, or add demo data from the Brands page to explore.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/settings" className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">Connect accounts</Link>
            <Link href="/brands" className="rounded-lg border border-line px-3 py-1.5 text-sm">Brands</Link>
          </div>
        </div>
      )}
      {rows.length > 0 && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["followers", "reach", "views", "interactions"] as const).map((k) => {
          const t = total(k);
          return (
            <div key={k} className="card p-4">
              <div className="text-xs font-medium capitalize text-muted">Total {k}</div>
              <div className="mt-1 text-2xl font-bold">{fmt(t.value)}</div>
              <Delta {...t} />
            </div>
          );
        })}
      </div>}
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map(({ a, s, followers }) => (
          <Link key={a.id} href={`/analytics/${a.network}?days=${days}`} className="card block p-4 hover:border-brand">
            <div className="flex items-baseline justify-between">
              <div className="font-semibold">{NETWORK_LABEL[a.network]} <span className="text-sm font-normal text-muted">@{a.handle}</span></div>
              <div className="text-right"><div className="text-lg font-bold">{fmt(s.followers.value)}</div><div className="text-xs text-muted">followers</div></div>
            </div>
            <LineChart series={followers} height={110} label={`${a.network} followers`} />
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <div><div className="text-xs text-muted">Reach</div>{fmt(s.reach.value)}</div>
              <div><div className="text-xs text-muted">Interactions</div>{fmt(s.interactions.value)}</div>
              <div><div className="text-xs text-muted">Net new</div>{fmt(s.gained.value - s.lost.value)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
