import { NextResponse, type NextRequest } from "next/server";

// Edge middleware: a cheap first gate. It only checks that a session cookie exists;
// every page and API route validates the session and the brand role against the database.
const PUBLIC = [/^\/login$/, /^\/setup$/, /^\/api\/auth\//, /^\/l\//];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CSRF: state-changing requests must come from our own origin.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "cross-site request blocked" }, { status: 403 });
  }

  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (req.cookies.get("sd_session")) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please log in" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
