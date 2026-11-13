// SEO score for a post (runs in the browser; no AI credits). Weights add up to 100.
import type { Format, PostMeta } from "./posts";

export type Check = { label: string; ok: boolean; tip: string; points: number };

const has = (text: string | undefined, kw: string) => !!kw && !!text && text.toLowerCase().includes(kw.toLowerCase());
const CTA = /(subscribe|follow|comment|save|share|link in bio|watch|join|click|dm|try)/i;
const HOOK = /(\d|\?|how|why|secret|mistake|stop|never|best|top|free|easy|fast)/i;

export function seoScore(m: PostMeta, format: Format): { score: number; checks: Check[] } {
  const kw = (m.keyword ?? "").trim();
  const title = (m.title ?? "").trim();
  const desc = (m.description ?? "").trim();
  const tags = m.tags ?? [];
  const hashtags = m.hashtags ?? [];
  const long = format === "long";
  const [tMin, tMax] = long ? [40, 70] : [20, 60];
  const dMin = long ? 250 : 60;
  const tagChars = tags.join(",").length;
  const checks: Check[] = [
    { label: "Focus keyword set", ok: !!kw, points: 10, tip: "Pick the one phrase people would search for, e.g. \"python tutorial in telugu\"." },
    { label: "Keyword in title", ok: has(title, kw), points: 15, tip: "Put the keyword in the title." },
    { label: "Keyword early in title", ok: !!kw && title.toLowerCase().indexOf(kw.toLowerCase()) > -1 && title.toLowerCase().indexOf(kw.toLowerCase()) < 30, points: 5, tip: "Move the keyword into the first 30 characters." },
    { label: `Title ${tMin}–${tMax} characters`, ok: title.length >= tMin && title.length <= tMax, points: 10, tip: `Title is ${title.length} characters.` },
    { label: "Title has a hook", ok: HOOK.test(title), points: 10, tip: "Add a number, a question or a strong word (mistake, secret, fastest…)." },
    { label: `Description ${dMin}+ characters`, ok: desc.length >= dMin, points: 10, tip: `Description is ${desc.length} characters; explain what viewers get.` },
    { label: "Keyword in first 150 characters of description", ok: has(desc.slice(0, 150), kw), points: 10, tip: "Mention the keyword in the first sentence of the description." },
    { label: "Call to action", ok: CTA.test(desc) || CTA.test(title), points: 10, tip: "Ask viewers to subscribe, comment or save." },
    { label: long ? "5–15 tags, under 500 characters" : "3+ tags", ok: long ? tags.length >= 5 && tags.length <= 15 && tagChars <= 500 : tags.length >= 3, points: 10, tip: `${tags.length} tags (${tagChars} characters).` },
    { label: format === "short" ? "3–5 hashtags incl. #Shorts" : "3–5 hashtags", ok: hashtags.length >= 3 && hashtags.length <= 5 && (format !== "short" || hashtags.some((h) => /^#?shorts$/i.test(h))), points: 10, tip: `${hashtags.length} hashtags.` },
  ];
  const score = checks.reduce((s, c) => s + (c.ok ? c.points : 0), 0);
  return { score, checks };
}
