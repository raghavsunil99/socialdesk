import { db } from "@/lib/db";
import { SmartLinkEditor, type Link } from "./SmartLinkEditor";
import { currentBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function SmartLinks() {
  const brand = await currentBrand();
  if (brand.role === "viewer" || brand.role === "creator") {
    const slug = (db().prepare("SELECT slug FROM smartlinks WHERE brand_id = ?").get(brand.id) as { slug: string } | undefined)?.slug;
    return <div className="card p-8 text-center text-sm text-muted-foreground">Editing the link-in-bio page needs the editor role. {slug && <>Public page: <a className="text-brand underline" href={`/l/${slug}`}>/l/{slug}</a></>}</div>;
  }
  const row = db().prepare("SELECT * FROM smartlinks WHERE brand_id = ? ORDER BY id LIMIT 1").get(brand.id) as Record<string, unknown>;
  const clicks7d = (db().prepare("SELECT COUNT(*) AS n FROM smartlink_clicks WHERE smartlink_id = ? AND at >= datetime('now', '-7 days')").get(Number(row.id)) as { n: number }).n;
  const link: Link = { id: Number(row.id), slug: String(row.slug), title: String(row.title), bio: String(row.bio ?? ""), theme: String(row.theme), buttons: JSON.parse(String(row.buttons)) };
  return <SmartLinkEditor key={link.id} initial={link} clicks7d={clicks7d} />;
}
