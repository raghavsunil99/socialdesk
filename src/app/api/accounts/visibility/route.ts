import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brandFromRequest } from "@/lib/brand";

// POST /api/accounts/visibility { network, hidden } -> show or hide a network's tab in Analytics for this brand.
export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "editor");
  if (brand instanceof NextResponse) return brand;
  const { network, hidden } = (await req.json()) as { network?: string; hidden?: boolean };
  const r = db().prepare("UPDATE accounts SET hidden = ? WHERE brand_id = ? AND network = ?").run(hidden ? 1 : 0, brand.id, String(network));
  if (!r.changes) return NextResponse.json({ error: "no such account" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
