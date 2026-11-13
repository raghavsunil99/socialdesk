"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Network tabs above every analytics page (shadcn "line" tabs style). */
export function AnalyticsTabs({ tabs }: { tabs: { href: string; label: string; exact?: boolean; tag?: string }[] }) {
  const path = usePathname();
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
            {t.label}
            {t.tag && t.tag !== "live" && <span className="rounded-md bg-muted px-1.5 text-[10px] font-normal text-muted-foreground">{t.tag}</span>}
            {t.tag === "live" && <span className="size-1.5 rounded-full bg-good" title="live" />}
          </Link>
        );
      })}
    </nav>
  );
}
