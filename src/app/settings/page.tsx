import Link from "next/link";
import { getAccount, NETWORKS, NETWORK_LABEL } from "@/lib/metrics";
import { currentBrand } from "@/lib/brand";
import { ConnectForm, DisconnectButton } from "./ConnectForm";
import { MetaConnect } from "./MetaConnect";
import { LinkedInImport } from "./LinkedInImport";
import { atLeast } from "@/lib/auth";
import { OAuthSetup } from "./OAuthSetup";
import { headers } from "next/headers";
import { isConfigured, PROVIDERS, providerForNetwork, redirectUri } from "@/lib/oauth";

export const dynamic = "force-dynamic";

const NEXT: Record<string, string> = {
  tiktok: "TikTok Content Posting + Display API",
};

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const brand = await currentBrand();
  const sp = await searchParams;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const isOwner = brand.role === "owner";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">{brand.name} · Connections</h1>
        <p className="text-sm text-muted-foreground">These connections belong to <b>{brand.name}</b> only. Switch brands in the sidebar or on the <Link href="/brands" className="text-brand underline">Brands</Link> page.</p>
      </div>
      {sp.connected && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Connected {sp.connected}{sp.handle ? ` (${sp.handle})` : ""} to {brand.name} and ran the first sync.
          {sp.warnings && <span className="mt-1 block text-xs">Notes: {sp.warnings}</span>}
        </div>
      )}
      {sp.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{sp.error}</div>}
      {isOwner && <MetaConnect key={brand.id} brandName={brand.name} configured={isConfigured("meta")} pending={sp.meta} redirectUri={redirectUri("meta", origin)} />}
      {NETWORKS.map((network) => {
        const a = getAccount(brand.id, network);
        const state = !a || a.connector === "none" ? "none" : a.connector;
        const meta = network === "instagram" || network === "facebook";
        return (
          <div key={network} className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <div><span className="font-semibold">{NETWORK_LABEL[network]}</span> {state !== "none" && <span className="text-sm text-muted-foreground">@{a!.handle}</span>}</div>
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${state === "live" ? "bg-emerald-100 text-emerald-800" : "bg-line text-muted-foreground"}`}>
                {state === "live" ? `live · last sync ${a!.last_sync ?? "never"}` : state === "import" ? `imported · last import ${a!.last_sync ?? "never"}` : state === "demo" ? "demo data" : "not connected"}
              </span>
            </div>
            {!isOwner ? (
              <p className="mt-2 text-xs text-muted-foreground">Only owners of {brand.name} can change connections.</p>
            ) : state === "import" ? (
              <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                <DisconnectButton network={network} label="Remove imported data" />
                <p>Imported analytics only. To also post to LinkedIn from Socialdesk, connect below; your imported history is kept.</p>
                {providerForNetwork(network) && (() => {
                  const p = providerForNetwork(network)!;
                  return <OAuthSetup provider={p} label={PROVIDERS[p].label} configured={isConfigured(p)} redirectUri={redirectUri(p, origin)} envNames={[PROVIDERS[p].idEnv, PROVIDERS[p].secretEnv]} />;
                })()}
              </div>
            ) : state === "live" || state === "demo" ? (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <DisconnectButton network={network} label={state === "demo" ? "Remove demo data" : "Disconnect"} />
                {state === "live" && providerForNetwork(network) && isConfigured(providerForNetwork(network)!) && (
                  <a href={`/api/oauth/${providerForNetwork(network)}/start`} className="rounded-lg border border-line px-3 py-1 text-xs text-ink hover:border-brand" title="Same account: keeps history. Different account: replaces it.">Reconnect / switch account</a>
                )}
                {state === "live" && meta && <span>To switch, use “Continue with Facebook” above and pick another Page.</span>}
                {state === "demo" && meta && <span>Remove the demo data, then use “Continue with Facebook” above.</span>}
                {state === "demo" && providerForNetwork(network) && <span>Remove the demo data first, then connect the real account here.</span>}
              </div>
            ) : meta ? (
              <>
                <p className="mt-2 text-xs text-muted-foreground">Use “Continue with Facebook” above.</p>
                {network === "instagram" && (
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Advanced: connect with an Instagram user id + token instead</summary>
                    <ConnectForm key={brand.id} network={network} state={state} externalId={a?.external_id ?? ""} />
                  </details>
                )}
              </>
            ) : providerForNetwork(network) ? (
              (() => {
                const p = providerForNetwork(network)!;
                return <OAuthSetup provider={p} label={PROVIDERS[p].label} configured={isConfigured(p)} redirectUri={redirectUri(p, origin)} envNames={[PROVIDERS[p].idEnv, PROVIDERS[p].secretEnv]} />;
              })()
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Live connector not built yet. Next in line: {NEXT[network]}.</p>
            )}
            {network === "linkedin" && atLeast(brand.role, "editor") && <LinkedInImport brandName={brand.name} />}
          </div>
        );
      })}
    </div>
  );
}
