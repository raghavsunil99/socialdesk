"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = { id: number; name: string; email: string; role: string };
type Props = { brandName: string; me: { id: number; name: string; email: string }; isOwner: boolean; members: Member[]; roles: { role: string; info: string }[] };

export function TeamManager({ brandName, me, isOwner, members, roles }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [invite, setInvite] = useState({ email: "", role: "creator", name: "", password: "" });
  const [needsAccount, setNeedsAccount] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (url: string, method: string, body?: object) => {
    setMsg(null);
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json();
    if (!r.ok) { setMsg({ ok: false, text: j.error }); if (j.needsAccount) setNeedsAccount(true); return null; }
    router.refresh();
    return j;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">{brandName} · Team</h1>
        <p className="text-sm text-muted">People who can work on {brandName}. Roles are per brand: someone can own one brand and only view another.</p>
      </div>

      <div className="card divide-y divide-line">
        {members.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{m.name}{m.id === me.id && <span className="text-muted"> (you)</span>}</div>
              <div className="truncate text-xs text-muted">{m.email}</div>
            </div>
            {isOwner ? (
              <select value={m.role} onChange={(e) => send(`/api/team/${m.id}`, "PATCH", { role: e.target.value })} className="rounded-lg border border-line px-2 py-1 text-sm" aria-label={`Role for ${m.name}`}>
                {roles.map((r) => <option key={r.role} value={r.role}>{r.role}</option>)}
              </select>
            ) : (
              <span className="rounded bg-line px-2 py-0.5 text-xs font-semibold text-muted">{m.role}</span>
            )}
            {(isOwner || m.id === me.id) && (
              <button
                onClick={() => confirm(m.id === me.id ? `Leave ${brandName}?` : `Remove ${m.name} from ${brandName}?`) && send(`/api/team/${m.id}`, "DELETE").then((ok) => { if (ok && m.id === me.id) window.location.href = "/"; })}
                className="text-xs text-muted hover:text-bad"
              >
                {m.id === me.id ? "Leave" : "Remove"}
              </button>
            )}
          </div>
        ))}
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}

      {isOwner && (
        <form
          className="card space-y-3 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const j = await send("/api/team", "POST", needsAccount ? invite : { email: invite.email, role: invite.role });
            if (j) {
              setMsg({ ok: true, text: j.created ? `Account created. Share the email and temporary password with ${invite.name} privately; they can change it on this page.` : "Added to the brand." });
              setInvite({ email: "", role: "creator", name: "", password: "" });
              setNeedsAccount(false);
            }
          }}
        >
          <div className="font-semibold">Add someone to {brandName}</div>
          <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
            <input required type="email" value={invite.email} onChange={(e) => { setInvite({ ...invite, email: e.target.value }); setNeedsAccount(false); }} placeholder="their@email.com" className="rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="Email" />
            <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} className="rounded-lg border border-line px-2 py-1.5 text-sm" aria-label="Role">
              {roles.map((r) => <option key={r.role} value={r.role}>{r.role}</option>)}
            </select>
          </div>
          {needsAccount && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input required value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} placeholder="Their name" className="rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="Name" />
              <input required type="text" minLength={10} value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} placeholder="Temporary password (10+ chars)" className="rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="Temporary password" autoComplete="off" />
            </div>
          )}
          <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">{needsAccount ? "Create account & add" : "Add"}</button>
          <ul className="space-y-1 text-xs text-muted">
            {roles.map((r) => <li key={r.role}><b className="text-ink">{r.role}</b>: {r.info}</li>)}
          </ul>
        </form>
      )}

      <form
        className="card space-y-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await fetch("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pw) });
          setPwMsg(r.ok ? { ok: true, text: "Password changed. Other devices were signed out." } : { ok: false, text: (await r.json()).error });
          if (r.ok) setPw({ current: "", next: "" });
        }}
      >
        <div className="font-semibold">Your account <span className="font-normal text-muted">· {me.email}</span></div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input required type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} placeholder="Current password" className="rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="Current password" />
          <input required type="password" autoComplete="new-password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="New password (10+ chars)" className="rounded-lg border border-line px-3 py-1.5 text-sm" aria-label="New password" />
          <button className="rounded-lg border border-line px-3 py-1.5 text-sm">Change password</button>
        </div>
        {pwMsg && <p className={`text-sm ${pwMsg.ok ? "text-good" : "text-bad"}`}>{pwMsg.text}</p>}
      </form>
    </div>
  );
}
