import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { brandFromRequest } from "@/lib/brand";

// Caption assistant. Uses ANTHROPIC_API_KEY (or an `ant auth login` profile) from the server environment.
const SYSTEM = `You write social media captions for the brand named in the request (an Indian creator or ed-tech channel).
Write in natural Telugu-English mix (Tenglish) when the user's idea is in that style, otherwise match the user's language.
Each caption: a strong first line hook, 2-5 short lines of value, one clear call to action, then 3-5 relevant hashtags.
Respect each network's norms (LinkedIn: professional, fewer emojis; Instagram/TikTok: punchy). Never invent prices, dates or offers that the user did not give.
Return exactly 3 alternative captions separated by a line containing only ---. No preamble.`;

export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  const { idea, networks, draft } = (await req.json()) as { idea?: string; networks?: string[]; draft?: string };
  if (!idea?.trim() && !draft?.trim()) return NextResponse.json({ error: "describe the post first" }, { status: 400 });
  let client: Anthropic;
  try {
    client = new Anthropic();
  } catch {
    return NextResponse.json({ error: "The caption assistant needs an Anthropic API key: add ANTHROPIC_API_KEY to web/.env.local and restart the app." }, { status: 503 });
  }
  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `Brand: ${brand.name}\nNetworks: ${(networks ?? ["instagram"]).join(", ")}\n${idea ? `Post idea: ${idea}\n` : ""}${draft ? `Current draft to improve:\n${draft}` : ""}`,
      }],
    });
    if (res.stop_reason === "refusal") return NextResponse.json({ error: "The model declined this request. Try rephrasing the idea." }, { status: 422 });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const options = text.split(/\n-{3,}\n/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
    return NextResponse.json({ data: options });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "No Anthropic credentials on the server. Set ANTHROPIC_API_KEY in web/.env.local and restart." }, { status: 503 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Rate limited – try again in a minute." }, { status: 429 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `Claude API error ${e.status}: ${e.message}` }, { status: 502 });
    if (/authentication method/i.test((e as Error).message))
      return NextResponse.json({ error: "The caption assistant needs an Anthropic API key: add ANTHROPIC_API_KEY to web/.env.local and restart the app." }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
