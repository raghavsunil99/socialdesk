import { db } from "@/lib/db";
import { currentBrand, listBrands } from "@/lib/brand";
import { aiProvider, dailyLimit, GEMINI_MODEL } from "@/lib/ai";
import { BarChart, fmt } from "@/components/charts";

export const dynamic = "force-dynamic";

type CallRow = { at: string; brand: string; kind: string; model: string; input_tokens: number; output_tokens: number; ok: number; error: string | null };

export default async function AiUsage() {
  const brand = await currentBrand();
  const brands = listBrands(brand.user.id);
  const ids = brands.map((b) => b.id);
  const inList = ids.map(() => "?").join(",") || "NULL";
  const d = db();
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const limit = dailyLimit();
  const provider = aiProvider();

  // Calls counted against the daily limit (ai_usage) and tokens reported by the provider (ai_calls).
  const callsOn = (brandId: number, day: string) => (d.prepare("SELECT calls FROM ai_usage WHERE brand_id = ? AND day = ?").get(brandId, day) as { calls: number } | undefined)?.calls ?? 0;
  const callsMonth = (brandId: number) => (d.prepare("SELECT COALESCE(SUM(calls), 0) AS n FROM ai_usage WHERE brand_id = ? AND day LIKE ?").get(brandId, month + "%") as { n: number }).n;
  const tokens = (brandId: number, since: string) =>
    d.prepare("SELECT COALESCE(SUM(input_tokens), 0) AS i, COALESCE(SUM(output_tokens), 0) AS o FROM ai_calls WHERE brand_id = ? AND at >= ?").get(brandId, since) as { i: number; o: number };

  const rows = brands.map((b) => ({ b, today: callsOn(b.id, today), month: callsMonth(b.id), tToday: tokens(b.id, today), tMonth: tokens(b.id, month + "-01") }));
  const mine = rows.find((r) => r.b.id === brand.id)!;
  const left = Math.max(0, limit - mine.today);

  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10));
  const perDay = new Map((d.prepare(`SELECT day, SUM(calls) AS n FROM ai_usage WHERE brand_id IN (${inList}) AND day >= ? GROUP BY day`).all(...ids, days[0]) as { day: string; n: number }[]).map((r) => [r.day, r.n]));
  const series = days.map((date) => ({ date, value: perDay.get(date) ?? 0 }));
  const byKind = d.prepare(`SELECT kind, COUNT(*) AS n, SUM(input_tokens + output_tokens) AS t FROM ai_calls WHERE brand_id IN (${inList}) AND at >= ? GROUP BY kind`).all(...ids, month + "-01") as { kind: string; n: number; t: number }[];
  const recent = d.prepare(
    `SELECT c.at, b.name AS brand, c.kind, c.model, c.input_tokens, c.output_tokens, c.ok, c.error FROM ai_calls c JOIN brands b ON b.id = c.brand_id
     WHERE c.brand_id IN (${inList}) ORDER BY c.id DESC LIMIT 20`
  ).all(...ids) as CallRow[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">AI usage</h1>
        <p className="text-sm text-muted">
          {provider ? <>Using <b>{provider === "gemini" ? `Gemini (${GEMINI_MODEL})` : "Claude"}</b>. </> : <>No AI key set. </>}
          Counted by Socialdesk for every caption and idea batch. Each brand can make <b>{limit}</b> AI calls a day (set <code>AI_DAILY_LIMIT</code> in .env.local).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs font-medium text-muted">{brand.name} · today</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{mine.today} <span className="text-base font-normal text-muted">/ {limit} calls</span></div>
          <div className="mt-2 h-2 rounded bg-brand-soft"><div className={`h-2 rounded ${left === 0 ? "bg-bad" : "bg-brand"}`} style={{ width: `${Math.min(100, (mine.today / limit) * 100)}%` }} /></div>
          <div className={`mt-1 text-xs ${left === 0 ? "text-bad" : "text-muted"}`}>{left} left today · resets at midnight UTC</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-medium text-muted">Tokens today ({brand.name})</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{fmt(mine.tToday.i + mine.tToday.o)}</div>
          <div className="text-xs text-muted">{fmt(mine.tToday.i)} in · {fmt(mine.tToday.o)} out</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-medium text-muted">This month (all your brands)</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{rows.reduce((s, r) => s + r.month, 0)} <span className="text-base font-normal text-muted">calls</span></div>
          <div className="text-xs text-muted">{fmt(rows.reduce((s, r) => s + r.tMonth.i + r.tMonth.o, 0))} tokens · {byKind.map((k) => `${k.n} ${k.kind === "ideas" ? (k.n === 1 ? "idea batch" : "idea batches") : k.n === 1 ? "caption request" : "caption requests"}`).join(" · ") || "no calls yet"}</div>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-2 text-sm font-semibold">AI calls per day · last 30 days</div>
        <BarChart series={series} height={140} label="AI calls per day" />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-xs text-muted">
            <tr>{["Brand", "Today", "Left today", "This month", "Tokens this month"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.b.id} className={`border-t border-line ${r.b.id === brand.id ? "bg-brand-soft/50" : ""}`}>
                <td className="px-4 py-2 font-medium">{r.b.name}</td>
                <td className="px-4 py-2 tabular-nums">{r.today} / {limit}</td>
                <td className="px-4 py-2 tabular-nums">{Math.max(0, limit - r.today)}</td>
                <td className="px-4 py-2 tabular-nums">{r.month}</td>
                <td className="px-4 py-2 tabular-nums">{fmt(r.tMonth.i + r.tMonth.o)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-line p-3 text-sm font-semibold">Recent AI calls</div>
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-xs text-muted">
            <tr>{["When (UTC)", "Brand", "What", "Tokens in / out", "Result"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {recent.map((c, i) => (
              <tr key={i} className="border-t border-line">
                <td className="whitespace-nowrap px-4 py-2 text-xs">{c.at}</td>
                <td className="px-4 py-2">{c.brand}</td>
                <td className="px-4 py-2">{c.kind === "ideas" ? "Idea batch" : "Captions"}</td>
                <td className="px-4 py-2 tabular-nums">{fmt(c.input_tokens)} / {fmt(c.output_tokens)}</td>
                <td className={`px-4 py-2 text-xs ${c.ok ? "text-good" : "text-bad"}`}>{c.ok ? "OK" : c.error}</td>
              </tr>
            ))}
            {recent.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">No AI calls recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {provider === "gemini" && (
        <p className="text-xs text-muted">
          Google doesn&apos;t tell apps how much of your Gemini quota or billing is left. For the official numbers (requests per day on the free tier, or spend on a paid key), open{" "}
          <a href="https://aistudio.google.com/usage" target="_blank" rel="noreferrer" className="text-brand underline">Google AI Studio → Usage</a>.
        </p>
      )}
    </div>
  );
}
