import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount, NETWORKS } from "@/lib/metrics";
import { verifyInstagram } from "@/lib/connectors/instagram";
import { brandFromRequest } from "@/lib/brand";
import { connectLive } from "@/lib/connect";

// Switch an account between demo data and a live connection (Instagram Graph API user id + token).
export async function POST(req: Request, ctx: { params: Promise<{ network: string }> }) {
  const { network } = await ctx.params;
  const brand = await brandFromRequest(req, "owner");
  if (brand instanceof NextResponse) return brand;
  const b = (await req.json()) as { mode: "live" | "remove"; external_id?: string; access_token?: string };
  if (!(NETWORKS as readonly string[]).includes(network)) return NextResponse.json({ error: "unknown network" }, { status: 404 });
  if (b.mode === "live") {
    if (network !== "instagram") return NextResponse.json({ error: "use Connect with Meta for Facebook; other networks aren't built yet" }, { status: 501 });
    if (!b.external_id?.trim() || !b.access_token?.trim()) return NextResponse.json({ error: "Instagram user id and access token are required" }, { status: 400 });
    let username: string;
    try {
      username = await verifyInstagram(b.external_id.trim(), b.access_token.trim());
    } catch (e) {
      return NextResponse.json({ error: `Meta rejected these details, nothing was changed: ${(e as Error).message}` }, { status: 400 });
    }
    const r = connectLive(brand.id, network, b.external_id.trim(), b.access_token.trim(), username);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 409 });
  } else {
    const acc = getAccount(brand.id, network);
    if (!acc) return NextResponse.json({ ok: true });
    // Disconnect: remove the account and everything synced for it (demo data can be added again from Brands).
    const d = db();
    d.exec("BEGIN");
    for (const t of ["metric_points", "content", "distributions", "best_times"]) d.prepare(`DELETE FROM ${t} WHERE account_id = ?`).run(acc.id);
    d.prepare("DELETE FROM accounts WHERE id = ?").run(acc.id);
    d.exec("COMMIT");
  }
  return NextResponse.json({ ok: true });
}
