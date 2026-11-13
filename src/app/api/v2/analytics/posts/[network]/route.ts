import { contentList } from "@/lib/metrics";
import { account, handle, params } from "../../_util";

const COLS = ["published_at", "kind", "format", "url", "caption", "reach", "views", "likes", "comments", "saved", "shares", "interactions", "engagement"] as const;

export async function GET(req: Request, ctx: { params: Promise<{ network: string }> }) {
  const { network } = await ctx.params;
  let p: Awaited<ReturnType<typeof params>>;
  try { p = await params(req); } catch (e) { if (e instanceof Response) return e; throw e; }
  if (p.format === "csv") {
    const a = account(p.brandId, network);
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = contentList(a.id, p.from, p.to).map((c) => COLS.map((k) => esc(k === "engagement" ? c.engagement.toFixed(2) : c[k])).join(","));
    return new Response([COLS.join(","), ...rows].join("\n"), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${network}-${p.from}-${p.to}.csv"` },
    });
  }
  return handle(() => ({ data: contentList(account(p.brandId, network).id, p.from, p.to) }));
}
