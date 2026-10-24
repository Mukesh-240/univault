/**
 * MIDDLEWARE — runs before every page and API route.
 *
 * 1. DATABASE NOT CONFIGURED: in production with no database key, every API route (except /api/health,
 *    which reports db "down") and every recipient page answers 503 "Database not configured" here,
 *    instead of each route failing on its own. Pages are let through: the layout shows the same message.
 *    The in-memory demo store is never used in production.
 * 2. BODY-SIZE GUARD: a request that sends data (POST) must say how big it is, and may be at most 256 KB.
 *    Anything bigger, or of unknown size, is refused straight away with 413 / 411, before any route reads
 *    it — so nobody can clog the server or the database with a giant upload.
 * 3. SIGN-IN GATE (src/lib/gate.ts): without a valid session cookie, pages go to /signin and API calls get
 *    401. Recipient links (/s/…), /api/health, the cron route, /api/auth/*, /threat-model and /policy stay
 *    open. The session cookie is signed (session.ts) and is checked here with the Web Crypto API.
 */
import { NextResponse, type NextRequest } from "next/server";
import { DB_CONFIGURED } from "@/lib/db-config";
import { areaOf, gateFor, homeFor, roleOfArea } from "@/lib/gate";
import { open, SESSION_COOKIE, type Role, type SessionPayload } from "@/lib/session";

const NOT_CONFIGURED = "Database not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy.";

const MAX_BODY_BYTES = 256 * 1024;

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  if (!DB_CONFIGURED && pathname !== "/api/health") {
    if (isApi) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
    if (pathname.startsWith("/s/")) {
      const page = `<!doctype html><meta charset="utf-8"><title>UNIVAULT</title><h1>Database not configured</h1><p>${NOT_CONFIGURED}</p>`;
      return new NextResponse(page, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return NextResponse.next();
  }
  if (req.method === "POST") {
    const size = Number(req.headers.get("content-length"));
    if (!req.headers.has("content-length") || !Number.isFinite(size)) {
      return NextResponse.json({ error: "Please send the size of the request (Content-Length)." }, { status: 411 });
    }
    if (size > MAX_BODY_BYTES) {
      return NextResponse.json({ error: `The request is too large (limit ${MAX_BODY_BYTES / 1024} KB). Nothing was stored.` }, { status: 413 });
    }
  }
  const secret = process.env.VAULT_PRIVATE_KEY;
  const session = secret ? await open<SessionPayload>(req.cookies.get(SESSION_COOKIE)?.value, "session", secret) : null;
  const role: Role | null = session ? session.role ?? "sender" : null; // a cookie from before roles existed was a sender's
  switch (gateFor(pathname, role)) {
    case "signin": return NextResponse.redirect(new URL("/signin", req.url));
    case "home": return NextResponse.redirect(new URL(homeFor(role!), req.url));
    case "redirect": return NextResponse.redirect(new URL(homeFor(role!), req.url));
    case "unauthorized": return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    case "forbidden": {
      if (isApi) return NextResponse.json({ error: "This area is not for your kind of account." }, { status: 403 });
      return NextResponse.redirect(new URL(`/area?for=${roleOfArea(areaOf(pathname))}`, req.url));
    }
    default: return NextResponse.next();
  }
}

// Everything except the build's static files and public files (images, fixtures: anything ending in .ext).
export const config = { matcher: ["/((?!_next/|favicon.ico|.*\\.[A-Za-z0-9]+$).*)"] };
