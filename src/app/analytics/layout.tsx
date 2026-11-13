import Link from "next/link";
import { listAccounts, NETWORK_LABEL } from "@/lib/metrics";
import { currentBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const accounts = listAccounts((await currentBrand()).id);
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="no-print md:w-52 md:shrink-0">
        <nav className="card flex gap-1 overflow-x-auto p-2 md:flex-col">
          <Link href="/analytics" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-brand-soft">Brand summary</Link>
          {accounts.map((a) => (
            <Link key={a.id} href={`/analytics/${a.network}`} className="flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-brand-soft">
              {NETWORK_LABEL[a.network]}
              <span className={`rounded px-1.5 text-[10px] font-semibold ${a.connector === "live" ? "bg-good/10 text-good" : "bg-line text-muted"}`}>{a.connector}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
