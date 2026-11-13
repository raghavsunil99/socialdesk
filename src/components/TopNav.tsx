"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const ITEMS = [
  { href: "/analytics", label: "Analytics" },
  { href: "/planner", label: "Planner" },
  { href: "/competitors", label: "Competitors" },
  { href: "/ideas", label: "Ideas" },
  { href: "/reports", label: "Reports" },
  { href: "/smartlinks", label: "SmartLinks" },
  { href: "/settings", label: "Connections" },
  { href: "/team", label: "Team" },
  { href: "/brands", label: "Brands" },
];

type Props = { brands: { id: number; name: string }[]; currentId: number; role: string; user: { name: string; email: string } };

export function TopNav({ brands, currentId, role, user }: Props) {
  const path = usePathname();
  const router = useRouter();
  if (path.startsWith("/l/")) return null; // public link-in-bio pages have no app chrome
  return (
    <header className="no-print sticky top-0 z-20 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 overflow-x-auto px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 py-3 font-bold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm text-white">S</span>
          Socialdesk
        </Link>
        <nav className="flex gap-0.5">
          {ITEMS.map((i) => {
            const active = path.startsWith(i.href);
            return (
              <Link key={i.href} href={i.href} className={`whitespace-nowrap border-b-2 px-2.5 py-4 text-sm font-medium ${active ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}>
                {i.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <select
            aria-label="Current brand"
            value={currentId}
            onChange={async (e) => {
              if (e.target.value === "new") return router.push("/brands");
              await fetch("/api/brands/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: Number(e.target.value) }) });
              router.refresh();
            }}
            className="rounded-full border-0 bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand"
          >
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            <option value="new">+ Add brand…</option>
          </select>
          <span className="rounded bg-line px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted" title="Your role on this brand">{role}</span>
          <ThemeToggle />
          <span className="hidden text-xs text-muted lg:inline" title={user.email}>{user.name}</span>
          <button
            onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
            className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-bg hover:text-ink"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
