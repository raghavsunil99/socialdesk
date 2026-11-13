import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validate } from "@/lib/posts";
import { brandFromRequest } from "@/lib/brand";
import { atLeast, forbidden } from "@/lib/auth";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  const cur = db().prepare("SELECT * FROM scheduled_posts WHERE id = ? AND brand_id = ?").get(Number(id), brand.id) as Record<string, unknown> | undefined;
  if (!cur) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (["published", "publishing"].includes(String(cur.status))) return NextResponse.json({ error: "already published" }, { status: 409 });
  const b = { networks: JSON.parse(String(cur.networks)), text: cur.text, media_url: cur.media_url, media_type: cur.media_type, scheduled_at: cur.scheduled_at, status: cur.status === "failed" ? "scheduled" : cur.status, ...(await req.json()) };
  const err = validate(b);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const isEditor = atLeast(brand.role, "editor");
  if (!isEditor && (b.status === "scheduled" || cur.status === "scheduled")) return forbidden("Only editors can schedule, approve or change scheduled posts");
  if (b.status === "scheduled" && cur.status !== "scheduled") db().prepare("UPDATE scheduled_posts SET approved_by = ? WHERE id = ?").run(brand.user.id, Number(id));
  db().prepare("UPDATE scheduled_posts SET networks = ?, text = ?, media_url = ?, media_type = ?, scheduled_at = ?, status = ?, result = NULL WHERE id = ?")
    .run(JSON.stringify(b.networks), b.text, b.media_url || null, b.media_type ?? "IMAGE", new Date(b.scheduled_at).toISOString(), b.status, Number(id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  // creators may only delete drafts and posts waiting for approval
  const allowed = atLeast(brand.role, "editor") ? "status != 'publishing'" : "status IN ('draft', 'pending_approval')";
  const r = db().prepare(`DELETE FROM scheduled_posts WHERE id = ? AND brand_id = ? AND ${allowed}`).run(Number(id), brand.id);
  if (r.changes === 0) return forbidden("You can't delete this post");
  return NextResponse.json({ ok: true });
}
