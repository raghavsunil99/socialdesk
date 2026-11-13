import { NextResponse } from "next/server";
import { BRAND_COOKIE, listBrands } from "@/lib/brand";
import { getUser, unauthorized } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { id } = (await req.json()) as { id: number };
  if (!listBrands(user.id).some((b) => b.id === Number(id))) return NextResponse.json({ error: "unknown brand" }, { status: 404 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(BRAND_COOKIE, String(id), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
