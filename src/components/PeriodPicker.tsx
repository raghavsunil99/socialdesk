import Link from "next/link";

export function PeriodPicker({ days, base }: { days: number; base: string }) {
  return (
    <div className="no-print flex rounded-lg border border-line bg-surface p-0.5 text-sm">
      {[7, 30, 90].map((d) => (
        <Link key={d} href={`${base}?days=${d}`} className={`rounded-md px-3 py-1 ${d === days ? "bg-brand text-white" : "text-muted hover:text-ink"}`}>
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
