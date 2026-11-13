import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cookies, headers } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getUser } from "@/lib/auth";
import { BRAND_COOKIE, listBrands } from "@/lib/brand";
import { usageToday } from "@/lib/ai";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Socialdesk · Built by Raghav",
  description: "Plan, publish and analyze social media for every brand in one place. Built by Raghav.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getUser();
  const brands = user ? listBrands(user.id) : [];
  const wanted = Number((await cookies()).get(BRAND_COOKIE)?.value);
  const current = brands.find((b) => b.id === wanted) ?? brands[0];
  // Public link-in-bio pages (/l/…) and sign-in screens render without the app chrome.
  const path = (await headers()).get("x-pathname") ?? "";
  const bare = !user || !current || path.startsWith("/l/");
  const usage = current ? usageToday(current.id) : { used: 0, limit: 0 };
  const ideas = current ? (db().prepare("SELECT COUNT(*) AS n FROM ai_ideas WHERE brand_id = ? AND vote >= 0").get(current.id) as { n: number }).n : 0;

  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head>
        {/* Apply the saved theme before first paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}` }} />
      </head>
      <body className="antialiased">
        <TooltipProvider>
          {bare ? (
            <main>{children}</main>
          ) : (
            <AppShell
              brands={brands.map((b) => ({ id: b.id, name: b.name }))}
              currentId={current.id}
              role={current.role}
              user={{ name: user!.name, email: user!.email }}
              aiLeft={Math.max(0, usage.limit - usage.used)}
              ideas={ideas}
            >
              {children}
            </AppShell>
          )}
        </TooltipProvider>
      </body>
    </html>
  );
}
