import { NextResponse } from "next/server";
import { brandFromRequest } from "@/lib/brand";
import { AiError, generate, takeAiCall } from "@/lib/ai";
import { coachState, recentTitles, saveTip } from "@/lib/coach";

// POST /api/coach -> today's AI coaching tip (1 credit, cached for the day).
export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  const s = coachState(brand.id);
  if (s.tip) return NextResponse.json({ data: s.tip });
  try {
    takeAiCall(brand.id);
    const text = await generate({
      system: `You are a friendly, direct posting coach for an Indian creator / ed-tech brand. Write 3 short lines, no preamble, no markdown headings:
1) one line of encouragement based on their real numbers (never exaggerate),
2) one specific Short/Reel to record TODAY (a concrete title and the first spoken line), based on what performed best,
3) one small habit tip. Use simple English; Tenglish is fine if their titles use it.`,
      prompt: `Brand: ${brand.name}\nStreak: ${s.streak} days\nPosts this week: ${s.thisWeek}/${s.goal}\nDays since last post: ${s.daysSinceLast ?? "unknown"}\nBest time today: ${s.bestSlot ?? "unknown"}\n${s.goalLine ? `Monthly goal status: ${s.goalLine}\n` : ""}Top recent content:\n${recentTitles(brand.id).join("\n") || "none yet"}\n${s.idea ? `Their favourite saved idea: ${s.idea.title}` : ""}`,
      maxTokens: 600,
      log: { brandId: brand.id, userId: brand.user.id, kind: "coach" },
    });
    saveTip(brand.id, text.trim());
    return NextResponse.json({ data: text.trim() });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError((e as Error).message, 500);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
