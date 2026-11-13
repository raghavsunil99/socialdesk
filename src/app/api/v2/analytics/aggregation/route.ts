import { aggregation } from "@/lib/metrics";
import { account, handle, params } from "../_util";

export async function GET(req: Request) {
  return handle(async () => {
    const p = await params(req);
    const a = account(p.brandId, p.network);
    return { data: { metric: p.metric, subject: p.subject, value: aggregation(a.id, p.subject, p.metric, p.from, p.to) } };
  });
}
