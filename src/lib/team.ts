import "server-only";
import { db } from "./db";
import type { Role } from "./auth";

export function members(brandId: number) {
  return (db()
    .prepare("SELECT u.id, u.name, u.email, m.role FROM brand_members m JOIN users u ON u.id = m.user_id WHERE m.brand_id = ? ORDER BY u.name")
    .all(brandId) as { id: number; name: string; email: string; role: Role }[]).map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role }));
}
