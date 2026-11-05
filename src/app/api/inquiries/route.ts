import { NextResponse } from "next/server";
import { clean, cleanMultiline, fail, numberText, readSmallJson, tooMany } from "@/lib/auth/http";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveProduct, resolveSupplier } from "@/lib/catalog/productRef";
import { validateQuantity } from "@/lib/catalog/quantity";
import { createInquiry } from "@/lib/inquiries/service";
import { rateLimit } from "@/lib/security/rateLimit";
import { withApiPerf } from "@/lib/perf/instrument";

/**
 * POST /api/inquiries: a signed-in buyer asks a supplier for a quote, about one product or in general.
 * The product and supplier are resolved from the catalog on the server. Unknown ones are refused, and
 * the client can never name a supplier that does not own the product.
 */
async function handlePOST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return fail("Sign in or create a free account to request a quote.", 401);

  const body = await readSmallJson(request);
  if (!body) return fail("Invalid request.");

  const productId = clean(body.productId, 80);
  const supplierId = clean(body.supplierId, 80);
  const quantityText = numberText(body.quantity, 12);
  const unitGiven = clean(body.unit, 20);
  const message = cleanMultiline(body.message, 1000) || undefined;
  const type: "quote" | "inquiry" = body.type === "inquiry" ? "inquiry" : "quote";

  if (!productId && !supplierId) return fail("Choose a product or supplier to ask about.", 400);
  // A written inquiry needs the question itself; a quote request may leave the message empty.
  if (type === "inquiry" && (message ?? "").length < 10) {
    return fail("Check the highlighted fields.", 400, { message: "Write your question in at least 10 characters." });
  }

  let supplier: { key: string; name: string; source: "catalog" | "sample" } | undefined;
  let quantity = 0;
  let unit: string | undefined = unitGiven || undefined;
  let product: ReturnType<typeof resolveProduct>;

  if (productId) {
    product = resolveProduct(productId);
    if (!product) return fail("That product is not available.", 404);
    supplier = { key: product.supplierKey, name: product.supplierName, source: product.source };
    // The product's own MOQ and unit decide what is acceptable, never the client.
    const checked = validateQuantity(quantityText, unitGiven, { moq: product.moq, unit: product.priceUnit });
    if (!checked.ok) return fail("Check the highlighted fields.", 400, { quantity: checked.message });
    quantity = checked.quantity;
    unit = checked.unit;
    if (supplierId) {
      const named = resolveSupplier(supplierId);
      if (!named || named.key !== product.supplierKey) return fail("That supplier does not sell this product.", 400);
    }
  } else {
    supplier = resolveSupplier(supplierId);
    if (!supplier) return fail("That supplier is not available.", 404);
    const checked = validateQuantity(quantityText, unitGiven);
    if (!checked.ok) return fail("Check the highlighted fields.", 400, { quantity: checked.message });
    quantity = checked.quantity;
  }

  // Only inquiries that name a real product or supplier count against the limit.
  const limit = await rateLimit(`inquiry:${user.id}`, 20, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  try {
    const created = await createInquiry(user.id, {
      productKey: product?.key,
      productName: product?.name,
      supplierKey: supplier.key,
      supplierName: supplier.name,
      source: supplier.source,
      quantity,
      unit,
      message,
      type,
    });
    if (!created) return fail("You already sent this inquiry a moment ago.", 409);
    return NextResponse.json({ ok: true, id: created.id, reference: created.reference }, { status: 201 });
  } catch (error) {
    console.error("inquiry failed", error);
    return fail("We couldn't send your inquiry right now. Please try again.", 503);
  }
}

export const POST = withApiPerf("POST api/inquiries", handlePOST);
