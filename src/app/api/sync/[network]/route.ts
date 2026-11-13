import { NextResponse } from "next/server";
import { getAccount } from "@/lib/metrics";
import { SYNC } from "@/lib/connectors";
import { brandFromRequest } from "@/lib/brand";

export async function POST(req: Request, ctx: { params: Promise<{ network: string }> }) {
  const { network } = await ctx.params;
  const brand = await brandFromRequest(req, "editor");
  if (brand instanceof NextResponse) return brand;
  const acc = getAccount(brand.id, network);
  if (!acc || acc.connector !== "live") return NextResponse.json({ error: "account is not live-connected" }, { status: 400 });
  try {
    const run = SYNC[network];
    if (!run) return NextResponse.json({ error: `${network} sync is not implemented yet` }, { status: 501 });
    const { warnings } = await run(acc);
    return NextResponse.json({ ok: true, warnings });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
