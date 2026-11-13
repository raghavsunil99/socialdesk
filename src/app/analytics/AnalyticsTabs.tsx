"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Network tabs above every analytics page (shadcn "line" tabs style). */
type Opt = { network: string; label: string; tag: string; hidden: boolean };
export function AnalyticsTabs({ tabs, options }: { tabs: { href: string; label: string; exact?: boolean; tag?: string; picture?: string | null }[]; options?: Opt[] }) {
  const path = usePathname();
  const router = useRouter();
  const toggle = async (o: Opt) => {
    await fetch("/api/accounts/visibility", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ network: o.network, hidden: !o.hidden }) });
    if (!o.hidden && path.startsWith(`/analytics/${o.network}`)) router.push("/analytics");
    router.refresh();
  };
  return (
    <nav className="no-print -mt-2 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => {
        const active = t.exact ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "relative flex items-center gap-1.5 whitespace-nowrap px-3 pb-2.5 pt-1 text-sm font-medium transition-colors",
              active ? "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.picture && <img src={t.picture} alt="" referrerPolicy="no-referrer" className="size-4 rounded-full object-cover" />}
            {t.label}
            {t.tag && t.tag !== "live" && <span className="rounded-md bg-muted px-1.5 text-[10px] font-normal text-muted-foreground">{t.tag}</span>}
            {t.tag === "live" && <span className="size-1.5 rounded-full bg-good" title="live" />}
          </Link>
        );
      })}
      {options && options.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger className="ml-auto flex items-center gap-1.5 whitespace-nowrap px-3 pb-2.5 pt-1 text-sm text-muted-foreground hover:text-foreground" aria-label="Choose which networks to show">
            <SlidersHorizontal className="size-4" />Customize
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Show in Analytics</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {options.map((o) => (
              <DropdownMenuCheckboxItem key={o.network} checked={!o.hidden} onCheckedChange={() => toggle(o)} onSelect={(e) => e.preventDefault()}>
                {o.label}{o.tag !== "live" && <span className="ml-auto text-xs text-muted-foreground">{o.tag}</span>}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Hidden networks keep their data and connection. To delete demo data, use Connections.</p>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}
