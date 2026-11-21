import { after, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { clean, cleanMultiline, fail, numberText, readSmallJson, tooMany } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { categoryOfProduct } from "@/lib/buyer/dashboard";
import { ensureApproved, isProductPublicNow } from "@/lib/catalog/approvedProducts";
import { resolveProduct } from "@/lib/catalog/productRef";
import { slugify } from "@/lib/catalog/slug";
import { validateQuantity } from "@/lib/catalog/quantity";
import { submitInquiry } from "@/lib/inquiries/service";
import { isIdempotencyKey } from "@/lib/inquiries/rules";
import { distributionStatus, runDistribution } from "@/lib/leads/distribution";
import { DISTRIBUTION_LABEL } from "@/lib/leads/matchingRules";
import { getApproved } from "@/lib/catalog/approvedStore";
import { attributeSetFor, validateAttributes } from "@/lib/catalog/attributes";
import { MATCHING_POLICY_VERSION } from "@/lib/leads/matchingRules";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { validatePostRequirement } from "@/lib/validations/requirement";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/requirements: a registered buyer posts a GENERAL REQUIREMENT. It is stored as ONE canonical inquiry (`sourceType: GENERAL_REQUIREMENT`, no selected
 * supplier) together with its durable distribution job in one transaction, so it appears in My Inquiries, reaches matching suppliers as MATCHED leads through the
 * same worker, and uses the same conversations and quotations. The reference product must be a catalogue product (matching is exact; a supplier-created or sample
 * product cannot drive it). The buyer, the product's name and category, the supplier (none) and the lifecycle are decided here, never by the request. The legacy
 * `requirements` collection is no longer written. Success is returned only after the record exists, with the real distribution state (it starts as Processing).
 */
async function handlePOST(request: Request) {
  if (isCrossSiteWrite(request)) return fail("This request was blocked because it did not come from this site.", 403);
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const user = guard.user;
  await ensureApproved();

  const body = await readSmallJson(request, 8_000);
  if (!body) return fail("Send the requirement as JSON.", 400);

  const values = {
    productId: clean(body.productId, 40),
    quantity: numberText(body.quantity, 12),
    city: clean(body.city, 81),
    requiredBy: clean(body.requiredBy, 10),
    description: cleanMultiline(body.description, 1001),
  };
  const fields: Record<string, string> = { ...validatePostRequirement(values, new Date().toISOString().slice(0, 10)) };
  const key = body.idempotencyKey;
  if (!isIdempotencyKey(key)) fields.idempotencyKey = "Reload the page and try again.";

  // the reference product: public, eligible and a CATALOGUE product (the only kind the matching engine can use)
  const product = fields.productId ? undefined : resolveProduct(values.productId);
  const isCatalog = Boolean(product && product.source === "catalog" && /^\d+$/.test(product.key));
  // supplier products are re-checked against the database: an admin unpublish applies at once, whatever this instance has cached
  const item = product && product.key.startsWith("sp-") && (await isProductPublicNow(product.key)) ? getApproved().byId.get(product.key) : undefined;
  if (!fields.productId && !isCatalog && !item) fields.productId = "This product cannot be used to post a requirement. Select a product from the list.";
  // a supplier product is usable only when its category has specification definitions (otherwise nothing could be matched exactly)
  if (!fields.productId && item && !attributeSetFor(item.nodeId)) fields.productId = "Requirements for this category cannot be matched yet (it has no specification definitions). Select an Apparel & Fashion product.";
  // the specifications the buyer states: the product's own unless the buyer changed them; validated against the category's set, unknown attributes refused
  let requirement: { nodeId: string; attributes: Record<string, { value: string | number; unit?: string }>; policy: string } | undefined;
  if (item && !fields.productId) {
    const raw = body.attributes && typeof body.attributes === "object" && !Array.isArray(body.attributes) ? (body.attributes as Record<string, unknown>) : {};
    const merged: Record<string, unknown> = { ...item.attributes };
    for (const [k, v] of Object.entries(raw)) merged[k] = v;
    const parsed = validateAttributes(item.nodeId, merged, { requireRequired: true });
    if (!parsed.ok) for (const [k, msg] of Object.entries(parsed.errors)) fields[`attr.${k}`] = msg;
    else requirement = { nodeId: item.nodeId, attributes: parsed.value, policy: MATCHING_POLICY_VERSION };
  }
  const checked = product && !fields.quantity ? validateQuantity(values.quantity, clean(body.unit, 20), { unit: product.priceUnit }) : null;
  if (checked && !checked.ok) fields.quantity = checked.message;
  if (Object.keys(fields).length > 0) return fail("Check the highlighted fields.", 422, fields);

  // only well-formed submissions count against the limit
  const limit = await rateLimit(`requirement:${user.id}`, 10, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const categoryName = item ? item.categoryName : categoryOfProduct(product!.key);
  try {
    const result = await submitInquiry(
      { kind: "buyer", buyerId: user.id },
      {
        productKey: product!.key,
        productName: product!.name,
        categoryKey: slugify(categoryName),
        categoryName,
        supplierKey: "",
        supplierName: "",
        source: item ? "supplier" : "catalog",
        ...(requirement ? { requirement } : {}),
        quantity: checked && checked.ok ? checked.quantity : Number(values.quantity),
        unit: checked && checked.ok ? checked.unit : product!.priceUnit,
        message: values.description || undefined,
        inquiryType: "BULK_REQUIREMENT",
        sourceType: "GENERAL_REQUIREMENT",
        deliveryLocation: { text: values.city },
        ...(values.requiredBy ? { requiredBy: new Date(`${values.requiredBy}T00:00:00Z`) } : {}),
      },
      key as string,
    );
    if (!result.ok && result.code === "SUPPLIER_UNAVAILABLE") return fail("This requirement could not be sent right now. Please try again later.", 409);
    if (!result.ok) return fail(result.code === "KEY_CONFLICT" ? "This request key was already used for a different requirement. Reload the page and try again." : "You posted this requirement a moment ago. Check My Inquiries, or wait a few minutes to post it again.", 409);
    // a best-effort first pass; the stored job is the durable guarantee and the worker finishes it
    if (!result.replay) after(() => runDistribution({ maxJobs: 1, maxBatches: 3 }).then(() => undefined, () => undefined));
    const state = await distributionStatus(new ObjectId(result.id)).catch(() => null);
    return NextResponse.json(
      { ok: true, id: result.id, reference: result.reference, replay: result.replay, distribution: state ? { state: state.state, label: DISTRIBUTION_LABEL[state.state] } : null, href: `/buyer/inquiries/${result.reference}` },
      { status: result.replay ? 200 : 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("requirement failed", (error as Error).message);
    return fail("We couldn't save your requirement right now. Nothing was saved. Please try again.", 503);
  }
}

export const POST = withApiPerf("POST api/requirements", handlePOST);
