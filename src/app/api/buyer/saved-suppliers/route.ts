import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { fail, readSmallJson } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { buyerGuard, json } from "@/lib/buyer/api";
import { getDb } from "@/lib/db/mongo";
import { listSavedSuppliersPage } from "@/lib/wishlist/savedSuppliers";
import { parseSavedSupplierQuery } from "@/lib/wishlist/savedSuppliersRules";
import { clearSavedSuppliers } from "@/lib/wishlist/supplierService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/saved-suppliers?q=&category=&state=&city=&type=&verification=&sort=&page=&limit=
 * The signed-in buyer's own saved suppliers with their live public catalogue details (the buyer comes from the session; a buyerId
 * parameter is never read). Saving and removing ONE supplier use the existing routes (they are shared by the supplier cards, the
 * supplier profile and this page): POST /api/buyer/wishlist/suppliers and DELETE /api/buyer/wishlist/suppliers/[supplierId].
 */
async function handleGET(request: Request) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const query = parseSavedSupplierQuery(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.ok) return fail("Check the filters.", 400, query.fields);
  try {
    const data = await listSavedSuppliersPage(guard.user.id, query.value);
    return NextResponse.json({ ok: true, data, meta: { total: data.total, page: data.page, limit: data.limit, totalPages: data.totalPages } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("saved suppliers read failed", (error as Error).message);
    return fail("We couldn't load your saved suppliers.", 503);
  }
}

/**
 * DELETE /api/buyer/saved-suppliers { confirm: true }: empties the buyer's OWN saved-supplier list. Only the bookmarks go: no supplier
 * record, product or other buyer's list is touched. The explicit confirmation is required; the action is logged (a count, no names).
 */
async function handleDELETE(request: Request) {
  const guard = await buyerGuard({ key: "saved-suppliers-clear", limit: 10, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 500);
  if (!body || body.confirm !== true) return json({ ok: false, message: "Confirm that you want to clear your saved suppliers.", fields: { confirm: "Confirm first." } }, 400);
  try {
    const removed = await clearSavedSuppliers(guard.user.id);
    await (await getDb()).collection("security_events").insertOne({ userId: new ObjectId(guard.user.id), type: "saved_suppliers_cleared", at: new Date(), removed }).catch(() => undefined);
    return json({ ok: true, removed });
  } catch (error) {
    console.error("saved suppliers clear failed", (error as Error).message);
    return json({ ok: false, message: "We couldn't clear your saved suppliers right now. Nothing was changed." }, 503);
  }
}

export const GET = withApiPerf("GET api/buyer/saved-suppliers", handleGET);
export const DELETE = withApiPerf("DELETE api/buyer/saved-suppliers", handleDELETE);
