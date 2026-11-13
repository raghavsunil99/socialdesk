import { NextResponse, type NextRequest } from "next/server";

// Edge middleware: a cheap first gate. It only checks that a session cookie exists;
// every page and API route validates the session and the brand role against the database.
const PUBLIC = [/^\/api\/media\//, /^\/login$/, /^\/setup$/, /^\/api\/auth\//, /^\/l\//];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Let the root layout know the path (public /l/ pages render without the app sidebar).
  const pass = () => {
    const h = new Headers(req.headers);
    h.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers: h } });
  };

  // CSRF: state-changing requests must come from our own origin.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "cross-site request blocked" }, { status: 403 });
  }

  if (PUBLIC.some((r) => r.test(pathname))) return pass();
  if (req.cookies.get("sd_session")) return pass();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please log in" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
