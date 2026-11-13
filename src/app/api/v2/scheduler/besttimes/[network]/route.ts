import { NextResponse } from "next/server";
import { bestTimes, getAccount } from "@/lib/metrics";
import { brandFromRequest } from "@/lib/brand";

export async function GET(req: Request, ctx: { params: Promise<{ network: string }> }) {
  const { network } = await ctx.params;
  const brand = await brandFromRequest(req, "viewer");
  if (brand instanceof NextResponse) return brand;
  const a = getAccount(brand.id, network);
  if (!a) return NextResponse.json({ error: "not connected" }, { status: 404 });
  const cells = bestTimes(a.id);
  const data = [1, 2, 3, 4, 5, 6, 7].map((dow) => ({
    dayOfWeek: dow,
    bestTimesByHour: cells.filter((c) => c.dow === dow).sort((x, y) => x.hour - y.hour).map((c) => ({ hourOfDay: c.hour, value: c.value })),
  }));
  return NextResponse.json({ data });
}
