import { categoryOfProduct } from "@/lib/buyer/dashboard";
import { slugify } from "@/lib/catalog/slug";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clean, fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveSupplier } from "@/lib/catalog/productRef";
import { getPublicProductByKey, type ProductDetail } from "@/lib/catalog/productDetail";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { GUEST_ACCESS_COOKIE, GUEST_ACCESS_COOKIE_SECONDS, grantAccess } from "@/lib/inquiries/guestAccess";
import { submitInquiry, type Identity } from "@/lib/inquiries/service";
import { validateInquiry } from "@/lib/inquiries/validate";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

const NOT_NOTIFIED = "The supplier is not told by email or inside the platform yet, so a reply time cannot be promised.";

/**
 * POST /api/public/inquiries: a registered buyer or a guest sends an inquiry to one supplier.
 *
 * The supplier comes from `supplierSlug` and is resolved on the server; the product (optional) must exist and belong to
 * that supplier. The buyer is the signed-in account or, with none, the guest details in the body: a buyerId, supplierId,
 * status, reference or notification state in the request is never read. Pipeline: session -> supplier -> product ->
 * validation of every field -> rate limits (well-formed requests only) -> idempotency and duplicate check -> saved.
 * Success is returned only after the record was written, and it says what has NOT happened (no supplier notification).
 */
async function handlePOST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (user && user.role !== "buyer") return fail("Supplier accounts cannot send inquiries. Use a buyer account, or sign out to send as a guest.", 403);

  const body = await readSmallJson(request, 8_000);
  if (!body) return fail("Send the inquiry as JSON.", 400);

  const supplier = getPublicSupplierBySlug(clean(body.supplierSlug, 80).toLowerCase());
  if (!supplier) return fail("That supplier is not available.", 404);

  let product: ProductDetail | undefined;
  let productError: string | undefined;
  const productKey = clean(body.productId, 120);
  if (productKey) {
    const found = getPublicProductByKey(productKey);
    if (!found) productError = "That product is not available.";
    else if (found.supplier.slug !== supplier.slug) productError = "That product does not belong to this supplier.";
    else product = found;
  }

  const checked = validateInquiry(body, {
    signedIn: Boolean(user),
    product: product ? { moq: product.moq ?? undefined, unit: product.pricing.unit } : undefined,
    productError,
  });
  if (!checked.ok) return fail("Check the highlighted fields.", 400, checked.fields);
  const { value } = checked;

  // Only well-formed requests count against the limits, so correcting a typo never locks anyone out.
  if (user) {
    const limit = await rateLimit(`inquiry:${user.id}`, 20, 600);
    if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  } else {
    const byAddress = await rateLimit(`inquiry-guest-ip:${clientIp(request)}`, 10, 600);
    if (!byAddress.ok) return tooMany(byAddress.retryAfterSeconds);
    // Keyed by a hash so the address is not written to the rate-limit store in clear.
    const byEmail = await rateLimit(`inquiry-guest-email:${createHash("sha256").update(value.guest!.email).digest("hex").slice(0, 32)}`, 5, 3600);
    if (!byEmail.ok) return tooMany(byEmail.retryAfterSeconds);
  }

  const identity: Identity = user ? { kind: "buyer", buyerId: user.id } : { kind: "guest", guest: value.guest! };
  const ref = resolveSupplier(supplier.slug) ?? { key: supplier.id, name: supplier.name, source: supplier.source };

  try {
    const result = await submitInquiry(
      identity,
      {
        productKey: product?.id,
        productName: product?.name,
        ...(product ? { categoryKey: slugify(categoryOfProduct(product.id)), categoryName: categoryOfProduct(product.id) } : {}),
        supplierKey: ref.key,
        supplierName: supplier.name,
        supplierSlug: supplier.slug,
        source: ref.source,
        quantity: value.quantity,
        unit: value.unit,
        message: value.message,
        inquiryType: value.inquiryType,
        deliveryLocation: value.deliveryLocation,
        consent: { accepted: true, at: new Date(), policyVersion: null, termsPath: "/terms-and-conditions", privacyPath: "/privacy-policy" },
      },
      value.idempotencyKey,
    );
    if (!result.ok) {
      return result.code === "KEY_CONFLICT"
        ? fail("This request key was already used for a different inquiry. Reload the page and try again.", 409)
        : fail("You already sent this inquiry a moment ago. Check your reference, or wait a few minutes to send it again.", 409);
    }
    const tracking = user
      ? "You can follow it under My Inquiries."
      : "Keep this reference: guest inquiries cannot be tracked online yet, and anyone who has only the reference cannot open it.";
    const response = NextResponse.json(
      {
        ok: true,
        message: `Your inquiry to ${supplier.name} has been saved. Reference: ${result.reference}. ${tracking} ${NOT_NOTIFIED}`,
        reference: result.reference,
        status: result.status,
        replay: result.replay,
        supplier: { slug: supplier.slug, name: supplier.name },
        notification: { supplierNotified: false, buyerEmailSent: false },
        confirmationUrl: `/inquiry/success/${result.reference}`,
        tracking: { available: Boolean(user), url: user ? "/buyer/inquiries" : null },
      },
      { status: result.replay ? 200 : 201, headers: { "Cache-Control": "no-store" } },
    );
    // A guest has no account, so the browser that submitted gets a signed, httpOnly cookie that opens this one confirmation for an hour.
    if (!user) {
      response.cookies.set({
        name: GUEST_ACCESS_COOKIE,
        value: grantAccess((await cookies()).get(GUEST_ACCESS_COOKIE)?.value, result.reference),
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: GUEST_ACCESS_COOKIE_SECONDS,
      });
    }
    return response;
  } catch (error) {
    console.error("inquiry save failed", (error as Error).message);
    return fail("We couldn't save your inquiry right now. Nothing was sent. Please try again.", 503);
  }
}

export const POST = withApiPerf("POST api/public/inquiries", handlePOST);
