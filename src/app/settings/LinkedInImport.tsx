"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Summary = { days: number; from: string | null; to: string | null; totalFollowers: number | null; posts: number; demographics: string[]; warnings: string[] };

export function LinkedInImport({ brandName }: { brandName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Summary | null>(null);
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-bg p-3">
      <div className="text-sm font-medium">Import profile analytics</div>
      <p className="text-xs text-muted-foreground">
        LinkedIn doesn&apos;t share personal-profile analytics with apps, so import your own export instead. On LinkedIn: your profile →
        <b> Analytics</b> → <b>Post impressions</b> → set the range (e.g. past 365 days) → <b>Export</b>. Then upload the .xlsx file here.
        Re-import every week or two; newer files update and extend {brandName}&apos;s history.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const input = (e.currentTarget.elements.namedItem("file") as HTMLInputElement);
          if (!input.files?.[0]) return setError("Choose the exported .xlsx file first");
          setBusy(true); setError(null); setDone(null);
          const fd = new FormData();
          fd.set("file", input.files[0]);
          const r = await fetch("/api/import/linkedin", { method: "POST", body: fd });
          const j = await r.json();
          setBusy(false);
          if (!r.ok) return setError(j.error);
          setDone(j.data);
          input.value = "";
          router.refresh();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="text-xs" aria-label="LinkedIn analytics export" />
        <button disabled={busy} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Importing…" : "Import"}</button>
      </form>
      {error && <p className="text-xs text-bad">{error}</p>}
      {done && (
        <p className="text-xs text-good">
          Imported {done.days} days ({done.from} → {done.to}){done.totalFollowers !== null ? `, ${done.totalFollowers.toLocaleString("en-IN")} followers` : ""}, {done.posts} top posts
          {done.demographics.length ? `, audience by ${done.demographics.join(", ").replace(/_/g, " ")}` : ""}.
          {done.warnings.length > 0 && <span className="block text-muted-foreground">Notes: {done.warnings.join("; ")}</span>}
        </p>
      )}
    </div>
  );
}
