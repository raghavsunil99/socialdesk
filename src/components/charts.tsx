// Small dependency-free SVG charts. Server-renderable; hover details via <title>.

export function fmt(n: number, digits = 0) {
  if (!isFinite(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

export function Delta({ value, previous, invert = false }: { value: number; previous: number; invert?: boolean }) {
  if (!previous) return <span className="text-xs text-muted">no prior data</span>;
  const pct = ((value - previous) / Math.abs(previous)) * 100;
  const up = pct >= 0;
  const good = invert ? !up : up;
  return (
    <span className={`text-xs font-semibold ${good ? "text-good" : "text-bad"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
      <span className="ml-1 font-normal text-muted">vs prev.</span>
    </span>
  );
}

export function Kpi({ label, value, previous, digits = 0, suffix = "", invert }: { label: string; value: number; previous?: number; digits?: number; suffix?: string; invert?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{fmt(value, digits)}{suffix}</div>
      {previous !== undefined && <Delta value={value} previous={previous} invert={invert} />}
    </div>
  );
}

type Pt = { date: string; value: number };

export function LineChart({ series, compare, height = 180, color = "var(--brand)", area = true, label }: { series: Pt[]; compare?: Pt[]; height?: number; color?: string; area?: boolean; label?: string }) {
  const W = 640, H = height, P = { l: 44, r: 8, t: 10, b: 22 };
  const all = [...series, ...(compare ?? [])].map((p) => p.value);
  let min = Math.min(...all), max = Math.max(...all);
  if (!all.length) { min = 0; max = 1; }
  if (min === max) { min -= 1; max += 1; }
  if (min > 0 && min / max < 0.6) min = 0;
  const pad = (max - min) * 0.08;
  min -= min === 0 ? 0 : pad; max += pad;
  const n = Math.max(series.length - 1, 1);
  const x = (i: number) => P.l + (i / n) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
  const path = (s: Pt[]) => s.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const ticks = [0, 0.5, 1].map((t) => min + t * (max - min));
  const dateTicks = series.length ? [0, Math.floor(series.length / 2), series.length - 1] : [];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{fmt(t)}</text>
        </g>
      ))}
      {dateTicks.map((i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} fontSize="10" fill="var(--muted)">
          {new Date(series[i].date + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        </text>
      ))}
      {compare && compare.length > 0 && <path d={path(compare.slice(0, series.length))} fill="none" stroke="var(--muted)" strokeDasharray="4 4" strokeWidth="1.5" opacity="0.6" />}
      {area && series.length > 1 && (
        <path d={`${path(series)}L${x(series.length - 1)},${H - P.b}L${x(0)},${H - P.b}Z`} fill={color} opacity="0.08" />
      )}
      <path d={path(series)} fill="none" stroke={color} strokeWidth="2" />
      {series.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r="6" fill="transparent">
          <title>{`${p.date}: ${fmt(p.value, 2)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function BarChart({ series, height = 160, color = "var(--accent)", label }: { series: Pt[]; height?: number; color?: string; label?: string }) {
  const W = 640, H = height, P = { l: 36, r: 4, t: 8, b: 20 };
  const max = Math.max(1, ...series.map((s) => s.value));
  const bw = (W - P.l - P.r) / Math.max(series.length, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="var(--line)" />
      <text x={P.l - 6} y={P.t + 8} textAnchor="end" fontSize="10" fill="var(--muted)">{fmt(max)}</text>
      {series.map((s, i) => {
        const h = (s.value / max) * (H - P.t - P.b);
        return (
          <rect key={i} x={P.l + i * bw + 1} y={H - P.b - h} width={Math.max(bw - 2, 1)} height={h} rx="2" fill={color}>
            <title>{`${s.date}: ${fmt(s.value, 2)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function HBars({ rows, unit = "%" }: { rows: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between"><span>{r.label}</span><span className="tabular-nums text-muted">{fmt(r.value, 1)}{unit}</span></div>
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
          <tr><th />{Array.from({ length: 24 }, (_, h) => <th key={h} className="w-5 font-normal text-muted">{h % 3 === 0 ? h : ""}</th>)}</tr>
        </thead>
        <tbody>
          {DAYS.map((d, i) => (
            <tr key={d}>
              <td className="pr-2 text-muted">{d}</td>
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
