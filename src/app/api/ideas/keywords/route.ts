import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brandFromRequest } from "@/lib/brand";

const NETS = ["youtube", "instagram"];

// POST { network, keyword } — save a niche keyword for the Ideas tab. Creators+.
export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  const b = (await req.json()) as { network?: string; keyword?: string };
  const keyword = b.keyword?.trim().replace(/\s+/g, " ");
  if (!b.network || !NETS.includes(b.network)) return NextResponse.json({ error: "Pick YouTube or Instagram" }, { status: 400 });
  if (!keyword || keyword.length > 60) return NextResponse.json({ error: "Enter a keyword (up to 60 characters)" }, { status: 400 });
  const n = (db().prepare("SELECT COUNT(*) AS n FROM brand_keywords WHERE brand_id = ? AND network = ?").get(brand.id, b.network) as { n: number }).n;
  if (n >= 8) return NextResponse.json({ error: "Up to 8 keywords per network (each YouTube search uses API quota)" }, { status: 400 });
  db().prepare("INSERT OR IGNORE INTO brand_keywords (brand_id, network, keyword) VALUES (?, ?, ?)").run(brand.id, b.network, keyword);
  return NextResponse.json({ ok: true });
}

// DELETE ?network=&keyword=
export async function DELETE(req: Request) {
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  const u = new URL(req.url).searchParams;
  db().prepare("DELETE FROM brand_keywords WHERE brand_id = ? AND network = ? AND keyword = ?").run(brand.id, u.get("network"), u.get("keyword"));
  db().prepare("DELETE FROM trend_cache WHERE brand_id = ? AND network = ? AND keyword = ?").run(brand.id, u.get("network"), u.get("keyword"));
  return NextResponse.json({ ok: true });
}
