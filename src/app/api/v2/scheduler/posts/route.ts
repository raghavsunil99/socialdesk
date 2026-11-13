import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rowToPost, validate } from "@/lib/posts";
import { brandFromRequest } from "@/lib/brand";
import { atLeast, forbidden } from "@/lib/auth";

// GET /api/v2/scheduler/posts?start=ISO&end=ISO
export async function GET(req: Request) {
  const brand = await brandFromRequest(req, "viewer");
  if (brand instanceof NextResponse) return brand;
  const u = new URL(req.url).searchParams;
  const start = u.get("start") ?? new Date(Date.now() - 7 * 864e5).toISOString();
  const end = u.get("end") ?? new Date(Date.now() + 30 * 864e5).toISOString();
  const rows = db().prepare("SELECT * FROM scheduled_posts WHERE brand_id = ? AND scheduled_at BETWEEN ? AND ? ORDER BY scheduled_at").all(brand.id, start, end);
  return NextResponse.json({ data: rows.map(rowToPost) });
}

export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  const b = await req.json();
  const err = validate(b);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const status = b.status ?? "scheduled";
  if (status === "scheduled" && !atLeast(brand.role, "editor")) return forbidden("Creators can save drafts or send posts for approval; an editor schedules them");
  const r = db()
    .prepare("INSERT INTO scheduled_posts (brand_id, networks, text, media_url, media_type, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(brand.id, JSON.stringify(b.networks), b.text, b.media_url || null, b.media_type ?? "IMAGE", new Date(b.scheduled_at).toISOString(), status);
  db().prepare("UPDATE scheduled_posts SET created_by = ?, approved_by = ? WHERE id = last_insert_rowid()").run(brand.user.id, status === "scheduled" ? brand.user.id : null);
  return NextResponse.json({ data: { id: Number(r.lastInsertRowid) } }, { status: 201 });
}

