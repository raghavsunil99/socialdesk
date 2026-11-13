import { NextResponse } from "next/server";
import { getAccount, periodFromDays } from "@/lib/metrics";
import { brandFromRequest } from "@/lib/brand";

export async function params(req: Request) {
  const u = new URL(req.url).searchParams;
  const def = periodFromDays(30);
  return {
    network: u.get("network") ?? "instagram",
    subject: u.get("subject") ?? "account",
    metric: u.get("metric") ?? "followers",
    from: (u.get("from") ?? def.from).slice(0, 10),
    to: (u.get("to") ?? def.to).slice(0, 10),
    brandId: await brandId(req),
    format: u.get("format"),
  };
}
async function brandId(req: Request) {
  const b = await brandFromRequest(req, "viewer");
  if (b instanceof NextResponse) throw b;
  return b.id;
}
export function account(brandId: number, network: string) {
  const a = getAccount(brandId, network);
  if (!a) throw NextResponse.json({ error: `no ${network} account for brand ${brandId}` }, { status: 404 });
  return a;
}
export async function handle(fn: () => unknown) {
  try {
    return NextResponse.json(await fn());
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
