import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brandFromRequest } from "@/lib/brand";

// PATCH { vote: 1 | -1 | 0 } — like / dislike / clear. Votes steer the next AI batch. Creators+.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  const { vote } = (await req.json()) as { vote?: number };
  if (![1, -1, 0].includes(Number(vote))) return NextResponse.json({ error: "vote must be 1, -1 or 0" }, { status: 400 });
  const r = db().prepare("UPDATE ai_ideas SET vote = ? WHERE id = ? AND brand_id = ?").run(Number(vote), Number((await ctx.params).id), brand.id);
  return r.changes ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
}

// DELETE — remove an idea for good.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  db().prepare("DELETE FROM ai_ideas WHERE id = ? AND brand_id = ?").run(Number((await ctx.params).id), brand.id);
  return NextResponse.json({ ok: true });
}
