import { NextResponse } from "next/server";
import { getSuggestions } from "@/lib/catalog/categoryListing";
import { MAX_QUERY_LENGTH } from "@/lib/catalog/listingQuery";
import { clientIp, rateLimitReserved } from "@/lib/security/rateLimit";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/products/suggest?q=: up to 8 suggestions for the search boxes (distinct product names and
 * category names that match what was typed). Needs 2 to 100 characters. Suggestions come from the catalog only;
 * no search history, no trends. Rate-limited per address (the box sends one request per pause in typing).
 */
async function handleGET(request: Request) {
  const limit = await rateLimitReserved(`suggest:${clientIp(request)}`, 240, 60);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, code: "RATE_LIMITED", message: "Too many requests. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.length > MAX_QUERY_LENGTH * 2) {
    return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", message: "Check the highlighted parameters.", fields: { q: `Search text can be at most ${MAX_QUERY_LENGTH} characters.` } }, { status: 400 });
  }
  const suggestions = getSuggestions(q);
  return NextResponse.json({ ok: true, data: { query: q.trim(), suggestions } }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}

export const GET = withApiPerf("GET api/public/products/suggest", handleGET);
