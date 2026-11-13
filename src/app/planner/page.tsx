import { bestTimes, listAccounts } from "@/lib/metrics";
import { Planner } from "./Planner";
import { currentBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const brand = await currentBrand();
  const accounts = listAccounts(brand.id);
  // only plain fields cross to the client (never tokens)
  const best = Object.fromEntries(accounts.map((a) => [a.network, bestTimes(a.id)]));
  return <Planner key={brand.id} role={brand.role} accounts={accounts.map((a) => ({ network: a.network, handle: a.handle, connector: a.connector }))} best={best} />;
}
