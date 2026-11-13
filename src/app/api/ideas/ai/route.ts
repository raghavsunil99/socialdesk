import { NextResponse } from "next/server";
import { brandFromRequest } from "@/lib/brand";
import { AiError, generate, parseJson } from "@/lib/ai";
import { competitorOutliers, trends, yourWinners, type IdeaSource } from "@/lib/ideas";

// POST ?network=youtube — Gemini (or Claude) turns the evidence on the Ideas tab into 8 specific videos to record.
const SYSTEM = `You are a content strategist for an Indian creator who makes Telugu tech/AI explainer content.
You get evidence: competitors' outlier posts (× their own median), what's trending for the creator's keywords (views per day), and the creator's own best posts.
Suggest 8 videos the creator should record next. Each must be grounded in the evidence, adapted to the creator's own style and strengths, and not a copy of someone else's video.
Write titles the way Telugu creators do: Telugu script with English keywords, a strong hook (warning, number, ₹ amount, question), under 70 characters.
Return only JSON: {"ideas":[{"title":"","hook":"first 3 seconds, spoken","format":"Short | Long video","why":"one sentence citing the evidence (who/what and the number)","outline":["3-5 short beats"]}]}`;

const fmt = (p: IdeaSource) =>
  `- [${p.source}] ${p.from}: "${p.caption.replace(/\s+/g, " ").slice(0, 110)}" — ${p.views ?? p.likes} ${p.views !== null ? "views" : "likes"}, ${p.perDay ?? "?"} /day${p.outlier ? `, ${p.outlier}× median` : ""}${p.keyword ? ` (keyword: ${p.keyword})` : ""}`;

export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  const network = new URL(req.url).searchParams.get("network") === "instagram" ? "instagram" : "youtube";
  const evidence = [...competitorOutliers(brand.id, network).slice(0, 15), ...(await trends(brand.id, network)).items.slice(0, 15), ...yourWinners(brand.id, network)];
  if (evidence.length < 3) return NextResponse.json({ error: "Track a few competitors or add niche keywords first, so there's evidence to work from." }, { status: 400 });

  try {
    const text = await generate({ system: SYSTEM, prompt: `Brand: ${brand.name}\nNetwork: ${network}\n\nEvidence:\n${evidence.map(fmt).join("\n")}`, json: true, maxTokens: 8192 });
    return NextResponse.json({ data: parseJson<{ ideas: unknown[] }>(text).ideas ?? [] });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError((e as Error).message, 500);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
