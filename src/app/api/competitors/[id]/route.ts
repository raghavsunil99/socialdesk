import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brandFromRequest } from "@/lib/brand";
import { refreshCompetitor } from "@/lib/competitors";

function owned(id: number, brandId: number) {
  return db().prepare("SELECT id FROM competitors WHERE id = ? AND brand_id = ?").get(id, brandId) !== undefined;
}

// POST — refresh now. Editors+.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const brand = await brandFromRequest(req, "editor");
  if (brand instanceof NextResponse) return brand;
  const id = Number((await ctx.params).id);
  if (!owned(id, brand.id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try { await refreshCompetitor(id); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
  return NextResponse.json({ ok: true });
}

// DELETE — stop tracking. Editors+.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const brand = await brandFromRequest(req, "editor");
  if (brand instanceof NextResponse) return brand;
  const id = Number((await ctx.params).id);
  if (!owned(id, brand.id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  db().prepare("DELETE FROM competitor_posts WHERE competitor_id = ?").run(id);
  db().prepare("DELETE FROM competitors WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
