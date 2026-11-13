import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { destroyOtherSessions, getUser, hashPassword, passwordProblem, SESSION_COOKIE, unauthorized, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { current, next } = (await req.json()) as { current?: string; next?: string };
  const row = db().prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
  if (!current || !verifyPassword(current, row.password_hash)) return NextResponse.json({ error: "Current password is wrong" }, { status: 400 });
  const problem = passwordProblem(next ?? "");
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next!), user.id);
  destroyOtherSessions(user.id, (await cookies()).get(SESSION_COOKIE)?.value); // sign out other devices
  return NextResponse.json({ ok: true });
}
