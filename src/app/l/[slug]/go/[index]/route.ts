import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Click-tracking redirect for link-in-bio buttons.
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; index: string }> }) {
  const { slug, index } = await ctx.params;
  const d = db();
  const link = d.prepare("SELECT id, buttons FROM smartlinks WHERE slug = ?").get(slug) as { id: number; buttons: string } | undefined;
  const i = Number(index);
  const buttons = link ? (JSON.parse(link.buttons) as { url: string; clicks: number }[]) : [];
  if (!link || !buttons[i]) return NextResponse.json({ error: "not found" }, { status: 404 });
  buttons[i].clicks = (buttons[i].clicks ?? 0) + 1;
  d.prepare("UPDATE smartlinks SET buttons = ? WHERE id = ?").run(JSON.stringify(buttons), link.id);
  d.prepare("INSERT INTO smartlink_clicks (smartlink_id, button_index) VALUES (?, ?)").run(link.id, i);
  return NextResponse.redirect(buttons[i].url, 302);
}
