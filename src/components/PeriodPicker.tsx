import Link from "next/link";
import { cn } from "@/lib/utils";

/** 7d / 30d / 90d segmented control (shadcn tabs look). */
export function PeriodPicker({ days, base }: { days: number; base: string }) {
  return (
    <div className="no-print inline-flex h-9 items-center rounded-lg bg-muted p-1 text-sm">
      {[7, 30, 90].map((d) => (
        <Link
          key={d}
          href={`${base}?days=${d}`}
          className={cn("rounded-md px-3 py-1 font-medium transition-colors", d === days ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {d}d
        </Link>
      ))}
    </div>
  );
}

export function readDays(sp: Record<string, string | string[] | undefined>) {
  const d = Number(sp.days);
  return [7, 30, 90].includes(d) ? d : 30;
}
