import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brandFromRequest } from "@/lib/brand";
import { listMetaPages, longLivedUserToken } from "@/lib/connectors/meta";
import { connectLive } from "@/lib/connect";
import { syncFacebook } from "@/lib/connectors/facebook";
import { syncInstagram } from "@/lib/connectors/instagram";
import { getAccount } from "@/lib/metrics";

// POST { action: "pages", user_token }                       -> the user's Pages and linked Instagram accounts (no tokens returned)
// POST { action: "connect", user_token, page_id, networks }  -> connect the Page and/or its Instagram to the current brand, then sync
export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "owner");
  if (brand instanceof NextResponse) return brand;
  const b = (await req.json()) as { action?: string; user_token?: string; pending?: string; page_id?: string; networks?: string[] };
  // Either the token saved by "Continue with Facebook" (pending) or one pasted from Graph API Explorer.
  let userToken = b.user_token?.trim();
  let longLived = false;
  if (b.pending) {
    const row = db().prepare("SELECT token FROM meta_pending WHERE id = ? AND user_id = ? AND brand_id = ? AND expires_at > datetime('now')").get(b.pending, brand.user.id, brand.id) as { token: string } | undefined;
    if (!row) return NextResponse.json({ error: "That Facebook sign-in expired. Click Continue with Facebook again." }, { status: 400 });
    userToken = row.token;
    longLived = true;
  }
  if (!userToken) return NextResponse.json({ error: "Paste a Meta user access token first" }, { status: 400 });

  let pages;
  try {
    if (!b.pending) {
      const t = await longLivedUserToken(userToken);
      longLived = t.longLived;
      userToken = t.token;
    }
    pages = await listMetaPages(userToken);
  } catch (e) {
    return NextResponse.json({ error: `Meta rejected the token, nothing was changed: ${(e as Error).message}` }, { status: 400 });
  }

  if (b.action === "pages") {
    if (pages.length === 0) return NextResponse.json({ error: "This token can't see any Facebook Pages. Grant pages_show_list and select the Page when generating the token." }, { status: 400 });
    return NextResponse.json({ data: pages.map((p) => ({ id: p.id, name: p.name, instagram: p.instagram ?? null })), longLived });
  }

  if (b.action !== "connect") return NextResponse.json({ error: "unknown action" }, { status: 400 });
  if (b.pending) db().prepare("DELETE FROM meta_pending WHERE id = ?").run(b.pending);
  const page = pages.find((p) => p.id === b.page_id);
  if (!page) return NextResponse.json({ error: "That Page isn't available to this token" }, { status: 400 });
  const want = new Set(b.networks ?? ["facebook", "instagram"]);
  const results: Record<string, { ok: boolean; handle?: string; error?: string; warnings?: string[] }> = {};

  if (want.has("facebook")) {
    const r = connectLive(brand.id, "facebook", page.id, page.access_token, page.name);
    results.facebook = r.error ? { ok: false, error: r.error } : { ok: true, handle: page.name };
  }
  if (want.has("instagram")) {
    if (!page.instagram) results.instagram = { ok: false, error: `No Instagram professional account is linked to the Page "${page.name}"` };
    else {
      // Instagram Graph API calls are made with the Page token of the Page it's linked to.
      const r = connectLive(brand.id, "instagram", page.instagram.id, page.access_token, page.instagram.username || page.name);
      results.instagram = r.error ? { ok: false, error: r.error } : { ok: true, handle: page.instagram.username };
    }
  }

  // First sync right away so the dashboards fill in.
  for (const [network, run] of [["facebook", syncFacebook], ["instagram", syncInstagram]] as const) {
    if (!results[network]?.ok) continue;
    try {
      const { warnings } = await run(getAccount(brand.id, network)!);
      results[network].warnings = warnings;
    } catch (e) {
      results[network] = { ...results[network], error: `connected, but the first sync failed: ${(e as Error).message}` };
    }
  }
  return NextResponse.json({ data: results, longLived });
}
