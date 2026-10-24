/**
 * BODY-SIZE GUARD — runs before every API route and the recipient pages.
 *
 * Plain English: a request that sends data (POST) must say how big it is, and may be at most 256 KB.
 * Anything bigger, or of unknown size, is refused straight away with 413 / 411, before any route reads
 * it — so nobody can clog the server or the database with a giant upload. The biggest real request
 * (a document upload: up to 20,000 characters of text plus its fields) is far below this limit.
 *
 * DATABASE NOT CONFIGURED: in production with no database key, every API route (except /api/health,
 * which reports db "down") and every recipient page answers 503 "Database not configured" here,
 * instead of each route failing on its own. The in-memory demo store is never used in production.
 */
import { NextResponse, type NextRequest } from "next/server";
import { DB_CONFIGURED } from "@/lib/db-config";

const NOT_CONFIGURED = "Database not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy.";

const MAX_BODY_BYTES = 256 * 1024;

export function middleware(req: NextRequest) {
  if (!DB_CONFIGURED && req.nextUrl.pathname !== "/api/health") {
    if (!req.nextUrl.pathname.startsWith("/s/")) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });
    const page = `<!doctype html><meta charset="utf-8"><title>UNIVAULT</title><h1>Database not configured</h1><p>${NOT_CONFIGURED}</p>`;
    return new NextResponse(page, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (req.method !== "POST") return NextResponse.next();
  const size = Number(req.headers.get("content-length"));
  if (!req.headers.has("content-length") || !Number.isFinite(size)) {
    return NextResponse.json({ error: "Please send the size of the request (Content-Length)." }, { status: 411 });
  }
  if (size > MAX_BODY_BYTES) {
    return NextResponse.json({ error: `The request is too large (limit ${MAX_BODY_BYTES / 1024} KB). Nothing was stored.` }, { status: 413 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*", "/s/:path*"] };
