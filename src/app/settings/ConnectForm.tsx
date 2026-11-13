"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConnectForm({ network, state, externalId }: { network: string; state: string; externalId: string }) {
  const [id, setId] = useState(externalId);
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const post = async (body: object) => {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/accounts/${network}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { setBusy(false); setMsg({ ok: false, text: (await r.json()).error }); return; }
    if ((body as { mode: string }).mode === "live") {
      const s = await fetch(`/api/sync/${network}`, { method: "POST" });
      const j = await s.json();
      setMsg(s.ok
        ? { ok: true, text: j.warnings?.length ? `Connected and synced. ${j.warnings.length} metric(s) weren't available from Meta: ${j.warnings.join("; ")}` : "Connected and synced." }
        : { ok: false, text: `Connected, but the first sync failed: ${j.error}` });
    }
    setBusy(false);
    setToken("");
    router.refresh();
  };
  if (state === "live")
    return (
      <div className="mt-3 flex items-center gap-3">
        <button disabled={busy} onClick={() => confirm("Disconnect Instagram? Its synced history will be removed from Socialdesk.") && post({ mode: "remove" })} className="rounded-lg border border-line px-3 py-1.5 text-sm">Disconnect</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</span>}
      </div>
    );
  return (
    <div className="mt-3 space-y-2">
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">How to get these</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Create an app at developers.facebook.com (type: Business) and add “Instagram Graph API”.</li>
          <li>In Graph API Explorer, pick the app, grant <code>instagram_basic, instagram_manage_insights, instagram_content_publish, pages_show_list, pages_read_engagement, business_management</code>, and generate a user token.</li>
          <li>Run <code>me/accounts?fields=instagram_business_account</code> to find the Instagram user id.</li>
          <li>Exchange the token for a long-lived one (60 days) via <code>oauth/access_token?grant_type=fb_exchange_token</code>.</li>
        </ol>
      </details>
      <div className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Instagram user id" className="rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="Instagram user id" />
        <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder="Long-lived access token" className="rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="Access token" />
        <button disabled={busy} onClick={() => post({ mode: "live", external_id: id, access_token: token })} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Connecting…" : "Connect"}</button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}

export function DisconnectButton({ network, label }: { network: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        if (!confirm(`${label} for ${network}? Its history in Socialdesk will be removed.`)) return;
        setBusy(true);
        await fetch(`/api/accounts/${network}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "remove" }) });
        setBusy(false);
        router.refresh();
      }}
      className="rounded-lg border border-line px-3 py-1 text-xs text-ink hover:border-bad hover:text-bad"
    >
      {label}
    </button>
  );
}
