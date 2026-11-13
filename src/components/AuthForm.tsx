"use client";
import { useState } from "react";

export function AuthForm({ mode, next }: { mode: "login" | "setup"; next?: string }) {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    if (!r.ok) { setBusy(false); setError((await r.json()).error); return; }
    // only follow same-site relative paths
    window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/analytics";
  };
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="mb-6 flex items-center justify-center gap-2 text-lg font-bold">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">S</span> Socialdesk
      </div>
      <form onSubmit={submit} className="card space-y-3 p-6">
        <h1 className="text-lg font-bold">{mode === "login" ? "Log in" : "Create the owner account"}</h1>
        {mode === "setup" && <p className="text-sm text-muted-foreground">First run: this account becomes owner of every existing brand. Invite your team afterwards from the Team page.</p>}
        {mode === "setup" && (
          <label className="block text-sm">Your name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        )}
        <label className="block text-sm">Email<input required type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        <label className="block text-sm">Password<input required type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "setup" ? 10 : undefined} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "…" : mode === "login" ? "Log in" : "Create account"}</button>
        {mode === "login" && <p className="text-xs text-muted-foreground">No account? Ask a brand owner to add you on their Team page.</p>}
      </form>
      <p className="mt-6 text-center text-xs text-muted-foreground"><span className="font-semibold text-foreground">Socialdesk</span> · Built by Raghav</p>
    </div>
  );
}
