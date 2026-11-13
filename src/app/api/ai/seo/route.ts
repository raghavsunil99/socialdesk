import { NextResponse } from "next/server";
import { brandFromRequest } from "@/lib/brand";
import { AiError, generate, parseJson, takeAiCall } from "@/lib/ai";

// One AI call -> 3 titles, a description, tags, hashtags and a focus keyword for a video or post.
const SYSTEM = `You are a YouTube and Instagram SEO assistant for an Indian creator or ed-tech brand.
Match the user's language: if their topic is in Telugu-English mix (Tenglish), write titles that way; keep the focus keyword in the form people actually search.
Rules: titles hook in the first words and contain the keyword; Shorts titles under 60 characters, long-video titles 45-70 characters.
Description: first sentence contains the keyword, then what the viewer learns, then one call to action. Long videos: 3-6 short paragraphs; Shorts/Reels: 2-3 lines.
Tags: 8-15 search phrases for long videos, 5-8 for Shorts. Hashtags: 3-5, include #Shorts for Shorts.
Never invent prices, dates, offers or links.
Return JSON only: {"keyword": string, "titles": [string, string, string], "description": string, "tags": string[], "hashtags": string[]}`;

export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  const { topic, format, keyword, draft } = (await req.json()) as { topic?: string; format?: string; keyword?: string; draft?: { title?: string; description?: string } };
  if (!topic?.trim() && !draft?.title?.trim()) return NextResponse.json({ error: "Describe the video first" }, { status: 400 });
  try {
    takeAiCall(brand.id);
    const text = await generate({
      system: SYSTEM, json: true, maxTokens: 2048,
      prompt: `Brand: ${brand.name}\nFormat: ${format === "long" ? "long YouTube video" : format === "short" ? "vertical short (YouTube Shorts + Instagram/Facebook Reels)" : "Instagram/Facebook post"}\n${topic ? `Topic: ${topic}\n` : ""}${keyword ? `Focus keyword: ${keyword}\n` : ""}${draft?.title ? `Current title: ${draft.title}\n` : ""}${draft?.description ? `Current description: ${draft.description}\n` : ""}`,
      log: { brandId: brand.id, userId: brand.user.id, kind: "seo" },
    });
    return NextResponse.json({ data: parseJson<{ keyword: string; titles: string[]; description: string; tags: string[]; hashtags: string[] }>(text) });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError((e as Error).message, 500);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
