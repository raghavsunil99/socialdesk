import { distribution } from "@/lib/metrics";
import { account, handle, params } from "../_util";

export async function GET(req: Request) {
  return handle(async () => {
    const p = await params(req);
    const a = account(p.brandId, p.network);
    return { data: distribution(a.id, p.metric).map((r) => ({ key: r.label, value: r.value })) };
  });
}
