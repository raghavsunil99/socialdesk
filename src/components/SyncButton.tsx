"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton({ network }: { network: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | string>("idle");
  return (
    <button
      className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:border-brand disabled:opacity-50"
      disabled={state === "busy"}
      title={state !== "idle" && state !== "busy" ? state : undefined}
      onClick={async () => {
        setState("busy");
        const r = await fetch(`/api/sync/${network}`, { method: "POST" });
        const j = await r.json();
        setState(r.ok ? "idle" : j.error);
        router.refresh();
      }}
    >
      {state === "busy" ? "Syncing…" : state === "idle" ? "Sync now" : "Sync failed – retry"}
    </button>
  );
}
