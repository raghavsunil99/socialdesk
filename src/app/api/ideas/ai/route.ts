import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brandFromRequest } from "@/lib/brand";
import { AiError, generate, parseJson, takeAiCall, usageToday } from "@/lib/ai";
import { competitorOutliers, trends, yourWinners, type IdeaSource } from "@/lib/ideas";

// POST ?network=youtube — one AI call that adds 4 Shorts + 3 long-video ideas to the brand's stored ideas.
// Ideas are saved, so visiting the page never spends credits; liked/disliked ideas steer the next batch.

const SYSTEM = `You are a content strategist for a Telugu creator making tech/AI/explainer videos.
From the evidence (competitor outliers as × their median, trending posts with views/day, the creator's own hits) and the creator's feedback, suggest NEW videos:
exactly 4 Shorts (under 60 s, one sharp point) and 3 long videos (6-12 min, deeper explainers/tutorials).
Rules: ground each idea in the evidence; adapt, never copy; follow the creator's likes, avoid anything like the dislikes; don't repeat existing titles.
Titles: Telugu script with English keywords only (no other Indian scripts), a strong hook (warning, number, ₹ amount, question), under 70 characters.
Return only JSON: {"ideas":[{"format":"short"|"long","title":"","hook":"first 3 seconds, spoken","outline":["3-5 short beats"],"why":"one sentence citing the evidence and its number"}]}`;

const line = (p: IdeaSource) =>
  `- ${p.from}: "${p.caption.replace(/\s+/g, " ").slice(0, 80)}" ${p.views ?? p.likes}${p.views !== null ? "v" : "likes"}${p.outlier ? ` ${p.outlier}x` : ""}${p.perDay ? ` ${p.perDay}/d` : ""}`;

export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  const network = new URL(req.url).searchParams.get("network") === "instagram" ? "instagram" : "youtube";

  // Keep the prompt small: the strongest evidence only.
  const outliers = competitorOutliers(brand.id, network).slice(0, 8);
  const rising = (await trends(brand.id, network)).items.slice(0, 8); // served from the 6-hour cache
  const mine = yourWinners(brand.id, network).slice(0, 4);
  if (outliers.length + rising.length + mine.length < 3)
    return NextResponse.json({ error: "Track a few competitors or add niche keywords first, so there's evidence to work from." }, { status: 400 });

  const past = db().prepare("SELECT title, vote FROM ai_ideas WHERE brand_id = ? AND network = ? ORDER BY id DESC LIMIT 60").all(brand.id, network) as { title: string; vote: number }[];
  const liked = past.filter((p) => p.vote > 0).slice(0, 10).map((p) => `- ${p.title}`);
  const disliked = past.filter((p) => p.vote < 0).slice(0, 10).map((p) => `- ${p.title}`);
  const existing = past.slice(0, 30).map((p) => `- ${p.title}`);

  const prompt = [
    `Creator: ${brand.name} (${network})`,
    `Competitor outliers:\n${outliers.map(line).join("\n") || "- none"}`,
    `Trending now:\n${rising.map(line).join("\n") || "- none"}`,
    `Creator's own hits:\n${mine.map(line).join("\n") || "- none"}`,
    liked.length ? `The creator LIKED these ideas. Suggest NEW topics in the same style and niche, not the same videos again:\n${liked.join("\n")}` : "",
    disliked.length ? `The creator DISLIKED these ideas (avoid similar topics and styles):\n${disliked.join("\n")}` : "",
    existing.length ? `Already suggested, including liked ones (never repeat these topics):\n${existing.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  try {
    takeAiCall(brand.id);
    const text = await generate({ system: SYSTEM, prompt, json: true, maxTokens: 3000 });
    const ideas = (parseJson<{ ideas?: { format?: string; title?: string; hook?: string; outline?: string[]; why?: string }[] }>(text).ideas ?? [])
      .filter((i) => i.title?.trim())
      .slice(0, 10);
    // Skip near-duplicates of anything already suggested (same leading words).
    const key = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
    const seen = new Set(past.map((p) => key(p.title)));
    const fresh = ideas.filter((i) => { const k = key(i.title!); if (seen.has(k)) return false; seen.add(k); return true; });
    const ins = db().prepare("INSERT INTO ai_ideas (brand_id, network, format, title, hook, why, outline) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const i of fresh) ins.run(brand.id, network, /long/i.test(i.format ?? "") ? "long" : "short", i.title!.trim(), i.hook ?? "", i.why ?? "", JSON.stringify(i.outline ?? []));
    return NextResponse.json({ added: fresh.length, skippedDuplicates: ideas.length - fresh.length, usage: usageToday(brand.id) });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError((e as Error).message, 500);
    return NextResponse.json({ error: err.message, usage: usageToday(brand.id) }, { status: err.status });
  }
}
