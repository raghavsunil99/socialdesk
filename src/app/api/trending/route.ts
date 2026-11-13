import { NextResponse } from "next/server";
import { brandFromRequest } from "@/lib/brand";
import { trendingInstagram, trendingYouTube } from "@/lib/competitors";

// GET ?network=youtube&q=telugu+tech&days=7&shorts=1   |   ?network=instagram&q=#dataanalytics
// Creators+ (each YouTube search spends 100 of the daily 10,000 quota units).
export async function GET(req: Request) {
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  const u = new URL(req.url).searchParams;
  const q = (u.get("q") ?? "").trim();
  if (!q || q.length > 100) return NextResponse.json({ error: "Enter a keyword or hashtag" }, { status: 400 });
  try {
    if (u.get("network") === "instagram") return NextResponse.json({ data: await trendingInstagram(brand.id, q) });
    const days = [1, 7, 30, 90].includes(Number(u.get("days"))) ? Number(u.get("days")) : 7;
    return NextResponse.json({ data: await trendingYouTube(brand.id, q, days, u.get("shorts") === "1") });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
