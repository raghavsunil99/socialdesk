// SEO / reach score for a post (runs in the browser; no AI credits). Each format has its own checklist,
// weighted and normalised to 100. Checks are grouped so the creator sees what matters most first.
import type { Format, PostMeta } from "./posts";

export type Check = { label: string; ok: boolean; tip: string; points: number; group: "Search" | "Hook" | "Engagement" | "Format" };

const low = (s: string) => s.toLowerCase();
const has = (text: string | undefined, kw: string) => !!kw && !!text && low(text).includes(low(kw));
const CTA = /(subscribe|follow|comment|save|share|link in bio|watch|join|click|dm|try|tag a friend|bookmark|cheyandi|cheyyandi)/i;
const HOOK = /(\d|\?|how|why|secret|mistake|stop|never|best|top|free|easy|fast|vs|before|after|truth|nobody|only)/i;
const CLICKBAIT = /(you won'?t believe|gone wrong|shocking|insane!{2,})/i;
const CHAPTERS = /(^|\n)\s*0?0:00\b/;
const EMOJI = /\p{Extended_Pictographic}/gu;
const capsRatio = (s: string) => { const l = s.replace(/[^A-Za-z]/g, ""); return l ? l.replace(/[^A-Z]/g, "").length / l.length : 0; };

export function seoScore(m: PostMeta, format: Format, caption = ""): { score: number; checks: Check[] } | null {
  if (format === "story") return null; // stories have no searchable text
  const kw = (m.keyword ?? "").trim();
  const hashtags = m.hashtags ?? [];
  let checks: Check[];

  if (format === "short" || format === "long") {
    const title = (m.title ?? "").trim();
    const desc = (m.description ?? "").trim();
    const tags = m.tags ?? [];
    const long = format === "long";
    const [tMin, tMax] = long ? [40, 70] : [20, 60];
    const dMin = long ? 250 : 60;
    const tagChars = tags.join(",").length;
    const kwPos = kw ? low(title).indexOf(low(kw)) : -1;
    checks = [
      { group: "Search", label: "Focus keyword set", ok: !!kw, points: 10, tip: "Pick the one phrase people would search for, e.g. \"python tutorial in telugu\"." },
      { group: "Search", label: "Keyword in title", ok: kwPos > -1, points: 15, tip: "Put the keyword in the title." },
      { group: "Search", label: "Keyword early in title", ok: kwPos > -1 && kwPos < 30, points: 5, tip: "Move the keyword into the first 30 characters (mobile cuts long titles)." },
      { group: "Search", label: "Keyword in first 150 characters of description", ok: has(desc.slice(0, 150), kw), points: 10, tip: "Mention the keyword in the first sentence of the description." },
      { group: "Search", label: "Keyword in tags", ok: tags.some((t) => has(t, kw) || has(kw, t)), points: 5, tip: "Add the keyword itself as a tag." },
      { group: "Search", label: long ? "5–15 tags, under 500 characters" : "3+ tags", ok: long ? tags.length >= 5 && tags.length <= 15 && tagChars <= 500 : tags.length >= 3, points: 5, tip: `${tags.length} tags (${tagChars} characters).` },
      { group: "Hook", label: `Title ${tMin}–${tMax} characters`, ok: title.length >= tMin && title.length <= tMax, points: 10, tip: `Title is ${title.length} characters.` },
      { group: "Hook", label: "Title has a hook", ok: HOOK.test(title), points: 10, tip: "Add a number, a question or a strong word (mistake, secret, fastest…)." },
      { group: "Hook", label: "Not shouting or clickbait", ok: !!title && capsRatio(title) < 0.5 && !CLICKBAIT.test(title), points: 5, tip: "Too many CAPITALS or clickbait phrases can hurt trust and click-through." },
      { group: "Engagement", label: `Description ${dMin}+ characters`, ok: desc.length >= dMin, points: 5, tip: `Description is ${desc.length} characters; explain what viewers get.` },
      { group: "Engagement", label: "Call to action", ok: CTA.test(desc) || CTA.test(title), points: 10, tip: "Ask viewers to subscribe, comment or save." },
      { group: "Format", label: format === "short" ? "3–5 hashtags incl. #Shorts" : "3–5 hashtags", ok: hashtags.length >= 3 && hashtags.length <= 5 && (format !== "short" || hashtags.some((h) => /^#?shorts$/i.test(h))), points: 5, tip: `${hashtags.length} hashtags. More than 15 and YouTube ignores them all.` },
      ...(long ? [{ group: "Format" as const, label: "Chapters (timestamps starting 0:00)", ok: CHAPTERS.test(desc), points: 5, tip: "Add chapters like \"0:00 Intro\" in the description: they show in search and keep viewers watching." }] : []),
    ];
  } else {
    // Instagram / Facebook caption (post or carousel). Instagram search reads captions, not hashtags alone.
    const text = caption.trim();
    const first = text.split("\n")[0] ?? "";
    const tags = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
    const emojis = (text.match(EMOJI) ?? []).length;
    const slides = (m.media ?? []).length;
    checks = [
      { group: "Search", label: "Focus keyword set", ok: !!kw, points: 10, tip: "Pick the phrase people would search on Instagram, e.g. \"sql interview questions\"." },
      { group: "Search", label: "Keyword in the first line", ok: has(first, kw), points: 15, tip: "Instagram search weighs the start of the caption; put the keyword in line one." },
      { group: "Hook", label: "First line under 125 characters", ok: first.length > 0 && first.length <= 125, points: 10, tip: `First line is ${first.length} characters; Instagram cuts the rest behind "more".` },
      { group: "Hook", label: "First line has a hook", ok: HOOK.test(first), points: 10, tip: "Open with a number, a question or a bold claim." },
      { group: "Engagement", label: "Call to action", ok: CTA.test(text), points: 15, tip: format === "carousel" ? "Ask people to save or share the carousel; saves push carousels the most." : "Ask people to comment, save or share." },
      { group: "Engagement", label: "Caption 150–2,200 characters", ok: text.length >= 150 && text.length <= 2200, points: 10, tip: `Caption is ${text.length} characters; give a little context, not just hashtags.` },
      { group: "Engagement", label: "Readable: line breaks, 1–5 emojis", ok: text.includes("\n") && emojis >= 1 && emojis <= 5, points: 5, tip: `${emojis} emojis; break the caption into short lines.` },
      { group: "Format", label: "3–5 hashtags", ok: tags.length >= 3 && tags.length <= 5, points: 10, tip: `${tags.length} hashtags. Instagram now recommends 3–5 relevant ones.` },
      ...(format === "carousel" ? [{ group: "Format" as const, label: "5–10 slides", ok: slides >= 5 && slides <= 10, points: 15, tip: `${slides} slides. Carousels with 5+ slides get more time spent and re-shows.` }] : []),
    ];
  }
  const total = checks.reduce((s, c) => s + c.points, 0);
  const score = Math.round((100 * checks.reduce((s, c) => s + (c.ok ? c.points : 0), 0)) / total);
  return { score, checks };
}
