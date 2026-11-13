import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brandFromRequest } from "@/lib/brand";
import { hashPassword, passwordProblem, ROLES, type Role } from "@/lib/auth";
import { members } from "@/lib/team";

export async function GET(req: Request) {
  const brand = await brandFromRequest(req, "viewer");
  if (brand instanceof NextResponse) return brand;
  return NextResponse.json({ data: members(brand.id) });
}

// POST { email, role, name?, password? } — adds an existing user to the brand, or creates the user first
// (name + temporary password required). Owners only.
export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "owner");
  if (brand instanceof NextResponse) return brand;
  const b = (await req.json()) as { email?: string; role?: Role; name?: string; password?: string };
  const email = b.email?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  if (!b.role || !ROLES.includes(b.role)) return NextResponse.json({ error: `role must be one of ${ROLES.join(", ")}` }, { status: 400 });
  const d = db();
  let user = d.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;
  let created = false;
  if (!user) {
    if (!b.name?.trim()) return NextResponse.json({ error: "This person doesn't have an account yet: enter their name and a temporary password", needsAccount: true }, { status: 400 });
    const problem = passwordProblem(b.password ?? "");
    if (problem) return NextResponse.json({ error: `Temporary password: ${problem.toLowerCase()}`, needsAccount: true }, { status: 400 });
    user = { id: Number(d.prepare("INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)").run(email, b.name.trim(), hashPassword(b.password!)).lastInsertRowid) };
    created = true;
  }
  const r = d.prepare("INSERT OR IGNORE INTO brand_members (brand_id, user_id, role) VALUES (?, ?, ?)").run(brand.id, user.id, b.role);
  if (r.changes === 0) return NextResponse.json({ error: "Already a member of this brand — change their role in the list instead" }, { status: 409 });
  return NextResponse.json({ ok: true, created }, { status: 201 });
}
