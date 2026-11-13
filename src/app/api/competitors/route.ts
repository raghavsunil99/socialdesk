import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brandFromRequest } from "@/lib/brand";
import { refreshCompetitor } from "@/lib/competitors";

// POST { network: "youtube" | "instagram", handle } — add a competitor and fetch its content right away. Editors+.
export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "editor");
  if (brand instanceof NextResponse) return brand;
  const b = (await req.json()) as { network?: string; handle?: string };
  const network = b.network === "youtube" ? "youtube" : b.network === "instagram" ? "instagram" : null;
  const handle = b.handle?.trim();
  if (!network) return NextResponse.json({ error: "Pick YouTube or Instagram" }, { status: 400 });
  if (!handle || handle.length > 200) return NextResponse.json({ error: "Enter a handle or channel link" }, { status: 400 });
  const id = Number(db().prepare("INSERT INTO competitors (brand_id, network, handle) VALUES (?, ?, ?)").run(brand.id, network, handle).lastInsertRowid);
  try {
    await refreshCompetitor(id);
  } catch (e) {
    db().prepare("DELETE FROM competitors WHERE id = ?").run(id); // don't keep rows we couldn't resolve
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const dup = db().prepare("SELECT COUNT(*) AS n FROM competitors WHERE brand_id = ? AND network = ? AND external_id = (SELECT external_id FROM competitors WHERE id = ?)").get(brand.id, network, id) as { n: number };
  if (dup.n > 1) {
    db().prepare("DELETE FROM competitor_posts WHERE competitor_id = ?").run(id);
    db().prepare("DELETE FROM competitors WHERE id = ?").run(id);
    return NextResponse.json({ error: "You're already tracking that account" }, { status: 409 });
  }
  return NextResponse.json({ data: { id } }, { status: 201 });
}
