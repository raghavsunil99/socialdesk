import { NextResponse } from "next/server";
import { brandFromRequest } from "@/lib/brand";
import { publishNow } from "@/lib/scheduler";

// POST /api/v2/scheduler/posts/:id/publish -> publish a scheduled post right now (editors and owners).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const brand = await brandFromRequest(req, "editor");
  if (brand instanceof NextResponse) return brand;
  const r = await publishNow(Number((await ctx.params).id), brand.id);
  if (!r) return NextResponse.json({ error: "Post isn't scheduled, or it's already publishing" }, { status: 409 });
  return NextResponse.json({ data: r });
}
