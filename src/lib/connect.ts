import "server-only";
import { db } from "./db";
import { getAccount } from "./metrics";

/**
 * Switch a brand's network to a live connection. Refuses if the same external account is already
 * live on another brand. Reconnecting the SAME account keeps its history (e.g. after a token expired);
 * connecting a different account, or replacing demo data, starts that network's history fresh.
 */
export function connectLive(brandId: number, network: string, externalId: string, token: string, handle: string): { error?: string; switched?: boolean } {
  const d = db();
  const taken = d
    .prepare("SELECT b.name FROM accounts a JOIN brands b ON b.id = a.brand_id WHERE a.network = ? AND a.external_id = ? AND a.brand_id != ? AND a.connector = 'live'")
    .get(network, externalId, brandId) as { name: string } | undefined;
  if (taken) return { error: `That ${network} account is already connected to the brand "${taken.name}"` };
  d.exec("BEGIN");
  try {
    d.prepare("INSERT OR IGNORE INTO accounts (brand_id, network, handle, connector) VALUES (?, ?, ?, 'none')").run(brandId, network, handle);
    const acc = getAccount(brandId, network)!;
    // Imported history (LinkedIn export) belongs to the same profile, so connecting for posting keeps it.
    const sameAccount = (acc.connector === "live" && acc.external_id === externalId) || acc.connector === "import";
    if (sameAccount) {
      d.prepare("UPDATE accounts SET connector = 'live', handle = ?, external_id = ?, access_token = ? WHERE id = ?").run(handle, externalId, token, acc.id);
    } else {
      for (const t of ["metric_points", "content", "distributions", "best_times"]) d.prepare(`DELETE FROM ${t} WHERE account_id = ?`).run(acc.id);
      d.prepare("UPDATE accounts SET connector = 'live', handle = ?, external_id = ?, access_token = ?, refresh_token = NULL, token_expires_at = NULL, last_sync = NULL WHERE id = ?").run(handle, externalId, token, acc.id);
    }
    d.exec("COMMIT");
    return { switched: !sameAccount && acc.connector === "live" };
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
