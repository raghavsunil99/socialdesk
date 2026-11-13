import Link from "next/link";
import { listAccounts, NETWORK_LABEL } from "@/lib/metrics";
import { currentBrand } from "@/lib/brand";
import { AnalyticsTabs } from "./AnalyticsTabs";

export const dynamic = "force-dynamic";

export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const brand = await currentBrand();
  const all = listAccounts(brand.id);
  const accounts = all.filter((a) => !a.hidden);
  return (
    <div className="space-y-6">
      <AnalyticsTabs
        tabs={[{ href: "/analytics", label: "Summary", exact: true }, ...accounts.map((a) => ({ href: `/analytics/${a.network}`, label: NETWORK_LABEL[a.network], tag: a.connector, picture: a.picture ?? null }))]}
        options={brand.role === "owner" || brand.role === "editor" ? all.map((a) => ({ network: a.network, label: NETWORK_LABEL[a.network], tag: a.connector, hidden: !!a.hidden })) : undefined}
      />
      {accounts.length === 0 && (
        <p className="text-sm text-muted-foreground">No accounts yet. <Link href="/settings" className="text-primary underline">Connect one</Link>.</p>
      )}
      {children}
    </div>
  );
}
