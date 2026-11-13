import "server-only";
import { db } from "./db";
import { topGoalLine } from "./goals";

// Posting coach: streak, weekly goal and a rule-based nudge (no AI credits). Days are counted in IST.
export const WEEKLY_GOAL = Math.max(1, Number(process.env.WEEKLY_POST_GOAL) || 5);
const IST = "+330 minutes";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type CoachState = {
  streak: number; postedToday: boolean; scheduledToday: number; upcoming: number; thisWeek: number; goal: number;
  daysSinceLast: number | null; week: { day: string; posted: boolean; today: boolean }[];
  bestSlot: string | null; idea: { title: string; format: string; network: string } | null; nudge: string; tip: string | null; goalLine: string | null;
};

const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);

export function coachState(brandId: number): CoachState {
  const d = db();
  const rows = d.prepare(`
    SELECT DISTINCT date(substr(c.published_at, 1, 19), '${IST}') AS day FROM content c JOIN accounts a ON a.id = c.account_id
      WHERE a.brand_id = ? AND a.connector = 'live' AND c.published_at >= datetime('now', '-120 days')
    UNION
    SELECT DISTINCT date(substr(scheduled_at, 1, 19), '${IST}') FROM scheduled_posts WHERE brand_id = ? AND status = 'published'`).all(brandId, brandId) as { day: string }[];
  const days = new Set(rows.map((r) => r.day));
  const today = istDate(new Date());
  const dayOf = (offset: number) => istDate(new Date(Date.now() - offset * 864e5));

  let streak = 0;
  for (let i = days.has(today) ? 0 : 1; days.has(dayOf(i)); i++) streak++;
  const last = [...days].sort().pop();
  const daysSinceLast = last ? Math.round((Date.parse(today) - Date.parse(last)) / 864e5) : null;

  const nowIst = new Date(Date.now() + 5.5 * 3600e3);
  const dow = (nowIst.getUTCDay() + 6) % 7; // 0 = Monday
  const week = DAYS.map((day, i) => { const date = dayOf(dow - i); return { day, posted: i <= dow && days.has(date), today: i === dow }; });
  const thisWeek = week.filter((w) => w.posted).length;

  const sched = d.prepare(`SELECT
      SUM(CASE WHEN date(substr(scheduled_at, 1, 19), '${IST}') = ? THEN 1 ELSE 0 END) AS today, COUNT(*) AS upcoming
    FROM scheduled_posts WHERE brand_id = ? AND status IN ('scheduled', 'pending_approval') AND scheduled_at >= ?`).get(today, brandId, new Date().toISOString()) as { today: number | null; upcoming: number };

  // Best remaining hour today for the brand's main account.
  const best = d.prepare(`SELECT b.hour FROM best_times b JOIN accounts a ON a.id = b.account_id
      WHERE a.brand_id = ? AND b.dow = ? AND b.hour > ? ORDER BY CASE a.network WHEN 'youtube' THEN 0 WHEN 'instagram' THEN 1 ELSE 2 END, b.value DESC LIMIT 1`)
    .get(brandId, dow + 1, nowIst.getUTCHours()) as { hour: number } | undefined;
  const bestSlot = best ? `${String(best.hour).padStart(2, "0")}:00` : null;

  const idea = d.prepare("SELECT title, format, network FROM ai_ideas WHERE brand_id = ? AND vote >= 0 ORDER BY vote DESC, created_at DESC LIMIT 1").get(brandId) as CoachState["idea"] | undefined;
  const tip = (d.prepare("SELECT text FROM coach_tips WHERE brand_id = ? AND day = ?").get(brandId, today) as { text: string } | undefined)?.text ?? null;

  const postedToday = days.has(today);
  const scheduledToday = sched.today ?? 0;
  const left = Math.max(0, WEEKLY_GOAL - thisWeek);
  let nudge: string;
  if (postedToday) nudge = streak > 1 ? `You posted today. That's a ${streak}-day streak, keep it going tomorrow.` : "You posted today. Come back tomorrow to start a streak.";
  else if (scheduledToday) nudge = `${scheduledToday} post${scheduledToday > 1 ? "s" : ""} scheduled for today. You're on track.`;
  else if (streak > 0) nudge = `Nothing scheduled today. Post something to keep your ${streak}-day streak alive${bestSlot ? `; your audience is most active around ${bestSlot}` : ""}.`;
  else if (daysSinceLast !== null && daysSinceLast > 2) nudge = `It's been ${daysSinceLast} days since your last post. A quick Short today restarts the habit${bestSlot ? ` (best time: ${bestSlot})` : ""}.`;
  else nudge = `Nothing scheduled today${bestSlot ? `; best time to post is around ${bestSlot}` : ""}. ${left ? `${left} more post${left > 1 ? "s" : ""} to hit your weekly goal.` : "Weekly goal done!"}`;

  return { streak, postedToday, scheduledToday, upcoming: sched.upcoming, thisWeek, goal: WEEKLY_GOAL, daysSinceLast, week, bestSlot, idea: idea ? { ...idea } : null, nudge, tip, goalLine: topGoalLine(brandId) };
}

export function recentTitles(brandId: number) {
  return (db().prepare(`SELECT c.caption, c.views, a.network FROM content c JOIN accounts a ON a.id = c.account_id
      WHERE a.brand_id = ? AND a.connector = 'live' AND c.published_at >= datetime('now', '-45 days') ORDER BY c.views DESC LIMIT 8`).all(brandId) as { caption: string; views: number; network: string }[])
    .map((r) => `${r.network}: ${String(r.caption ?? "").split("\n")[0].slice(0, 90)} (${r.views} views)`);
}

export function saveTip(brandId: number, text: string) {
  db().prepare("INSERT OR REPLACE INTO coach_tips (brand_id, day, text) VALUES (?, ?, ?)").run(brandId, istDate(new Date()), text);
}
