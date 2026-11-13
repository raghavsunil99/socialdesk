import { db } from "@/lib/db";
import { currentBrand, listBrands } from "@/lib/brand";
import { BrandsManager, type BrandRow } from "./BrandsManager";

export const dynamic = "force-dynamic";

export default async function Brands() {
  const current = await currentBrand();
  const rows: BrandRow[] = listBrands(current.user.id).map((b) => {
    const accs = db().prepare("SELECT network, connector, handle FROM accounts WHERE brand_id = ? AND connector != 'none' ORDER BY id").all(b.id) as { network: string; connector: string; handle: string }[];
    const scheduled = (db().prepare("SELECT COUNT(*) AS n FROM scheduled_posts WHERE brand_id = ? AND status IN ('scheduled','pending_approval')").get(b.id) as { n: number }).n;
    return { ...b, accounts: accs.map((a) => ({ network: a.network, connector: a.connector, handle: a.handle })), scheduled };
  });
  return <BrandsManager brands={rows} currentId={current.id} />;
}
