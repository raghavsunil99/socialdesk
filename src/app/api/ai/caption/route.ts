import { NextResponse } from "next/server";
import { brandFromRequest } from "@/lib/brand";
import { AiError, generate, takeAiCall } from "@/lib/ai";

// Caption assistant (Gemini, or Claude as a fallback — see lib/ai.ts).
const SYSTEM = `You write social media captions for the brand named in the request (an Indian creator or ed-tech channel).
Write in natural Telugu-English mix (Tenglish) when the user's idea is in that style, otherwise match the user's language.
Each caption: a strong first line hook, 2-5 short lines of value, one clear call to action, then 3-5 relevant hashtags.
Respect each network's norms (LinkedIn: professional, fewer emojis; Instagram/TikTok/YouTube Shorts: punchy; X: under 280 characters).
Never invent prices, dates or offers that the user did not give.
Return exactly 3 alternative captions separated by a line containing only ---. No preamble.`;

export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  const { idea, networks, draft } = (await req.json()) as { idea?: string; networks?: string[]; draft?: string };
  if (!idea?.trim() && !draft?.trim()) return NextResponse.json({ error: "describe the post first" }, { status: 400 });
  try {
    takeAiCall(brand.id);
    const text = await generate({
      system: SYSTEM,
      prompt: `Brand: ${brand.name}\nNetworks: ${(networks ?? ["instagram"]).join(", ")}\n${idea ? `Post idea: ${idea}\n` : ""}${draft ? `Current draft to improve:\n${draft}` : ""}`,
      maxTokens: 2048,
      log: { brandId: brand.id, userId: brand.user.id, kind: "caption" },
    });
    const options = text.split(/\n\s*-{3,}\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
    return NextResponse.json({ data: options });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError((e as Error).message, 500);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
