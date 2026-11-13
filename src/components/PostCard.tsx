import { fmt } from "./charts";

export type PostView = {
  external_id: string; kind: string; published_at: string; url: string; caption: string; thumbnail: string | null;
  views: number | null; likes: number; comments: number; channel?: string; perDay?: number; outlier?: number | null;
};

/** One competitor / trending post: thumbnail, caption, views, per-day pace and outlier score. */
export function PostCard({ p, showChannel }: { p: PostView; showChannel?: boolean }) {
  return (
    <a href={p.url} target="_blank" rel="noreferrer" className="group flex gap-3 rounded-lg border border-line p-2 hover:border-brand">
      <div className="h-16 w-24 shrink-0 overflow-hidden rounded bg-bg">
        {p.thumbnail
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          : <div className="grid h-full place-items-center text-xs text-muted">{p.kind}</div>}
      </div>
      <div className="min-w-0 flex-1 text-xs">
        <div className="line-clamp-2 font-medium text-ink group-hover:text-brand">{p.caption || "(no caption)"}</div>
        <div className="mt-1 flex flex-wrap gap-x-2 text-muted">
          {showChannel && p.channel && <span className="text-ink">{p.channel}</span>}
          <span>{p.kind}</span>
          <span>{new Date(p.published_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
          {p.views !== null && <span><b className="text-ink">{fmt(p.views)}</b> views</span>}
          <span>{fmt(p.likes)} likes</span>
          <span>{fmt(p.perDay ?? 0)}/day</span>
          {p.outlier != null && <span className={p.outlier >= 2 ? "font-semibold text-good" : ""}>{p.outlier}× median</span>}
        </div>
      </div>
    </a>
  );
}
