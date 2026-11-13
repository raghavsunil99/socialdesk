import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brandFromRequest } from "@/lib/brand";

export async function PUT(req: Request) {
  const brand = await brandFromRequest(req, "editor");
  if (brand instanceof NextResponse) return brand;
  const b = (await req.json()) as { id: number; title: string; bio: string; theme: string; slug: string; buttons: { label: string; url: string; clicks?: number }[] };
  if (!/^[a-z0-9-]{2,40}$/.test(b.slug)) return NextResponse.json({ error: "slug: 2-40 lowercase letters, digits or dashes" }, { status: 400 });
  for (const btn of b.buttons) if (!/^https?:\/\//.test(btn.url)) return NextResponse.json({ error: `"${btn.label}" needs a full http(s) URL` }, { status: 400 });
  try {
    db().prepare("UPDATE smartlinks SET title = ?, bio = ?, theme = ?, slug = ?, buttons = ? WHERE id = ? AND brand_id = ?")
      .run(b.title, b.bio, b.theme, b.slug, JSON.stringify(b.buttons.map((x) => ({ label: x.label, url: x.url, clicks: x.clicks ?? 0 }))), b.id, brand.id);
  } catch {
    return NextResponse.json({ error: "that slug is taken" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
