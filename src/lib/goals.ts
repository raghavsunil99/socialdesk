import "server-only";
import { db } from "./db";
import { listAccounts, type Account } from "./metrics";

// Smart targets: every month each account gets a "realistic" and a "push" target per metric, computed from its own
// recent pace and then frozen for the month so progress is measured against a fixed number. No AI credits.

export type GoalMetric = "subscribers" | "views" | "watch_hours" | "revenue";
export const GOAL_LABEL: Record<GoalMetric, string> = { subscribers: "Subscribers", views: "Views", watch_hours: "Watch hours", revenue: "Revenue" };
export type Goal = {
  account: { id: number; network: string; handle: string; picture: string | null };
  metric: GoalMetric; period: string; unit: string;
  start: number; realistic: number; push: number; actual: number; // actual = gained (subscribers) or total so far (others)
  expected: number; status: "push" | "done" | "ahead" | "on_track" | "behind" | "off_track";
  perDayNeeded: number; perDayNow: number; daysLeft: number; dataThrough: string; hint: string;
};

const IST_MS = 5.5 * 3600e3;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const istToday = () => ymd(Date.now() + IST_MS);
const monthOf = (day: string) => day.slice(0, 7);
const daysIn = (period: string) => new Date(Date.UTC(+period.slice(0, 4), +period.slice(5, 7), 0)).getUTCDate();

/** Round up to a "nice" number people remember (2 significant digits). */
export function nice(n: number) {
  if (n <= 0) return 0;
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1));
  return Math.ceil(n / p) * p;
}
export const short = (n: number, unit = "") => {
  const a = Math.abs(n);
  const s = a >= 1e7 ? (n / 1e6).toFixed(0) + "M" : a >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : a >= 1e4 ? (n / 1e3).toFixed(0) + "K" : a >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(a >= 100 ? Math.round(n) : Math.round(n * 10) / 10);
  return unit === "₹" || unit === "$" ? unit + s : s;
};

function series(accountId: number, metric: string, from: string, to: string) {
  return db().prepare("SELECT date, value FROM metric_points WHERE account_id = ? AND subject = 'account' AND metric = ? AND date BETWEEN ? AND ? ORDER BY date")
    .all(accountId, metric, from, to) as { date: string; value: number }[];
}
const sum = (rows: { value: number }[]) => rows.reduce((s, r) => s + r.value, 0);

/** Which goal metrics an account has data for. */
function metricsFor(acc: Account): { metric: GoalMetric; source: string; unit: string; scale: number }[] {
  const has = (m: string) => !!db().prepare("SELECT 1 FROM metric_points WHERE account_id = ? AND metric = ? LIMIT 1").get(acc.id, m);
  const out: { metric: GoalMetric; source: string; unit: string; scale: number }[] = [];
  if (has("followers")) out.push({ metric: "subscribers", source: "followers", unit: "", scale: 1 });
  if (has("views")) out.push({ metric: "views", source: "views", unit: "", scale: 1 });
  if (has("watch_minutes")) out.push({ metric: "watch_hours", source: "watch_minutes", unit: "h", scale: 1 / 60 });
  if (db().prepare("SELECT 1 FROM metric_points WHERE account_id = ? AND metric = 'revenue' AND value > 0 LIMIT 1").get(acc.id)) out.push({ metric: "revenue", source: "revenue", unit: "₹", scale: 1 });
  return out;
}

/** Create this month's frozen targets for an account if they don't exist yet. */
function ensureTargets(acc: Account, period: string) {
  const d = db();
  const today = istToday();
  const from28 = ymd(Date.now() - 31 * 864e5);
  const ins = d.prepare("INSERT OR IGNORE INTO goals (brand_id, account_id, metric, period, start_value, baseline, realistic, push) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const n = daysIn(period);
  for (const m of metricsFor(acc)) {
    if (d.prepare("SELECT 1 FROM goals WHERE account_id = ? AND metric = ? AND period = ?").get(acc.id, m.metric, period)) continue;
    if (m.metric === "subscribers") {
      const f = series(acc.id, "followers", from28, today);
      if (f.length < 2) continue;
      const startRow = series(acc.id, "followers", `${period}-01`, today)[0] ?? f[f.length - 1];
      const days = Math.max(1, (Date.parse(f[f.length - 1].date) - Date.parse(f[0].date)) / 864e5);
      const pace = (f[f.length - 1].value - f[0].value) / days; // net subs/day
      const floor = Math.max(5, startRow.value * 0.002);
      const realisticGain = nice(Math.max(pace * n * 1.1, floor));
      const pushGain = nice(Math.max(pace * n * 1.4, realisticGain * 1.5));
      ins.run(acc.brand_id, acc.id, m.metric, period, startRow.value, pace * n, realisticGain, pushGain);
    } else {
      const r = series(acc.id, m.source, from28, today);
      if (r.length < 7) continue;
      const perDay = (sum(r) * m.scale) / r.length;
      const baseline = perDay * n;
      ins.run(acc.brand_id, acc.id, m.metric, period, 0, baseline, nice(baseline * 1.1), nice(baseline * 1.35));
    }
  }
}

/** Average views per upload over the last 60 days, split by Shorts/Reels and long videos. */
function viewsPerPost(accountId: number) {
  const rows = db().prepare("SELECT kind, AVG(views) v, COUNT(*) n FROM content WHERE account_id = ? AND published_at >= ? GROUP BY kind")
    .all(accountId, new Date(Date.now() - 60 * 864e5).toISOString()) as { kind: string; v: number; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.kind, { avg: r.v, n: r.n }])) as Record<string, { avg: number; n: number }>;
}

export function brandGoals(brandId: number): Goal[] {
  const today = istToday();
  const period = monthOf(today);
  const n = daysIn(period);
  const out: Goal[] = [];
  for (const acc of listAccounts(brandId).filter((a) => a.connector === "live" || a.connector === "import")) {
    ensureTargets(acc, period);
    const rows = db().prepare("SELECT * FROM goals WHERE account_id = ? AND period = ?").all(acc.id, period) as { metric: GoalMetric; start_value: number; realistic: number; push: number }[];
    for (const g of rows) {
      const m = metricsFor(acc).find((x) => x.metric === g.metric);
      if (!m) continue;
      const mtd = series(acc.id, m.source, `${period}-01`, today);
      if (!mtd.length) continue;
      const actual = g.metric === "subscribers" ? mtd[mtd.length - 1].value - g.start_value : sum(mtd) * m.scale;
      const dataThrough = mtd[mtd.length - 1].date;
      const elapsed = Math.max(1, +dataThrough.slice(8, 10));
      const daysLeft = Math.max(0, n - elapsed);
      const expected = (g.realistic * elapsed) / n;
      const perDayNow = actual / elapsed;
      const perDayNeeded = daysLeft ? Math.max(0, (g.realistic - actual) / daysLeft) : 0;
      const ratio = expected > 0 ? actual / expected : 1;
      const status: Goal["status"] = actual >= g.push ? "push" : actual >= g.realistic ? "done" : ratio >= 1.15 ? "ahead" : ratio >= 0.95 ? "on_track" : ratio >= 0.75 ? "behind" : "off_track";

      // A concrete "how": translate the gap into uploads using this account's own average views per upload.
      let hint = "";
      const gap = Math.max(0, g.realistic - actual), pushGap = Math.max(0, g.push - actual);
      if (g.metric === "views" && (gap > 0 || pushGap > 0)) {
        const vp = viewsPerPost(acc.id);
        const s = vp.reel, l = vp.video;
        const best = s && (!l || s.avg >= l.avg / 3) ? { k: "Shorts", ...s } : l ? { k: "long videos", ...l } : null;
        if (best && best.avg > 0) hint = `≈ ${Math.ceil((gap || pushGap) / best.avg)} more ${best.k} at your ${short(best.avg)}-view average ${gap ? "hits the target" : "reaches the push goal"}.`;
      } else if (g.metric === "subscribers" && gap > 0) {
        hint = perDayNow <= 0 ? "Losing subscribers this month: post the topics your best videos covered and pin a subscribe CTA." : `Need ${short(perDayNeeded)} net subs/day (now ${short(perDayNow)}/day).`;
      } else if (g.metric === "watch_hours" && gap > 0) {
        hint = "Long videos drive watch hours; one extra long video this week helps most.";
      } else if (status === "done") hint = `Target hit! Push goal: ${short(g.push, m.unit)}.`;
      else if (status === "push") hint = "Push goal smashed. Next month's targets will be higher.";

      out.push({
        account: { id: acc.id, network: acc.network, handle: acc.handle, picture: acc.picture ?? null },
        metric: g.metric, period, unit: m.unit, start: g.start_value, realistic: g.realistic, push: g.push, actual,
        expected, status, perDayNeeded, perDayNow, daysLeft, dataThrough, hint,
      });
    }
  }
  return out;
}

// ---- YouTube Partner Program -------------------------------------------------

export type Ypp = {
  account: { id: number; handle: string; picture: string | null };
  monetized: boolean; subs: number; watchHours365: number; shortsViews90: number; uploads90: number;
  tiers: { name: string; perks: string; done: boolean; checks: { label: string; value: number; target: number; ok: boolean }[]; paths: string }[];
  revenue30: number | null; rpm30: number | null; revenuePrev30: number | null; eta: string | null;
};

export function yppStatus(brandId: number): Ypp[] {
  const today = istToday();
  return listAccounts(brandId).filter((a) => a.network === "youtube" && a.connector === "live").map((acc) => {
    const last = (m: string) => (db().prepare("SELECT value FROM metric_points WHERE account_id = ? AND metric = ? ORDER BY date DESC LIMIT 1").get(acc.id, m) as { value: number } | undefined)?.value ?? 0;
    const subs = last("followers");
    const watchHours365 = last("ypp_watch_minutes_365") / 60;
    const shortsViews90 = last("ypp_shorts_views_90");
    const uploads90 = (db().prepare("SELECT COUNT(*) n FROM content WHERE account_id = ? AND published_at >= ?").get(acc.id, new Date(Date.now() - 90 * 864e5).toISOString()) as { n: number }).n;
    const rev = series(acc.id, "revenue", ymd(Date.now() - 30 * 864e5), today);
    const revPrev = series(acc.id, "revenue", ymd(Date.now() - 60 * 864e5), ymd(Date.now() - 31 * 864e5));
    const views30 = sum(series(acc.id, "views", ymd(Date.now() - 30 * 864e5), today));
    const monetized = sum(series(acc.id, "revenue", ymd(Date.now() - 90 * 864e5), today)) > 0;
    const tier = (name: string, perks: string, subT: number, whT: number, svT: number, extra?: { label: string; value: number; target: number }) => {
      const sOk = subs >= subT, wOk = watchHours365 >= whT, vOk = shortsViews90 >= svT;
      const checks = [
        { label: "Subscribers", value: subs, target: subT, ok: sOk },
        ...(extra ? [{ ...extra, ok: extra.value >= extra.target }] : []),
        { label: "Watch hours (12 months, long-form)", value: watchHours365, target: whT, ok: wOk },
        { label: "Shorts views (90 days)", value: shortsViews90, target: svT, ok: vOk },
      ];
      const done = sOk && (wOk || vOk) && (!extra || extra.value >= extra.target);
      const closer = whT && svT ? (watchHours365 / whT >= shortsViews90 / svT ? `Watch-hours path is closer (${Math.round((100 * watchHours365) / whT)}%)` : `Shorts path is closer (${Math.round((100 * shortsViews90) / svT)}%)`) : "";
      return { name, perks, done, checks, paths: `You need watch hours OR Shorts views, not both. ${closer}` };
    };
    const tiers = [
      tier("Early access", "Channel memberships, Super Thanks, Super Chat, Shopping", 500, 3000, 3_000_000, { label: "Public uploads (90 days)", value: uploads90, target: 3 }),
      tier("Full Partner Program", "Ad revenue + YouTube Premium revenue", 1000, 4000, 10_000_000),
    ];
    // Rough ETA for the full tier from the last month's pace (Shorts views path).
    let eta: string | null = null;
    if (!monetized && !tiers[1].done) {
      const sv = sum(series(acc.id, "views_shorts", ymd(Date.now() - 30 * 864e5), today)) / 30;
      const gap = 10_000_000 - shortsViews90;
      if (sv > 0 && subs >= 1000) eta = gap <= 0 ? "now" : new Date(Date.now() + (gap / (sv - shortsViews90 / 90 > 0 ? sv - shortsViews90 / 90 : sv)) * 864e5).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    }
    const revenue30 = monetized ? sum(rev) : null;
    return {
      account: { id: acc.id, handle: acc.handle, picture: acc.picture ?? null }, monetized, subs, watchHours365, shortsViews90, uploads90, tiers,
      revenue30, revenuePrev30: monetized ? sum(revPrev) : null, rpm30: monetized && views30 ? (sum(rev) / views30) * 1000 : null, eta,
    };
  });
}

/** The single most useful goal line for the coach card. */
export function topGoalLine(brandId: number): string | null {
  const gs = brandGoals(brandId);
  const order: Goal["status"][] = ["off_track", "behind", "on_track", "ahead", "done", "push"];
  const g = gs.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || (a.metric === "subscribers" ? -1 : 1))[0];
  if (!g) return null;
  const tgt = short(g.realistic, g.unit), act = short(g.actual, g.unit);
  const what = g.metric === "subscribers" ? `+${tgt} subscribers` : `${tgt} ${GOAL_LABEL[g.metric].toLowerCase()}`;
  const lead = { off_track: "Off track", behind: "Behind", on_track: "On track", ahead: "Ahead", done: "Target hit", push: "Push goal hit" }[g.status];
  return `${lead}: ${what} this month on ${g.account.network} (${act} so far). ${g.hint}`.trim();
}
