import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brandFromRequest } from "@/lib/brand";
import { ROLES, type Role } from "@/lib/auth";

function ownerCount(brandId: number) {
  return (db().prepare("SELECT COUNT(*) AS n FROM brand_members WHERE brand_id = ? AND role = 'owner'").get(brandId) as { n: number }).n;
}
function roleOf(brandId: number, userId: number) {
  return (db().prepare("SELECT role FROM brand_members WHERE brand_id = ? AND user_id = ?").get(brandId, userId) as { role: Role } | undefined)?.role;
}

// PATCH { role } — owners only; a brand always keeps at least one owner.
export async function PATCH(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const brand = await brandFromRequest(req, "owner");
  if (brand instanceof NextResponse) return brand;
  const userId = Number((await ctx.params).userId);
  const { role } = (await req.json()) as { role?: Role };
  if (!role || !ROLES.includes(role)) return NextResponse.json({ error: `role must be one of ${ROLES.join(", ")}` }, { status: 400 });
  const current = roleOf(brand.id, userId);
  if (!current) return NextResponse.json({ error: "Not a member of this brand" }, { status: 404 });
  if (current === "owner" && role !== "owner" && ownerCount(brand.id) === 1) return NextResponse.json({ error: "A brand needs at least one owner. Make someone else owner first." }, { status: 400 });
  db().prepare("UPDATE brand_members SET role = ? WHERE brand_id = ? AND user_id = ?").run(role, brand.id, userId);
  return NextResponse.json({ ok: true });
}

// DELETE — owners can remove anyone; anyone can remove themselves (leave the brand).
export async function DELETE(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const userId = Number((await ctx.params).userId);
  const brand = await brandFromRequest(req, "viewer");
  if (brand instanceof NextResponse) return brand;
  if (brand.user.id !== userId && brand.role !== "owner") return NextResponse.json({ error: "Only owners can remove other people" }, { status: 403 });
  const current = roleOf(brand.id, userId);
  if (!current) return NextResponse.json({ error: "Not a member of this brand" }, { status: 404 });
  if (current === "owner" && ownerCount(brand.id) === 1) return NextResponse.json({ error: "A brand needs at least one owner. Make someone else owner first." }, { status: 400 });
  db().prepare("DELETE FROM brand_members WHERE brand_id = ? AND user_id = ?").run(brand.id, userId);
  return NextResponse.json({ ok: true });
}
