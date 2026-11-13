import "server-only";
import { graph } from "./instagram";

// One Meta login connects both a Facebook Page and the Instagram professional account linked to it.
// The user pastes a user access token (Graph API Explorer); we list their Pages, and each Page comes with
// its own Page token, which is what both the Pages API and the Instagram Graph API calls use.

export type MetaPage = { id: string; name: string; access_token: string; instagram?: { id: string; username: string } };

/** If META_APP_ID/META_APP_SECRET are set, swap a short-lived user token (~1-2 h) for a 60-day one.
 *  Page tokens fetched with a long-lived user token don't expire, so this makes the connection last. */
export async function longLivedUserToken(token: string): Promise<{ token: string; longLived: boolean }> {
  const id = process.env.META_APP_ID, secret = process.env.META_APP_SECRET;
  if (!id || !secret) return { token, longLived: false };
  const url = new URL("https://graph.facebook.com/v27.0/oauth/access_token");
  url.search = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: token }).toString();
  const res = await fetch(url);
  const j = (await res.json()) as { access_token?: string; error?: { message: string } };
  if (!j.access_token) throw new Error(`Token exchange failed: ${j.error?.message ?? res.statusText}`);
  return { token: j.access_token, longLived: true };
}

export async function listMetaPages(userToken: string): Promise<MetaPage[]> {
  const r = await graph<{ data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[] }>(
    "/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100",
    userToken
  );
  return r.data.map((p) => ({
    id: p.id,
    name: p.name,
    access_token: p.access_token,
    instagram: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? "" } : undefined,
  }));
}
