import { timeline } from "@/lib/metrics";
import { account, handle, params } from "../_util";

// GET /api/v2/analytics/timelines?network=instagram&subject=account&metric=followers&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: Request) {
  return handle(async () => {
    const p = await params(req);
    const a = account(p.brandId, p.network);
    return { data: [{ metric: p.metric, values: timeline(a.id, p.subject, p.metric, p.from, p.to).map((v) => ({ dateTime: v.date, value: v.value })) }] };
  });
}
