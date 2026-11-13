import Link from "next/link";
import { currentBrand } from "@/lib/brand";
import { atLeast } from "@/lib/auth";
import { competitorOutliers, hookWords, keywords, storedIdeas, trends, yourWinners, type IdeaSource } from "@/lib/ideas";
import { usageToday } from "@/lib/ai";
import { PostCard } from "@/components/PostCard";
import { AiIdeas, KeywordChips, RefreshTrends, SaveIdea } from "./IdeasClient";

export const dynamic = "force-dynamic";

function Section({ title, sub, children, action }: { title: string; sub: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
          <p className="text-xs text-muted">{sub}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Cards({ items, canWrite, empty }: { items: IdeaSource[]; canWrite: boolean; empty: React.ReactNode }) {
  if (!items.length) return <div className="card p-6 text-center text-sm text-muted">{empty}</div>;
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {items.map((p) => (
        <div key={p.source + p.external_id} className="space-y-1">
          <PostCard p={{ ...p, channel: p.from }} showChannel />
          {canWrite && <SaveIdea title={p.caption.split("\n")[0].slice(0, 120)} source={p.url} from={p.from} />}
        </div>
      ))}
    </div>
  );
}

export default async function Ideas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const brand = await currentBrand();
  const net = (await searchParams).net === "instagram" ? "instagram" : "youtube";
  const canWrite = atLeast(brand.role, "creator");
  const outliers = competitorOutliers(brand.id, net);
  const trend = await trends(brand.id, net);
  const winners = yourWinners(brand.id, net);
  const words = hookWords([...outliers, ...trend.items]);
  const kws = keywords(brand.id, net);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{brand.name} · Ideas</h1>
          <p className="text-sm text-muted">What to record next, backed by what&apos;s already working for your competitors, your niche and you.</p>
        </div>
        <div className="flex rounded-lg border border-line bg-surface p-0.5 text-sm">
          {(["youtube", "instagram"] as const).map((k) => (
            <Link key={k} href={`/ideas?net=${k}`} className={`rounded-md px-3 py-1 capitalize ${k === net ? "bg-brand text-white" : "text-muted hover:text-ink"}`}>{k === "youtube" ? "YouTube" : "Instagram"}</Link>
          ))}
        </div>
      </div>

      <div className="card space-y-2 p-4">
        <div className="text-sm font-semibold">Your niche keywords</div>
        <p className="text-xs text-muted">Socialdesk searches these for trending {net === "youtube" ? "Shorts from the last 7 days" : "hashtag posts"} and refreshes every 6 hours.</p>
        <KeywordChips network={net} keywords={kws} canEdit={canWrite} />
      </div>

      <AiIdeas network={net} ideas={storedIdeas(brand.id, net)} usage={usageToday(brand.id)} canWrite={canWrite} />

      <Section
        title="🔥 Rising in your niche"
        sub={trend.fetchedAt ? `Fastest-growing posts for your keywords · checked ${trend.fetchedAt} UTC` : "Add keywords above to see what's taking off"}
        action={kws.length > 0 && canWrite ? <RefreshTrends network={net} /> : undefined}
      >
        {trend.errors.length > 0 && <p className="text-xs text-bad">{trend.errors.join(" · ")}</p>}
        <Cards items={trend.items.slice(0, 10)} canWrite={canWrite} empty={<>No trending posts yet. Add keywords like <b>AI telugu</b> or <b>govt schemes telugu</b>.</>} />
      </Section>

      <Section title="🏆 Proven by competitors" sub="Posts from the last 60 days that did at least 2.5× that account's usual views. Remix the topic, don't copy the video.">
        <Cards items={outliers.slice(0, 10)} canWrite={canWrite} empty={<>Track channels on the <Link href={`/competitors?net=${net}`} className="text-brand underline">Competitors</Link> page to see their outliers here.</>} />
      </Section>

      <Section title="⭐ Your winners: make a part 2" sub="Your best posts. Audiences that loved these will watch a follow-up or a series.">
        <Cards items={winners} canWrite={canWrite} empty={<>Connect this brand&apos;s {net === "youtube" ? "YouTube" : "Instagram"} in Connections to see your own winners.</>} />
      </Section>

      {words.length > 0 && (
        <Section title="🔑 Words in posts that are working" sub="Topics and hooks that show up again and again in the outliers and trends above.">
          <div className="card flex flex-wrap gap-2 p-4">
            {words.map(([w, n]) => <span key={w} className="rounded-full bg-brand-soft px-3 py-1 text-sm text-brand">{w} <span className="text-xs text-muted">×{n}</span></span>)}
          </div>
        </Section>
      )}
    </div>
  );
}
