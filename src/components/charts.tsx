// Chart building blocks. LineChart/BarChart are interactive (shadcn/ui chart + Recharts); the rest are server-rendered.
import { TrendingDown, TrendingUp } from "lucide-react";
export { LineChart, BarChart } from "./charts-client";

export function fmt(n: number, digits = 0) {
  if (!isFinite(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

export function Delta({ value, previous, invert = false }: { value: number; previous: number; invert?: boolean }) {
  if (!previous) return <span className="text-xs text-muted-foreground">no prior data</span>;
  const pct = ((value - previous) / Math.abs(previous)) * 100;
  const up = pct >= 0;
  const good = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium ${good ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
        <Icon className="size-3" />{up ? "+" : "−"}{Math.abs(pct).toFixed(1)}%
      </span>
      <span className="text-muted-foreground">vs previous</span>
    </span>
  );
}

export function Kpi({ label, value, previous, digits = 0, suffix = "", invert }: { label: string; value: number; previous?: number; digits?: number; suffix?: string; invert?: boolean }) {
  return (
    <div className="card flex flex-col gap-1 p-5">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="text-3xl font-semibold tracking-tight tabular-nums">{fmt(value, digits)}{suffix}</div>
      {previous !== undefined && <div className="mt-1"><Delta value={value} previous={previous} invert={invert} /></div>}
    </div>
  );
}


export function HBars({ rows, unit = "%" }: { rows: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between"><span>{r.label}</span><span className="tabular-nums text-muted-foreground">{fmt(r.value, 1)}{unit}</span></div>
          <div className="mt-1 h-1.5 rounded bg-brand-soft"><div className="h-1.5 rounded bg-brand" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function Heatmap({ cells }: { cells: { dow: number; hour: number; value: number }[] }) {
  const max = Math.max(1, ...cells.map((c) => c.value));
  const get = (d: number, h: number) => cells.find((c) => c.dow === d && c.hour === h)?.value ?? 0;
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-[10px]">
        <thead>
          <tr><th />{Array.from({ length: 24 }, (_, h) => <th key={h} className="w-5 font-normal text-muted-foreground">{h % 3 === 0 ? h : ""}</th>)}</tr>
        </thead>
        <tbody>
          {DAYS.map((d, i) => (
            <tr key={d}>
              <td className="pr-2 text-muted-foreground">{d}</td>
              {Array.from({ length: 24 }, (_, h) => {
                const v = get(i + 1, h);
                return <td key={h} title={`${d} ${h}:00 — ${fmt(v)}`} className="h-5 w-5 rounded-sm" style={{ background: `color-mix(in srgb, var(--brand) ${Math.round((v / max) * 100)}%, var(--brand-soft))` }} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
