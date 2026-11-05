import { clean } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { resolveProduct } from "@/lib/catalog/productRef";
import { removeFromCompare } from "@/lib/compare/service";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** DELETE /api/buyer/compare/<productId>: remove one product from the signed-in buyer's own comparison. */
async function handleDELETE(_request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const guard = await buyerGuard({ key: "compare", limit: 60, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const { productId } = await params;
  // a product that has left the catalogue can no longer be resolved: it is still removable by its stored key
  const raw = clean(productId, 80);
  const key = resolveProduct(raw)?.key ?? (/^[\w-]{1,80}$/.test(raw) ? raw : null);
  if (!key) return json({ ok: false, message: "That product was not found." }, 404);
  try {
    return json({ ok: true, removed: await removeFromCompare(guard.user.id, key) });
  } catch (error) {
    console.error("compare remove failed", (error as Error).message);
    return json({ ok: false, message: "We couldn't update your comparison right now." }, 503);
  }
}

export const DELETE = withApiPerf("DELETE api/buyer/compare/:productId", handleDELETE);
