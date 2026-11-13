"use client";
import { useMemo, useRef, useState } from "react";
import { FORMAT_NETWORKS, socialCaption, type Format, type PostMeta } from "@/lib/posts";
import { seoScore } from "@/lib/seo";
import type { Acc, Draft } from "./Planner";

const LIMIT: Record<string, number> = { instagram: 2200, facebook: 63206, youtube: 5000, tiktok: 2200, linkedin: 3000, x: 280 };
const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: "short", label: "Short / Reel", hint: "Vertical video up to 3 min → YouTube Shorts, Instagram Reels, Facebook Reels at the same time" },
  { id: "long", label: "Long video", hint: "Horizontal or longer video → YouTube only" },
  { id: "post", label: "Post", hint: "Image or text post → Instagram, Facebook, LinkedIn, X" },
];
const split = (s: string, sep: RegExp) => s.split(sep).map((x) => x.trim()).filter(Boolean);

export function Composer({ accounts, draft: initial, onClose, onSaved, canSchedule, canWrite }: { accounts: Acc[]; draft: Draft; onClose: () => void; onSaved: () => void; canSchedule: boolean; canWrite: boolean }) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<{ pct: number; name?: string; info?: string; warn?: string } | null>(initial.media_url ? { pct: 100, name: "Current media" } : null);
  const [topic, setTopic] = useState("");
  const [ai, setAi] = useState<{ busy: boolean; titles: string[]; captions: string[]; error?: string }>({ busy: false, titles: [], captions: [] });
  const [tagsText, setTagsText] = useState((initial.meta.tags ?? []).join(", "));
  const [hashText, setHashText] = useState((initial.meta.hashtags ?? []).join(" "));
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const locked = !canWrite || d.status === "published" || d.status === "publishing" || (!canSchedule && d.status === "scheduled");
  const video = d.format !== "post";
  const allowed = accounts.filter((a) => FORMAT_NETWORKS[d.format].includes(a.network));
  const meta: PostMeta = { ...d.meta, tags: split(tagsText, /,/), hashtags: split(hashText, /[\s,]+/) };
  const seo = useMemo(() => seoScore(meta, d.format), [JSON.stringify(meta), d.format]); // eslint-disable-line react-hooks/exhaustive-deps
  const caption = video ? socialCaption(meta) : d.text;
  const setMeta = (m: Partial<PostMeta>) => setD({ ...d, meta: { ...d.meta, ...m } });

  const pickFormat = (f: Format) => {
    const nets = accounts.map((a) => a.network).filter((n) => FORMAT_NETWORKS[f].includes(n));
    setD({ ...d, format: f, networks: nets, media_type: f === "post" ? "IMAGE" : "REELS" });
  };

  const onFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isVideo = file.type.startsWith("video/");
    // Read duration and orientation to pick Short vs Long automatically.
    if (isVideo) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        const secs = Math.round(v.duration), vertical = v.videoHeight > v.videoWidth;
        const f: Format = vertical && secs <= 180 ? "short" : "long";
        const info = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")} · ${vertical ? "vertical" : "horizontal"} ${v.videoWidth}×${v.videoHeight}`;
        setUpload((u) => ({ ...(u ?? { pct: 0 }), info, warn: f === "long" && secs <= 180 ? "Horizontal video: posting as a long YouTube video only. Export it vertical (9:16) to post it as a Short and Reel." : f === "long" ? "Over 3 minutes: YouTube only." : undefined }));
        if (f !== d.format) pickFormat(f);
        URL.revokeObjectURL(v.src);
      };
      v.src = URL.createObjectURL(file);
    }
    setUpload({ pct: 0, name: file.name });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/uploads?ext=${encodeURIComponent(ext)}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && setUpload((u) => ({ ...(u ?? {}), pct: Math.round((e.loaded / e.total) * 100) }));
    xhr.onload = () => {
      const j = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 300) { setError(j.error ?? "Upload failed"); setUpload(null); return; }
      setD((cur) => ({ ...cur, media_url: j.data.url, media_type: isVideo ? "REELS" : "IMAGE" }));
      setUpload((u) => ({ ...(u ?? {}), pct: 100 }));
    };
    xhr.onerror = () => { setError("Upload failed"); setUpload(null); };
    xhr.send(file);
  };

  const suggest = async () => {
    setAi({ busy: true, titles: [], captions: [] });
    if (!video) {
      const r = await fetch("/api/ai/caption", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idea: topic, networks: d.networks, draft: d.text }) });
      const j = await r.json();
      return setAi(r.ok ? { busy: false, titles: [], captions: j.data } : { busy: false, titles: [], captions: [], error: j.error });
    }
    const r = await fetch("/api/ai/seo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic, format: d.format, keyword: d.meta.keyword, draft: { title: d.meta.title, description: d.meta.description } }) });
    const j = await r.json();
    if (!r.ok) return setAi({ busy: false, titles: [], captions: [], error: j.error });
    const s = j.data as { keyword: string; titles: string[]; description: string; tags: string[]; hashtags: string[] };
    setD((cur) => ({ ...cur, meta: { ...cur.meta, keyword: cur.meta.keyword || s.keyword, title: s.titles?.[0] ?? cur.meta.title, description: s.description } }));
    setTagsText((s.tags ?? []).join(", "));
    setHashText((s.hashtags ?? []).join(" "));
    setAi({ busy: false, titles: s.titles ?? [], captions: [] });
  };

  const save = async (status: string) => {
    setBusy(true); setError(null);
    const body = { networks: d.networks, text: caption, media_url: d.media_url, media_type: d.media_type, scheduled_at: new Date(d.when).toISOString(), status, format: d.format, meta: video ? meta : null };
    const r = await fetch(d.id ? `/api/v2/scheduler/posts/${d.id}` : "/api/v2/scheduler/posts", { method: d.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) onSaved(); else setError((await r.json()).error);
  };
  const remove = async () => {
    if (!d.id || !confirm("Delete this post?")) return;
    await fetch(`/api/v2/scheduler/posts/${d.id}`, { method: "DELETE" });
    onSaved();
  };

  const scoreColor = seo.score >= 80 ? "text-good" : seo.score >= 50 ? "text-amber-500" : "text-bad";
  const input = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-5xl p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Post editor">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{d.id ? "Edit post" : "New post"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-ink" aria-label="Close">✕</button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {FORMATS.map((f) => (
            <button key={f.id} disabled={locked} onClick={() => pickFormat(f.id)} title={f.hint}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${d.format === f.id ? "border-primary bg-primary text-primary-foreground" : "border-line text-muted-foreground hover:text-foreground"}`}>{f.label}</button>
          ))}
          <span className="self-center text-xs text-muted-foreground">{FORMATS.find((f) => f.id === d.format)?.hint}</span>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Post to</span>
              {allowed.length === 0 && <span className="text-xs text-bad">No connected account takes this format.</span>}
              {allowed.map((a) => {
                const on = d.networks.includes(a.network);
                return (
                  <button key={a.network} disabled={locked} onClick={() => setD({ ...d, networks: on ? d.networks.filter((n) => n !== a.network) : [...d.networks, a.network] })}
                    className={`rounded-full border px-3 py-1 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "border-line text-muted-foreground"}`}>
                    {a.network}{a.connector === "demo" ? " (demo)" : ""}
                  </button>
                );
              })}
            </div>

            <div
              onDragOver={(e) => { if (locked) return; e.preventDefault(); setDragging(true); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
              onDrop={(e) => {
                e.preventDefault(); setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (!f || locked) return;
                if (!/^(video|image)\//.test(f.type)) { setError("Drop a video (mp4, mov, webm) or an image (jpg, png)."); return; }
                setError(null); onFile(f);
              }}
              className={`rounded-lg border-2 border-dashed p-3 transition-colors ${dragging ? "border-primary bg-primary/10" : "border-line"}`}>
              <input ref={fileRef} type="file" hidden accept={video ? "video/mp4,video/quicktime,video/webm" : "image/jpeg,image/png,video/mp4"} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              <div className="flex flex-wrap items-center gap-3">
                <button disabled={locked} onClick={() => fileRef.current?.click()} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-primary">{upload ? "Replace file" : video ? "Upload video" : "Upload image"}</button>
                {upload && <span className="text-xs text-muted-foreground">{upload.name} {upload.info && `· ${upload.info}`} · {upload.pct < 100 ? `${upload.pct}%` : "uploaded ✓"}</span>}
                {!upload && <span className="text-xs text-muted-foreground">{dragging ? "Drop it here" : `or drag & drop a ${video ? "video" : "file"} here, or paste a public URL:`}</span>}
              </div>
              {upload && upload.pct < 100 && <div className="mt-2 h-1.5 rounded bg-line"><div className="h-1.5 rounded bg-primary" style={{ width: `${upload.pct}%` }} /></div>}
              {upload?.warn && <p className="mt-2 text-xs text-amber-600">{upload.warn}</p>}
              {!upload && <input value={d.media_url} disabled={locked} onChange={(e) => setD({ ...d, media_url: e.target.value })} placeholder="https://…" className={`${input} mt-2`} />}
            </div>

            {video ? (
              <>
                <label className="block text-xs font-medium">Focus keyword
                  <input value={d.meta.keyword ?? ""} disabled={locked} onChange={(e) => setMeta({ keyword: e.target.value })} placeholder="what people search, e.g. sql interview questions telugu" className={`${input} mt-1 font-normal`} />
                </label>
                <label className="block text-xs font-medium">Title <span className="font-normal text-muted-foreground">{(d.meta.title ?? "").length}/100</span>
                  <input value={d.meta.title ?? ""} maxLength={100} disabled={locked} onChange={(e) => setMeta({ title: e.target.value })} className={`${input} mt-1 font-normal`} />
                </label>
                {ai.titles.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ai.titles.map((t) => <button key={t} onClick={() => setMeta({ title: t })} className={`rounded-full border px-2.5 py-1 text-xs ${t === d.meta.title ? "border-primary text-primary" : "border-line text-muted-foreground hover:text-foreground"}`}>{t}</button>)}
                  </div>
                )}
                <label className="block text-xs font-medium">Description <span className="font-normal text-muted-foreground">{(d.meta.description ?? "").length}/5000</span>
                  <textarea value={d.meta.description ?? ""} rows={d.format === "long" ? 8 : 4} disabled={locked} onChange={(e) => setMeta({ description: e.target.value })} className={`${input} mt-1 font-normal`} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-medium">YouTube tags <span className="font-normal text-muted-foreground">(comma separated)</span>
                    <textarea value={tagsText} rows={2} disabled={locked} onChange={(e) => setTagsText(e.target.value)} className={`${input} mt-1 font-normal`} />
                  </label>
                  <label className="block text-xs font-medium">Hashtags
                    <textarea value={hashText} rows={2} disabled={locked} onChange={(e) => setHashText(e.target.value)} placeholder="#shorts #telugu #coding" className={`${input} mt-1 font-normal`} />
                  </label>
                </div>
                {d.networks.some((n) => n !== "youtube") && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Instagram / Facebook caption preview ({caption.length}/2200)</summary>
                    <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-bg p-2 font-sans">{caption || "Fill in the title and description."}</pre>
                  </details>
                )}
              </>
            ) : (
              <>
                <textarea value={d.text} disabled={locked} onChange={(e) => setD({ ...d, text: e.target.value })} rows={9} placeholder="Write your caption…" className={input} />
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {d.networks.map((n) => <span key={n} className={d.text.length > LIMIT[n] ? "font-semibold text-bad" : ""}>{n}: {d.text.length}/{LIMIT[n]}</span>)}
                </div>
              </>
            )}

            <label className="flex items-center gap-2 text-sm">When
              <input type="datetime-local" value={d.when} disabled={locked} onChange={(e) => setD({ ...d, when: e.target.value })} className="rounded-lg border border-line bg-surface px-2 py-1.5" />
              <span className="text-xs text-muted-foreground">all selected networks publish at this time</span>
            </label>
            {d.result && <pre className="overflow-x-auto rounded-lg bg-bg p-2 text-xs">{JSON.stringify(d.result, null, 1)}</pre>}
            {error && <p className="text-sm text-bad">{error}</p>}
            {!locked && (
              <div className="flex flex-wrap gap-2 pt-1">
                {canSchedule && <button disabled={busy || (upload !== null && upload.pct < 100)} onClick={() => save("scheduled")} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{d.status === "pending_approval" ? "Approve & schedule" : "Schedule"}</button>}
                <button disabled={busy} onClick={() => save("pending_approval")} className="rounded-lg border border-line px-4 py-2 text-sm">Send for approval</button>
                <button disabled={busy} onClick={() => save("draft")} className="rounded-lg border border-line px-4 py-2 text-sm">Save draft</button>
                {d.id && <button onClick={remove} className="ml-auto rounded-lg px-3 py-2 text-sm text-bad hover:bg-red-50">Delete</button>}
              </div>
            )}
          </div>

          <aside className="space-y-3">
            <div className="space-y-2 rounded-lg bg-bg p-3">
              <div className="text-sm font-semibold">✨ AI assistant <span className="font-normal text-muted-foreground">· 1 credit</span></div>
              <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} placeholder={video ? "What is the video about? e.g. 5 SQL questions asked in every fresher interview, Telugu" : "e.g. Carousel: 5 SQL interview questions, CTA comment LINK"} className="w-full rounded-lg border border-line bg-surface p-2 text-xs" />
              <button onClick={suggest} disabled={ai.busy || locked} className="w-full rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-surface disabled:opacity-50">
                {ai.busy ? "Writing…" : video ? "Suggest title, description, tags" : d.text ? "Improve my draft" : "Suggest captions"}
              </button>
              {ai.error && <p className="text-xs text-bad">{ai.error}</p>}
              {ai.captions.map((o, i) => (
                <button key={i} onClick={() => setD({ ...d, text: o })} className="block w-full whitespace-pre-wrap rounded-lg border border-line bg-surface p-2 text-left text-xs hover:border-primary">{o}</button>
              ))}
            </div>
            {video && (
              <div className="rounded-lg border border-line p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">SEO score</span>
                  <span className={`text-3xl font-bold tabular-nums ${scoreColor}`}>{seo.score}<span className="text-sm text-muted-foreground">/100</span></span>
                </div>
                <div className="mt-2 h-1.5 rounded bg-line"><div className={`h-1.5 rounded ${seo.score >= 80 ? "bg-good" : seo.score >= 50 ? "bg-amber-500" : "bg-bad"}`} style={{ width: `${seo.score}%` }} /></div>
                <ul className="mt-3 space-y-1.5">
                  {seo.checks.map((c) => (
                    <li key={c.label} className="flex gap-2 text-xs" title={c.tip}>
                      <span className={c.ok ? "text-good" : "text-muted-foreground"}>{c.ok ? "✓" : "○"}</span>
                      <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}{!c.ok && <span className="block text-[11px] opacity-80">{c.tip}</span>}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
