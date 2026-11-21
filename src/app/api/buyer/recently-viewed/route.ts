import { NextResponse } from "next/server";
import { clean, fail, tooMany } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { resolveProduct } from "@/lib/catalog/productRef";
import { ensureApproved } from "@/lib/catalog/approvedProducts";
import { rateLimit, rateLimitReserved } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { clearHistory, listRecent, recordView } from "@/lib/recentlyViewed/service";
import { parseListQuery } from "@/lib/recentlyViewed/rules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";
const PRIVATE = { "Cache-Control": "private, no-store" };

/** GET /api/buyer/recently-viewed?cursor=&limit= : the signed-in buyer's own history, newest first. The buyer comes from the session; no buyer id is ever read from the request. */
async function handleGET(request: Request) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const query = parseListQuery(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.ok) return fail("Check the request.", 400, query.fields);
  const limit = await rateLimitReserved(`recent-read:${guard.user.id}`, 120, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  try {
    const data = await listRecent(guard.user.id, query.value.cursor, query.value.limit);
    return NextResponse.json({ ok: true, data }, { headers: PRIVATE });
  } catch (error) {
    console.error("recently viewed read failed", (error as Error).message);
    return fail("We couldn't load your recently viewed products.", 503);
  }
}

/** Reads a small JSON body: JSON content type only, at most 500 characters. */
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  const text = await request.text();
  if (text.length > 500) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/buyer/recently-viewed { productId } : record that the buyer opened a public product. Only the key is accepted; it is resolved on the server
 * (`resolveProduct`), so an unknown, unpublished or inactive product records nothing. Recording twice moves the one entry to the top.
 */
async function handlePOST(request: Request) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  if (isCrossSiteWrite(request)) return fail("This request was blocked because it did not come from this site.", 403);
  const body = await readBody(request);
  if (!body) return fail("Send a small JSON body.", 400);
  if (Object.keys(body).some((k) => k !== "productId")) return fail("Only productId can be sent.", 400);
  const limit = await rateLimit(`recent-write:${guard.user.id}`, 120, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  await ensureApproved();
  const product = resolveProduct(clean(body.productId, 80));
  if (!product) return fail("That product is not available.", 404);
  try {
    await recordView(guard.user.id, product.key);
    return NextResponse.json({ ok: true }, { headers: PRIVATE });
  } catch (error) {
    console.error("recently viewed record failed", (error as Error).message);
    return fail("We couldn't record this view.", 503);
  }
}

/** DELETE /api/buyer/recently-viewed : clear this buyer's history only. Saved products, inquiries, quotations and orders are not touched. */
async function handleDELETE(request: Request) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  if (isCrossSiteWrite(request)) return fail("This request was blocked because it did not come from this site.", 403);
  const limit = await rateLimit(`recent-clear:${guard.user.id}`, 20, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  try {
    const removed = await clearHistory(guard.user.id);
    return NextResponse.json({ ok: true, removed }, { headers: PRIVATE });
  } catch (error) {
    console.error("recently viewed clear failed", (error as Error).message);
    return fail("We couldn't clear your history.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/recently-viewed", handleGET);
export const POST = withApiPerf("POST api/buyer/recently-viewed", handlePOST);
export const DELETE = withApiPerf("DELETE api/buyer/recently-viewed", handleDELETE);
