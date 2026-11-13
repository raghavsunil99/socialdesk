"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Building2, CalendarDays, Check, ChevronsUpDown, FileText, Lightbulb, Link2, LogOut, Monitor, Moon, Plug, Plus, Sparkles, Sun, Users, UsersRound,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu,
  SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

type Props = {
  children: React.ReactNode;
  brands: { id: number; name: string }[];
  currentId: number;
  role: string;
  user: { name: string; email: string };
  aiLeft: number;
  ideas: number;
};

const MAIN = [
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/planner", label: "Planner", icon: CalendarDays },
  { href: "/ideas", label: "Ideas", icon: Lightbulb, badge: "ideas" as const },
  { href: "/competitors", label: "Competitors", icon: Users },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/smartlinks", label: "SmartLinks", icon: Link2 },
];
const WORKSPACE = [
  { href: "/settings", label: "Connections", icon: Plug },
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/brands", label: "Brands", icon: Building2 },
  { href: "/ai-usage", label: "AI usage", icon: Sparkles, badge: "ai" as const },
];
const TITLES: Record<string, string> = Object.fromEntries([...MAIN, ...WORKSPACE].map((i) => [i.href, i.label]));

type Theme = "system" | "light" | "dark";
function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") setTheme(t); } catch {}
  }, []);
  return [theme, (t) => {
    setTheme(t);
    if (t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    try { if (t === "system") localStorage.removeItem("theme"); else localStorage.setItem("theme", t); } catch {}
  }];
}

export function AppShell({ children, brands, currentId, role, user, aiLeft, ideas }: Props) {
  const path = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useTheme();
  const current = brands.find((b) => b.id === currentId);
  const initials = user.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const title = Object.entries(TITLES).find(([h]) => path.startsWith(h))?.[1] ?? "";

  const switchBrand = async (id: number) => {
    await fetch("/api/brands/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    router.refresh();
  };

  const nav = (items: typeof MAIN | typeof WORKSPACE) =>
    items.map((i) => (
      <SidebarMenuItem key={i.href}>
        <SidebarMenuButton asChild isActive={path.startsWith(i.href)} tooltip={i.label}>
          <Link href={i.href}><i.icon /><span>{i.label}</span></Link>
        </SidebarMenuButton>
        {"badge" in i && i.badge === "ideas" && ideas > 0 && <SidebarMenuBadge>{ideas}</SidebarMenuBadge>}
        {"badge" in i && i.badge === "ai" && <SidebarMenuBadge className={aiLeft === 0 ? "text-destructive" : ""}>{aiLeft} left</SidebarMenuBadge>}
      </SidebarMenuItem>
    ));

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="no-print">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary font-bold text-sidebar-primary-foreground">S</div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{current?.name ?? "Socialdesk"}</span>
                      <span className="truncate text-xs text-muted-foreground capitalize">{role} · Socialdesk</span>
                    </div>
                    <ChevronsUpDown className="ml-auto" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-56" align="start" side="bottom">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Brands</DropdownMenuLabel>
                  {brands.map((b) => (
                    <DropdownMenuItem key={b.id} onClick={() => switchBrand(b.id)}>
                      <div className="flex size-6 items-center justify-center rounded-md border text-xs font-semibold">{b.name[0]?.toUpperCase()}</div>
                      {b.name}
                      {b.id === currentId && <Check className="ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link href="/brands"><Plus />Add or manage brands</Link></DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent><SidebarMenu>{nav(MAIN)}</SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu>{nav(WORKSPACE)}</SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                    <Avatar className="size-8 rounded-lg"><AvatarFallback className="rounded-lg">{initials}</AvatarFallback></Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </div>
                    <ChevronsUpDown className="ml-auto" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-56" side="top" align="start">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                    <DropdownMenuRadioItem value="system"><Monitor />System</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="light"><Sun />Light</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark"><Moon />Dark</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link href="/team"><UsersRound />Account &amp; password</Link></DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>
                    <LogOut />Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
          <p className="px-2 pb-1 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
            <span className="font-semibold text-sidebar-foreground">Socialdesk</span> · Built by Raghav
          </p>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="no-print sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <span className="text-sm text-muted-foreground">{current?.name}</span>
          {title && <><span className="text-sm text-muted-foreground">/</span><span className="text-sm font-medium">{title}</span></>}
        </header>
        <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6">{children}</div>
        <footer className="no-print border-t px-6 py-4 text-center text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Socialdesk</span> · Built by Raghav
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
