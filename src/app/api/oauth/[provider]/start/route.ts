import { NextResponse } from "next/server";
import { brandFromRequest } from "@/lib/brand";
import { isConfigured, PROVIDERS, startAuth, type Provider } from "@/lib/oauth";

// GET /api/oauth/<google|linkedin|x>/start — owners only; sends the browser to the provider's consent screen.
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const back = (q: string) => NextResponse.redirect(new URL(`/settings?${q}`, req.url));
  if (!(provider in PROVIDERS)) return back("error=" + encodeURIComponent("Unknown provider"));
  const p = provider as Provider;
  if (!isConfigured(p)) return back("error=" + encodeURIComponent(`${PROVIDERS[p].label} isn't set up yet: add ${PROVIDERS[p].idEnv} and ${PROVIDERS[p].secretEnv} to web/.env.local and restart.`));
  const brand = await brandFromRequest(req, "owner");
  if (brand instanceof NextResponse) return back("error=" + encodeURIComponent("Only brand owners can connect accounts"));
  return NextResponse.redirect(startAuth(p, brand.id, brand.user.id, new URL(req.url).origin));
}
