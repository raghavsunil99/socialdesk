import "server-only";
import { FinishReason, GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";

// One place for the app's AI calls (caption assistant, video ideas).
// Uses Google Gemini when GEMINI_API_KEY is set (free tier available), otherwise Claude with ANTHROPIC_API_KEY.

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

export class AiError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export const aiProvider = () => (process.env.GEMINI_API_KEY ? "gemini" : process.env.ANTHROPIC_API_KEY ? "claude" : null);

let gemini: GoogleGenAI | null = null;

/** Returns the model's text. With json: true the model is asked for JSON only. */
export async function generate({ system, prompt, json = false, maxTokens = 4096 }: { system: string; prompt: string; json?: boolean; maxTokens?: number }): Promise<string> {
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
