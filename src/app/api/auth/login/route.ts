import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clearFailedLogins, createSession, loginBlocked, recordFailedLogin, setSessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email || !password) return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  const key = `${email.toLowerCase()}|${req.headers.get("x-forwarded-for") ?? "local"}`;
  if (loginBlocked(key)) return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  const u = db().prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email.trim()) as { id: number; password_hash: string } | undefined;
  // same message whether the email exists or not
  if (!u || !verifyPassword(password, u.password_hash)) {
    recordFailedLogin(key);
    return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
  }
  clearFailedLogins(key);
  const { token, expires } = createSession(u.id);
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, token, expires);
  return res;
}
