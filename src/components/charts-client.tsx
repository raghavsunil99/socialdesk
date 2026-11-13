"use client";
// Interactive charts (shadcn/ui chart + Recharts): hover tooltips, gradients, clean axes.
import { useId } from "react";
import { Area, AreaChart, Bar, BarChart as RBarChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

type Pt = { date: string; value: number };

const short = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(Math.round(n * 100) / 100);
};
/** Axis labels with enough precision to tell ticks apart (e.g. 24,150 vs 24,200 instead of "24K" twice). */
const tickFormatter = (values: number[]) => {
  const lo = Math.min(...values), hi = Math.max(...values);
  return (hi - lo) < Math.max(1, Math.abs(hi)) * 0.05 ? (n: number) => Math.round(n).toLocaleString("en-IN") : short;
};
const dayLabel = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const full = (v: unknown) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function LineChart({ series, compare, height = 180, color = "var(--chart-1)", area = true, label = "Value" }: { series: Pt[]; compare?: Pt[]; height?: number; color?: string; area?: boolean; label?: string }) {
  const id = useId().replace(/:/g, "");
  const data = series.map((p, i) => ({ date: p.date, value: p.value, previous: compare?.[i]?.value }));
  const config = {
    value: { label: label[0].toUpperCase() + label.slice(1), color },
    previous: { label: "Previous period", color: "var(--muted-foreground)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-value)" stopOpacity={area ? 0.35 : 0} />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} tickFormatter={dayLabel} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={tickFormatter(data.flatMap((d) => [d.value, ...(d.previous !== undefined ? [d.previous] : [])]))} domain={["auto", "auto"]} />
        <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltipContent labelFormatter={(v) => dayLabel(String(v))} formatter={(v, name) => (
          <div className="flex w-full items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 rounded-[2px]" style={{ background: name === "previous" ? "var(--muted-foreground)" : "var(--color-value)" }} />
              {config[name as "value" | "previous"].label}
            </span>
            <span className="font-mono font-medium tabular-nums text-foreground">{full(v)}</span>
          </div>
        )} />} />
        {compare && <Line dataKey="previous" type="monotone" stroke="var(--color-previous)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />}
        <Area dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2} fill={`url(#fill-${id})`} />
      </AreaChart>
    </ChartContainer>
  );
}

export function BarChart({ series, height = 160, color = "var(--chart-2)", label = "Value" }: { series: Pt[]; height?: number; color?: string; label?: string }) {
  const config = { value: { label: label[0].toUpperCase() + label.slice(1), color } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <RBarChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} tickFormatter={dayLabel} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={short} allowDecimals={false} />
        <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent labelFormatter={(v) => dayLabel(String(v))} />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
      </RBarChart>
    </ChartContainer>
  );
}
