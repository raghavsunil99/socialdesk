import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, hashPassword, passwordProblem, setSessionCookie, userCount } from "@/lib/auth";

// First run only: creates the first account and makes it owner of every existing brand.
export async function POST(req: Request) {
  if (userCount() > 0) return NextResponse.json({ error: "Setup is already done. Log in instead." }, { status: 409 });
  const { name, email, password } = (await req.json()) as { name?: string; email?: string; password?: string };
  if (!name?.trim() || !email?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return NextResponse.json({ error: "Name and a valid email are required" }, { status: 400 });
  const problem = passwordProblem(password ?? "");
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const d = db();
  d.exec("BEGIN");
  let userId: number;
  try {
    userId = Number(d.prepare("INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)").run(email.trim(), name.trim(), hashPassword(password!)).lastInsertRowid);
    d.prepare("INSERT INTO brand_members (brand_id, user_id, role) SELECT id, ?, 'owner' FROM brands").run(userId);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  const { token, expires } = createSession(userId);
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, token, expires);
  return res;
}
