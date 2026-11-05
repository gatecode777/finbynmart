import { NextResponse } from "next/server";
import { clean, fail, readSmallJson } from "@/lib/auth/http";
import { getCurrentUser } from "@/lib/auth/session";
import { buyerGuard, json } from "@/lib/buyer/api";
import { resolveProduct } from "@/lib/catalog/productRef";
import { addToCompare, clearCompare, COMPARE_PRODUCTS_MAX, getProductComparison, listCompareKeys } from "@/lib/compare/service";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/compare: the signed-in buyer's compared product keys (anonymous visitors and suppliers get authenticated:false and an
 * empty list, not an error, so product pages can show the button state). GET ?view=details: the full side-by-side comparison, buyer only.
 */
async function handleGET(request: Request) {
  if (new URL(request.url).searchParams.get("view") === "details") {
    const guard = await buyerGuard();
    if ("response" in guard) return guard.response;
    try {
      return json({ ok: true, data: await getProductComparison(guard.user.id) });
    } catch (error) {
      console.error("compare read failed", (error as Error).message);
      return json({ ok: false, message: "We couldn't load your comparison." }, 503);
    }
  }
  const user = await getCurrentUser().catch(() => null);
  if (!user || user.role !== "buyer") return NextResponse.json({ ok: true, authenticated: false, productIds: [], max: COMPARE_PRODUCTS_MAX }, { headers: { "Cache-Control": "no-store" } });
  try {
    return NextResponse.json({ ok: true, authenticated: true, productIds: await listCompareKeys(user.id), max: COMPARE_PRODUCTS_MAX }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("compare keys read failed", (error as Error).message);
    return fail("We couldn't load your comparison.", 503);
  }
}

/** POST /api/buyer/compare { productId }: add a product (at most 4). Adding twice is harmless (alreadyAdded). Buyer accounts only. */
async function handlePOST(request: Request) {
  const guard = await buyerGuard({ key: "compare", limit: 60, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 1000);
  const product = body ? resolveProduct(clean(body.productId, 80)) : undefined;
  if (!product) return json({ ok: false, message: "That product is not available." }, 404);
  try {
    const added = await addToCompare(guard.user.id, product.key, product.name);
    if (added === "limit") return json({ ok: false, code: "LIMIT", message: `You can compare up to ${COMPARE_PRODUCTS_MAX} products. Remove one to add another.` }, 409);
    return json({ ok: true, added: true, alreadyAdded: !added }, added ? 201 : 200);
  } catch (error) {
    console.error("compare add failed", (error as Error).message);
    return json({ ok: false, message: "We couldn't add this product right now." }, 503);
  }
}

/** DELETE /api/buyer/compare: empty the buyer's comparison list. */
async function handleDELETE() {
  const guard = await buyerGuard({ key: "compare", limit: 60, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  try {
    return json({ ok: true, removed: await clearCompare(guard.user.id) });
  } catch (error) {
    console.error("compare clear failed", (error as Error).message);
    return json({ ok: false, message: "We couldn't clear your comparison right now." }, 503);
  }
}

export const GET = withApiPerf("GET api/buyer/compare", handleGET);
export const POST = withApiPerf("POST api/buyer/compare", handlePOST);
export const DELETE = withApiPerf("DELETE api/buyer/compare", handleDELETE);
