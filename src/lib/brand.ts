import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "./db";
import { atLeast, forbidden, getUser, requireUser, unauthorized, type Role, type User } from "./auth";

export type Brand = { id: number; name: string; timezone: string; role: Role };
export const BRAND_COOKIE = "brand";

/** Brands this user is a member of, with their role in each. */
export function listBrands(userId: number): Brand[] {
  return (
    db()
      .prepare("SELECT b.id, b.name, b.timezone, m.role FROM brands b JOIN brand_members m ON m.brand_id = b.id WHERE m.user_id = ? ORDER BY b.id")
      .all(userId) as Brand[]
  ).map((b) => ({ id: b.id, name: b.name, timezone: b.timezone, role: b.role }));
}

/** Pages: the logged-in user and the brand picked in the switcher (falls back to their first brand). */
export async function currentBrand(): Promise<Brand & { user: User }> {
  const user = await requireUser();
  const brands = listBrands(user.id);
  if (brands.length === 0) redirect("/welcome");
  const wanted = Number((await cookies()).get(BRAND_COOKIE)?.value);
  return { ...(brands.find((b) => b.id === wanted) ?? brands[0]), user };
}

/**
 * API routes: resolve the user and brand (?blogId= wins over the cookie) and check the role.
 * Returns a NextResponse (401/403) when the caller isn't allowed; callers return it as-is.
 */
export async function brandFromRequest(req: Request, min: Role = "viewer"): Promise<(Brand & { user: User }) | NextResponse> {
  const user = await getUser();
  if (!user) return unauthorized();
  const brands = listBrands(user.id);
  const q = Number(new URL(req.url).searchParams.get("blogId"));
  const cookieId = Number((await cookies()).get(BRAND_COOKIE)?.value);
  const brand = q ? brands.find((b) => b.id === q) : brands.find((b) => b.id === cookieId) ?? brands[0];
  if (!brand) return q ? forbidden("You're not a member of that brand") : forbidden("You're not a member of any brand yet");
  if (!atLeast(brand.role, min)) return forbidden(`This needs the ${min} role or higher; you're a ${brand.role} on ${brand.name}`);
  return { ...brand, user };
}
