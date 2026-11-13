import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seedBrandDemo } from "@/lib/demo";
import { listBrands } from "@/lib/brand";
import { forbidden, getUser, unauthorized } from "@/lib/auth";

// POST { action: "demo" } fills every unconnected network with demo data; { action: "rename", name }
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const user = await getUser();
  if (!user) return unauthorized();
  const brand = listBrands(user.id).find((b) => b.id === id);
  if (!brand) return NextResponse.json({ error: "unknown brand" }, { status: 404 });
  if (brand.role !== "owner") return forbidden("Only the brand's owners can do that");
  const b = (await req.json()) as { action: string; name?: string };
  const d = db();
  if (b.action === "demo") {
    d.exec("BEGIN");
    try { seedBrandDemo(d, id, brand.name); d.exec("COMMIT"); } catch (e) { d.exec("ROLLBACK"); throw e; }
  } else if (b.action === "rename") {
    const name = b.name?.trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    d.prepare("UPDATE brands SET name = ? WHERE id = ?").run(name, id);
  } else return NextResponse.json({ error: "unknown action" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// Deletes the brand and everything that belongs to it (accounts, synced data, posts, competitors, link page).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const user = await getUser();
  if (!user) return unauthorized();
  const brand = listBrands(user.id).find((b) => b.id === id);
  if (!brand) return NextResponse.json({ error: "unknown brand" }, { status: 404 });
  if (brand.role !== "owner") return forbidden("Only the brand's owners can delete it");
  const d = db();
  d.exec("BEGIN");
  try {
    const accIds = (d.prepare("SELECT id FROM accounts WHERE brand_id = ?").all(id) as { id: number }[]).map((a) => a.id);
    for (const a of accIds) for (const t of ["metric_points", "content", "distributions", "best_times"]) d.prepare(`DELETE FROM ${t} WHERE account_id = ?`).run(a);
    d.prepare("DELETE FROM smartlink_clicks WHERE smartlink_id IN (SELECT id FROM smartlinks WHERE brand_id = ?)").run(id);
    for (const t of ["accounts", "scheduled_posts", "competitors", "smartlinks", "brand_members"]) d.prepare(`DELETE FROM ${t} WHERE brand_id = ?`).run(id);
    d.prepare("DELETE FROM brands WHERE id = ?").run(id);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return NextResponse.json({ ok: true });
}
