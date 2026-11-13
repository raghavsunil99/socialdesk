import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { listBrands } from "@/lib/brand";
import { connectLive } from "@/lib/connect";
import { IDENTIFY, SYNC } from "@/lib/connectors";
import { getAccount } from "@/lib/metrics";
import { exchangeCode, expiresAt, PROVIDERS, takeState } from "@/lib/oauth";
import { longLivedUserToken } from "@/lib/connectors/meta";
import crypto from "node:crypto";

// GET /api/oauth/<provider>/callback?code=…&state=… — the provider sends the browser back here.
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const u = new URL(req.url).searchParams;
  const back = (q: string) => NextResponse.redirect(new URL(`/settings?${q}`, req.url));
  const fail = (msg: string) => back("error=" + encodeURIComponent(msg));

  const state = takeState(u.get("state") ?? "");
  if (!state || state.provider !== provider) return fail("This sign-in link expired or was already used. Try Connect again.");
  if (u.get("error")) return fail(`${PROVIDERS[state.provider].label}: ${u.get("error_description") ?? u.get("error")}`);
  const user = await getUser();
  if (!user || user.id !== state.user_id) return fail("Please finish the sign-in in the same browser you started it from.");
  const brand = listBrands(user.id).find((b) => b.id === state.brand_id);
  if (!brand || brand.role !== "owner") return fail("Only brand owners can connect accounts");

  try {
    const t = await exchangeCode(state.provider, u.get("code") ?? "", state.redirect_uri, state.verifier);
    if (state.provider === "meta") {
      // Keep the (long-lived) user token server-side for 15 minutes while the owner picks which Page to connect.
      const { token } = await longLivedUserToken(t.access_token);
      const id = crypto.randomBytes(18).toString("base64url");
      db().prepare("DELETE FROM meta_pending WHERE expires_at < datetime('now') OR user_id = ?").run(user.id);
      db().prepare("INSERT INTO meta_pending (id, brand_id, user_id, token, expires_at) VALUES (?, ?, ?, ?, datetime('now', '+15 minutes'))").run(id, brand.id, user.id, token);
      return back(`meta=${id}`);
    }
    const who = await IDENTIFY[state.network](t.access_token);
    const r = connectLive(brand.id, state.network, who.externalId, t.access_token, who.handle);
    if (r.error) return fail(r.error);
    db().prepare("UPDATE accounts SET refresh_token = ?, token_expires_at = ?, scopes = ? WHERE brand_id = ? AND network = ?")
      .run(t.refresh_token ?? null, expiresAt(t.expires_in), t.scope ?? PROVIDERS[state.provider].scopes.join(" "), brand.id, state.network);
    let note = "";
    try {
      const { warnings } = await SYNC[state.network](getAccount(brand.id, state.network)!);
      if (warnings.length) note = `&warnings=${encodeURIComponent(warnings.join(" • "))}`;
    } catch (e) {
      note = `&warnings=${encodeURIComponent(`First sync failed: ${(e as Error).message}`)}`;
    }
    return back(`connected=${state.network}&handle=${encodeURIComponent(who.handle)}${note}`);
  } catch (e) {
    return fail((e as Error).message);
  }
}
