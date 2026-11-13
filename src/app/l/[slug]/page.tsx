import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PublicLink({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const l = db().prepare("SELECT * FROM smartlinks WHERE slug = ?").get(slug) as Record<string, string> | undefined;
  if (!l) notFound();
  const buttons = JSON.parse(l.buttons) as { label: string }[];
  return (
    <div className="-mx-4 -my-6 min-h-screen px-4 py-12 text-center text-white" style={{ background: l.theme }}>
      <div className="mx-auto max-w-md">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/20 text-3xl font-bold">{l.title[0]}</div>
        <h1 className="mt-4 text-xl font-bold">{l.title}</h1>
        <p className="text-sm opacity-80">{l.bio}</p>
        <div className="mt-8 space-y-3">
          {buttons.map((b, i) => (
            <a key={i} href={`/l/${slug}/go/${i}`} className="block rounded-2xl bg-white px-4 py-3.5 font-semibold text-[#16181d] transition hover:scale-[1.02]">{b.label}</a>
          ))}
        </div>
      </div>
    </div>
  );
}
