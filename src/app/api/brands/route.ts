import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createBrand } from "@/lib/demo";
import { BRAND_COOKIE, listBrands } from "@/lib/brand";
import { getUser, unauthorized } from "@/lib/auth";

export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  return NextResponse.json({ data: listBrands(user.id) });
}

// POST { name, timezone?, demo? } → creates a brand and switches to it
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const b = (await req.json()) as { name?: string; timezone?: string; demo?: boolean };
  const name = b.name?.trim();
  if (!name || name.length > 60) return NextResponse.json({ error: "brand name is required (max 60 characters)" }, { status: 400 });
  if (listBrands(user.id).some((x) => x.name.toLowerCase() === name.toLowerCase())) return NextResponse.json({ error: "a brand with that name already exists" }, { status: 409 });
  const tz = b.timezone?.trim() || "Asia/Kolkata";
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { return NextResponse.json({ error: "unknown timezone" }, { status: 400 }); }
  const id = createBrand(db(), name, tz, Boolean(b.demo), user.id);
  const res = NextResponse.json({ data: { id } }, { status: 201 });
  res.cookies.set(BRAND_COOKIE, String(id), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
