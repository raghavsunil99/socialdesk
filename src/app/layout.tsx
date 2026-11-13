import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { TopNav } from "@/components/TopNav";
import { getUser } from "@/lib/auth";
import { BRAND_COOKIE, listBrands } from "@/lib/brand";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Socialdesk",
  description: "Plan, publish and analyze social media for every brand in one place.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getUser();
  const brands = user ? listBrands(user.id) : [];
  const wanted = Number((await cookies()).get(BRAND_COOKIE)?.value);
  const current = brands.find((b) => b.id === wanted) ?? brands[0];
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}` }} />
      </head>
      <body className={`${jakarta.variable} antialiased`}>
        {user && current && (
          <TopNav brands={brands.map((b) => ({ id: b.id, name: b.name }))} currentId={current.id} role={current.role} user={{ name: user.name, email: user.email }} />
        )}
        <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
