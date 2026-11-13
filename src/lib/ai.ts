import "server-only";
import { FinishReason, GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";

// One place for the app's AI calls (caption assistant, video ideas).
// Uses Google Gemini when GEMINI_API_KEY is set (free tier available), otherwise Claude with ANTHROPIC_API_KEY.

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

export class AiError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export const aiProvider = () => (process.env.GEMINI_API_KEY ? "gemini" : process.env.ANTHROPIC_API_KEY ? "claude" : null);

let gemini: GoogleGenAI | null = null;

/** Returns the model's text. With json: true the model is asked for JSON only. */
export type AiLog = { brandId: number; userId?: number; kind: "caption" | "ideas" };

export async function generate(opts: { system: string; prompt: string; json?: boolean; maxTokens?: number; log?: AiLog }): Promise<string> {
  const usage = { input: 0, output: 0 };
  const provider = aiProvider();
  try {
    const text = await callModel(opts, usage);
    record(opts.log, provider, usage, null);
    return text;
  } catch (e) {
    record(opts.log, provider, usage, (e as Error).message);
    throw e;
  }
}

function record(log: AiLog | undefined, provider: string | null, usage: { input: number; output: number }, error: string | null) {
  if (!log || !provider) return;
  db().prepare("INSERT INTO ai_calls (brand_id, user_id, kind, provider, model, input_tokens, output_tokens, ok, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(log.brandId, log.userId ?? null, log.kind, provider, provider === "gemini" ? GEMINI_MODEL : "claude-opus-5-5", usage.input, usage.output, error ? 0 : 1, error?.slice(0, 300) ?? null);
}

async function callModel({ system, prompt, json = false, maxTokens = 4096 }: { system: string; prompt: string; json?: boolean; maxTokens?: number }, usage: { input: number; output: number }): Promise<string> {
  const provider = aiProvider();
  if (!provider) throw new AiError("AI needs a key: add GEMINI_API_KEY (free at aistudio.google.com) to .env.local and restart the app.", 503);

  if (provider === "gemini") {
    gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
      const res = await gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction: system, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: "application/json" } : {}) },
      });
      usage.input = res.usageMetadata?.promptTokenCount ?? 0;
      usage.output = (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0);
      if (res.promptFeedback?.blockReason) throw new AiError("Gemini's safety filters blocked this request. Try rephrasing.", 422);
      const finish = res.candidates?.[0]?.finishReason;
      if (finish && finish !== FinishReason.STOP && finish !== FinishReason.MAX_TOKENS) throw new AiError(`Gemini stopped early (${finish}). Try rephrasing.`, 422);
      const text = res.text ?? "";
      if (!text.trim()) throw new AiError("Gemini returned an empty answer. Try again.");
      return text;
    } catch (e) {
      if (e instanceof AiError) throw e;
      const msg = (e as Error).message ?? String(e);
      if (/API key|PERMISSION_DENIED|401|403/i.test(msg)) throw new AiError("Gemini rejected the API key. Check GEMINI_API_KEY in .env.local.", 503);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) throw new AiError("Gemini rate limit or free-tier quota reached. Wait a minute and try again.", 429);
      if (/not found|404/i.test(msg)) throw new AiError(`Gemini model "${GEMINI_MODEL}" wasn't found. Set GEMINI_MODEL in .env.local to a current model.`, 502);
      throw new AiError(`Gemini error: ${msg.slice(0, 200)}`);
    }
  }

  const client = new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: json ? "medium" : "low" },
      system,
      messages: [{ role: "user", content: prompt }],
    });
    usage.input = res.usage.input_tokens;
    usage.output = res.usage.output_tokens;
    if (res.stop_reason === "refusal") throw new AiError("The model declined this request.", 422);
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("Claude rejected the API key. Check ANTHROPIC_API_KEY.", 503);
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Rate limited. Try again in a minute.", 429);
    if (e instanceof Anthropic.APIError) throw new AiError(`Claude API error ${e.status}: ${e.message}`);
    throw new AiError((e as Error).message);
  }
}

/** Pulls the first JSON object out of a model reply (tolerates code fences). */
export function parseJson<T>(text: string): T {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new AiError("The AI reply wasn't valid JSON. Try again.");
  try { return JSON.parse(text.slice(start, end + 1)) as T; } catch { throw new AiError("The AI reply wasn't valid JSON. Try again."); }
}

// ---- usage limit: AI calls per brand per day (AI_DAILY_LIMIT, default 10) ----
export const dailyLimit = () => Math.max(1, Number(process.env.AI_DAILY_LIMIT) || 10);
const today = () => new Date().toISOString().slice(0, 10);
export function usageToday(brandId: number) {
  const r = db().prepare("SELECT calls FROM ai_usage WHERE brand_id = ? AND day = ?").get(brandId, today()) as { calls: number } | undefined;
  return { used: r?.calls ?? 0, limit: dailyLimit() };
}
/** Throws if the brand has used its AI calls for today; otherwise counts one. */
export function takeAiCall(brandId: number) {
  const { used, limit } = usageToday(brandId);
  if (used >= limit) throw new AiError(`Today's AI limit for this brand is used up (${limit} calls). It resets at midnight UTC, or raise AI_DAILY_LIMIT in .env.local.`, 429);
  db().prepare("INSERT INTO ai_usage (brand_id, day, calls) VALUES (?, ?, 1) ON CONFLICT(brand_id, day) DO UPDATE SET calls = calls + 1").run(brandId, today());
}
