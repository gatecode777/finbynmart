import { NextResponse } from "next/server";
import { clean, fail, numberText, readSmallJson, tooMany } from "@/lib/auth/http";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveSupplier } from "@/lib/catalog/productRef";
import { createRequirement } from "@/lib/requirements/service";
import { rateLimit } from "@/lib/security/rateLimit";
import { withApiPerf } from "@/lib/perf/instrument";

/** POST /api/requirements: a signed-in buyer posts what they need. Stored in the `requirements` collection. */
async function handlePOST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return fail("Sign in or create a free account to post a requirement.", 401);

  const body = await readSmallJson(request);
  if (!body) return fail("Invalid request.");

  const product = clean(body.product, 120);
  const quantityText = numberText(body.quantity, 12);
  const city = clean(body.city, 80);
  const unit = clean(body.unit, 20) || undefined;
  const category = clean(body.category, 80) || undefined;
  const subcategory = clean(body.subcategory, 80) || undefined;
  const supplierId = clean(body.supplierId, 80);

  const fields: Record<string, string> = {};
  if (!product) fields.product = "Enter a product or service name.";
  if (!/^\d+$/.test(quantityText) || Number(quantityText) < 1 || Number(quantityText) > 1_000_000) {
    fields.quantity = "Enter a whole number between 1 and 1,000,000.";
  }
  if (!city) fields.city = "Enter your city.";
  if (Object.keys(fields).length > 0) return fail("Check the highlighted fields.", 400, fields);

  // A requirement addressed to a supplier must name one that exists; the client never supplies its name or key.
  const supplier = supplierId ? resolveSupplier(supplierId) : undefined;
  if (supplierId && !supplier) return fail("That supplier is not available.", 404);

  // Only well-formed submissions count against the limit, so a typo never uses up a buyer's quota.
  const limit = await rateLimit(`requirement:${user.id}`, 10, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  try {
    const created = await createRequirement(user.id, { product, quantity: Number(quantityText), unit, city, category, subcategory, supplierKey: supplier?.key, supplierName: supplier?.name });
    if (!created) return fail("You already posted this requirement a moment ago.", 409);
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (error) {
    console.error("requirement failed", error);
    return fail("We couldn't save your requirement right now. Please try again.", 503);
  }
}

export const POST = withApiPerf("POST api/requirements", handlePOST);
