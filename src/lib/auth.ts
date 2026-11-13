import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "./db";

export const SESSION_COOKIE = "sd_session";
const SESSION_DAYS = 30;

export type User = { id: number; email: string; name: string };
export const ROLES = ["viewer", "creator", "editor", "owner"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_INFO: Record<Role, string> = {
  owner: "Everything, including connections, team and deleting the brand",
  editor: "Schedule and publish, approve posts, manage competitors and SmartLinks",
  creator: "Write drafts and send them for approval; can't publish",
  viewer: "Read-only analytics and reports",
};
export const atLeast = (role: Role, min: Role) => ROLES.indexOf(role) >= ROLES.indexOf(min);

// ---- passwords (scrypt, per-user salt) ----
export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
export function verifyPassword(pw: string, stored: string) {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
export function passwordProblem(pw: string) {
  return pw.length < 10 ? "Password must be at least 10 characters" : null;
}

// ---- sessions ----
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const sqlTime = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);

export function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db().prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  db().prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, sqlTime(expires));
  return { token, expires };
}
export function setSessionCookie(res: NextResponse, token: string, expires: Date) {
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires });
}
export function destroySession(token: string | undefined) {
  if (token) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}
/** Log a user out everywhere except (optionally) one session — used after a password change. */
export function destroyOtherSessions(userId: number, keepToken?: string) {
  db().prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(userId, keepToken ? sha256(keepToken) : "");
}

/** The logged-in user, or null. */
export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const u = db()
    .prepare("SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > datetime('now')")
    .get(sha256(token)) as User | undefined;
  return u ? { id: u.id, email: u.email, name: u.name } : null;
}

export function userCount() {
  return (db().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

/** Pages: send anonymous visitors to /login (or /setup before the first account exists). */
export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) redirect(userCount() === 0 ? "/setup" : "/login");
  return u;
}

// ---- brute-force protection: 5 failed logins per email+IP per 15 minutes ----
const g = globalThis as unknown as { __attempts?: Map<string, number[]> };
const attempts: Map<string, number[]> = (g.__attempts ??= new Map());
export function loginBlocked(key: string) {
  const recent = (attempts.get(key) ?? []).filter((t) => Date.now() - t < 15 * 60e3);
  attempts.set(key, recent);
  return recent.length >= 5;
}
export function recordFailedLogin(key: string) {
  attempts.set(key, [...(attempts.get(key) ?? []), Date.now()]);
}
export function clearFailedLogins(key: string) {
  attempts.delete(key);
}

export const forbidden = (msg = "You don't have permission to do that for this brand") => NextResponse.json({ error: msg }, { status: 403 });
export const unauthorized = () => NextResponse.json({ error: "Please log in" }, { status: 401 });
