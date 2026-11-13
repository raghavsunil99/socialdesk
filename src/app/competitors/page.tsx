/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { db } from "@/lib/db";
import { currentBrand } from "@/lib/brand";
import { atLeast } from "@/lib/auth";
import { contentList, getAccount, periodFromDays, summary } from "@/lib/metrics";
import { competitorPosts, type Competitor, type Post } from "@/lib/competitors";
import { fmt } from "@/components/charts";
import { PostCard } from "@/components/PostCard";
import { AddCompetitor, CompetitorActions, TrendingSearch } from "./CompetitorsClient";

export const dynamic = "force-dynamic";

const NETS = [["youtube", "YouTube"], ["instagram", "Instagram"]] as const;
const SORTS = [["outlier", "Outliers"], ["perDay", "Trending (per day)"], ["views", "Most viewed"], ["recent", "Newest"]] as const;

export default async function Competitors({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const brand = await currentBrand();
  const sp = await searchParams;
  const net = sp.net === "instagram" ? "instagram" : "youtube";
  const sort = (SORTS.map((s) => s[0]) as string[]).includes(sp.sort ?? "") ? sp.sort! : "outlier";
  const canEdit = atLeast(brand.role, "editor");
  const comps = (db().prepare("SELECT * FROM competitors WHERE brand_id = ? AND network = ? ORDER BY followers DESC").all(brand.id, net) as Competitor[]).map((r) => ({ ...r }));
  const real = comps.filter((c) => !c.handle.startsWith("demo_"));

  // Your own row, from your connected (or demo) account on this network.
  const me = getAccount(brand.id, net);
  let mine: { followers: number; posts30: number; eng: number | null; median: number | null } | null = null;
  if (me && me.connector !== "none") {
    const { from, to } = periodFromDays(30);
    const s = summary(me.id, from, to);
    const content = contentList(me.id, "2000-01-01", to).slice(0, 50);
    const views = content.map((c) => c.views).sort((a, b) => a - b);
    mine = {
      followers: s.followers.value,
      posts30: s.posts.value + s.reels.value,
      eng: content.length
        ? (content.reduce((t, c) => t + (net === "youtube" ? (c.views ? (c.likes + c.comments) / c.views : 0) : (c.likes + c.comments) / Math.max(1, s.followers.value)), 0) / content.length) * 100
        : null,
      median: views.length ? views[Math.floor(views.length / 2)] : null,
    };
  }
  const key = (p: Post) =>
    sort === "recent" ? new Date(p.published_at).getTime() : sort === "views" ? p.views ?? p.likes : sort === "perDay" ? p.perDay ?? 0 : p.outlier ?? 0;
  const sortPosts = (ps: Post[]) => [...ps].sort((a, b) => key(b) - key(a));
  const base = `/competitors?net=${net}`;
  const cols = ["Account", net === "youtube" ? "Subscribers" : "Followers", "Posts (30d)", ...(net === "youtube" ? ["Median views"] : []), "Avg. engagement", ""];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{brand.name} · Competitors &amp; trends</h1>
          <p className="text-sm text-muted-foreground">
            Track accounts in your niche and see what&apos;s working for them. <b>Outlier</b> = a post&apos;s views ÷ that account&apos;s median
            {net === "instagram" ? " (likes + comments for Instagram, which doesn't share views)" : ""}, so 3× means three times their usual.
          </p>
        </div>
        <div className="flex rounded-lg border border-line bg-surface p-0.5 text-sm">
          {NETS.map(([k, label]) => (
            <Link key={k} href={`/competitors?net=${k}`} className={`rounded-md px-3 py-1 ${k === net ? "bg-brand text-white" : "text-muted-foreground hover:text-ink"}`}>{label}</Link>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-xs text-muted-foreground">
            <tr>{cols.map((h, i) => <th key={i} className="px-4 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {mine && (
              <tr className="border-t border-line bg-brand-soft/50">
                <td className="px-4 py-2 font-medium">@{me!.handle} <span className="text-xs text-muted-foreground">(you{me!.connector === "demo" ? ", demo data" : ""})</span></td>
                <td className="px-4 py-2 tabular-nums">{fmt(mine.followers)}</td>
                <td className="px-4 py-2 tabular-nums">{mine.posts30}</td>
                {net === "youtube" && <td className="px-4 py-2 tabular-nums">{mine.median === null ? "–" : fmt(mine.median)}</td>}
                <td className="px-4 py-2 tabular-nums">{mine.eng === null ? "–" : `${mine.eng.toFixed(2)}%`}</td>
                <td />
              </tr>
            )}
            {comps.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    {c.picture && <img src={c.picture} alt="" className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" />}
                    <span className="font-medium">{c.name ?? c.handle}</span>
                    <span className="text-xs text-muted-foreground">{c.handle.startsWith("@") ? c.handle : `@${c.handle}`}</span>
                  </div>
                  {c.error && <div className="text-xs text-bad">Last refresh failed: {c.error}</div>}
                </td>
                <td className="px-4 py-2 tabular-nums">{c.followers === null ? "pending" : fmt(c.followers)}</td>
                <td className="px-4 py-2 tabular-nums">{c.posts_30d ?? "–"}</td>
                {net === "youtube" && <td className="px-4 py-2 tabular-nums">{c.avg_reach ? fmt(c.avg_reach) : "–"}</td>}
                <td className="px-4 py-2 tabular-nums">{c.avg_engagement === null ? "–" : `${c.avg_engagement.toFixed(2)}%`}</td>
                <td className="px-4 py-2 text-right">{canEdit && !c.handle.startsWith("demo_") && <CompetitorActions id={c.id} />}</td>
              </tr>
            ))}
            {comps.length === 0 && <tr><td colSpan={cols.length} className="px-4 py-6 text-center text-muted-foreground">No {net === "youtube" ? "YouTube channels" : "Instagram accounts"} tracked yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {canEdit && <AddCompetitor network={net} />}

      {real.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Top content from competitors</h2>
            <div className="flex gap-3 text-xs">
              {SORTS.filter(([k]) => net === "youtube" || k !== "views").map(([k, label]) => (
                <Link key={k} href={`${base}&sort=${k}`} className={k === sort ? "font-semibold text-brand" : "text-muted-foreground hover:text-ink"}>{label}</Link>
              ))}
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {real.map((c) => {
              const all = competitorPosts(c.id);
              return (
                <div key={c.id} className="card space-y-2 p-3">
                  <div className="text-sm font-semibold">{c.name ?? c.handle} <span className="font-normal text-muted-foreground">· last {all.length} posts · refreshed {c.updated_at ?? "never"}</span></div>
                  {all.length === 0 ? <p className="text-xs text-muted-foreground">No content fetched yet.</p> : sortPosts(all).slice(0, 6).map((p) => <PostCard key={p.external_id} p={p} />)}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <TrendingSearch network={net} />
    </div>
  );
}
