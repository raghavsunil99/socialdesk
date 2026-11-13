"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Page = { id: string; name: string; instagram: { id: string; username: string } | null };
type Result = Record<string, { ok: boolean; handle?: string; error?: string; warnings?: string[] }>;
type Props = { brandName: string; configured: boolean; pending?: string; redirectUri: string };

export function MetaConnect({ brandName, configured, pending, redirectUri }: Props) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [pages, setPages] = useState<Page[] | null>(null);
  const [pageId, setPageId] = useState("");
  const [nets, setNets] = useState({ facebook: true, instagram: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const call = useCallback(async (body: object) => {
    setBusy(true); setError(null);
    const r = await fetch("/api/meta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pending ? { pending, ...body } : { user_token: token, ...body }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setError(j.error); return null; }
    return j;
  }, [pending, token]);

  // Back from "Continue with Facebook": list the Pages right away.
  useEffect(() => {
    if (!pending) return;
    call({ action: "pages" }).then((j) => { if (j) { setPages(j.data); setPageId(j.data[0]?.id ?? ""); } });
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const page = pages?.find((p) => p.id === pageId);

  return (
    <div className="card space-y-3 border-brand p-4">
      <div>
        <div className="font-semibold">Facebook Page + Instagram</div>
        <p className="text-xs text-muted">One Facebook sign-in connects {brandName}&apos;s Facebook Page and the Instagram professional account linked to it.</p>
      </div>

      {!pages && !result && (configured ? (
        <a href="/api/oauth/meta/start" className="inline-block rounded-lg bg-[#1877f2] px-4 py-2 text-sm font-semibold text-white">Continue with Facebook</a>
      ) : (
        <details className="text-xs text-muted" open>
          <summary className="cursor-pointer font-medium text-ink">Set up Facebook sign-in (one time, ~10 minutes): needs META_APP_ID and META_APP_SECRET in web/.env.local</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Before you start: {brandName}&apos;s Instagram must be a <b>Professional</b> account (Creator or Business) <b>linked to its Facebook Page</b> (Instagram → Settings → Accounts Center, or the Page&apos;s settings → Linked accounts).</li>
            <li>In your normal browser, go to <b>developers.facebook.com</b> → My Apps → <b>Create app</b>. Pick the use case <b>“Manage everything on your Page”</b> (if offered, also add <b>“Manage messaging &amp; content on Instagram”</b>), or choose app type <b>Business</b>.</li>
            <li>In the app, open <b>Facebook Login for Business → Settings</b> (or <b>Facebook Login → Settings</b>) and add this <b>Valid OAuth Redirect URI</b>: <code className="select-all rounded bg-bg px-1 text-ink">{redirectUri}</code></li>
            <li>Open <b>App settings → Basic</b>, copy the <b>App ID</b> and <b>App secret</b> into web/.env.local as META_APP_ID and META_APP_SECRET, then ask Claude to restart the app.</li>
            <li>Keep the app in <b>Development</b> mode: that&apos;s enough for Pages and Instagram accounts you manage yourself (you&apos;re the app&apos;s admin).</li>
          </ol>
        </details>
      ))}

      {pages && !result && (
        <div className="space-y-2 rounded-lg bg-bg p-3">
          <label className="block text-sm">Which Page belongs to {brandName}?
            <select value={pageId} onChange={(e) => setPageId(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5">
              {pages.map((p) => <option key={p.id} value={p.id}>{p.name}{p.instagram ? ` (Instagram @${p.instagram.username})` : " (no Instagram linked)"}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={nets.facebook} onChange={(e) => setNets({ ...nets, facebook: e.target.checked })} /> Facebook Page</label>
            <label className={`flex items-center gap-1.5 ${page?.instagram ? "" : "opacity-50"}`}><input type="checkbox" disabled={!page?.instagram} checked={nets.instagram && !!page?.instagram} onChange={(e) => setNets({ ...nets, instagram: e.target.checked })} /> Instagram {page?.instagram ? `@${page.instagram.username}` : "(link it to this Page first)"}</label>
          </div>
          <button
            disabled={busy || (!nets.facebook && !(nets.instagram && page?.instagram))}
            onClick={async () => {
              const networks = [nets.facebook && "facebook", nets.instagram && page?.instagram && "instagram"].filter(Boolean);
              const j = await call({ action: "connect", page_id: pageId, networks });
              if (j) { setResult(j.data); setToken(""); router.replace("/settings"); router.refresh(); }
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Connecting and syncing… (up to a minute)" : `Connect to ${brandName}`}
          </button>
        </div>
      )}
      {busy && !pages && <p className="text-sm text-muted">Loading your Pages…</p>}
      {error && <p className="text-sm text-bad">{error}</p>}

      {result && (
        <ul className="space-y-1 text-sm">
          {Object.entries(result).map(([n, r]) => (
            <li key={n} className={r.ok && !r.error ? "text-good" : "text-bad"}>
              <b className="capitalize">{n}</b>: {r.error ?? `connected${r.handle ? ` (${r.handle})` : ""} and synced`}
              {r.warnings && r.warnings.length > 0 && <span className="block text-xs text-muted">{r.warnings.length} metric(s) weren&apos;t available from Meta: {r.warnings.join("; ")}</span>}
            </li>
          ))}
        </ul>
      )}

      {!pending && !pages && !result && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Advanced: paste a token from Graph API Explorer instead</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Meta user access token" autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="Meta user access token" />
            <button disabled={busy || !token} onClick={async () => { const j = await call({ action: "pages" }); if (j) { setPages(j.data); setPageId(j.data[0]?.id ?? ""); } }} className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-50">Find my Pages</button>
          </div>
        </details>
      )}
    </div>
  );
}
