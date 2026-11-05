import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { validateSupplierSignup } from "@/lib/auth/supplierRegistration";
import { registerAccount } from "@/lib/auth/registerFlow";
import { withApiPerf } from "@/lib/perf/instrument";

/**
 * POST /api/auth/register/supplier: same pipeline as the buyer route. The business is stored as typed on the account
 * (`supplier` details); nothing is verified and no catalogue seller is linked to it.
 */
async function handlePOST(request: Request) {
  const body = await readSmallJson(request, 5_000);
  if (!body) return fail("Invalid request.");

  const result = validateSupplierSignup(body);
  if (!result.ok) return fail("Check the highlighted fields.", 400, result.fields);
  const input = result.value;

  const limit = await rateLimit(`register:${clientIp(request)}`, 10, 3600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  return registerAccount(request, {
    name: input.contactName,
    email: input.email,
    role: "supplier",
    phone: input.phone,
    supplier: { businessName: input.businessName, phone: input.phone.normalized, city: input.city, offering: input.offering },
    password: input.password,
    consentPolicyVersion: input.consentPolicyVersion,
  });
}

export const POST = withApiPerf("POST api/auth/register/supplier", handlePOST);
