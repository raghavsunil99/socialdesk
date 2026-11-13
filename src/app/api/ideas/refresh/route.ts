import { NextResponse } from "next/server";
import { brandFromRequest } from "@/lib/brand";
import { trends } from "@/lib/ideas";

// POST ?network=youtube — re-run the trend searches now instead of waiting for the 6-hour cache. Creators+.
export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  const network = new URL(req.url).searchParams.get("network") === "instagram" ? "instagram" : "youtube";
  const r = await trends(brand.id, network, true);
  return NextResponse.json({ ok: true, errors: r.errors, count: r.items.length });
}
