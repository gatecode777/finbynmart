import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { validateBuyerRegistration } from "@/lib/auth/buyerRegistration";
import { registerAccount } from "@/lib/auth/registerFlow";
import { withApiPerf } from "@/lib/perf/instrument";

/**
 * POST /api/auth/register/buyer. Pipeline: small JSON body -> validation of every field (the role, status and
 * verification flags can only be set here, never by the client) -> rate limit (well-formed requests only) -> account ->
 * verification email when a provider exists (see registerFlow.ts).
 */
async function handlePOST(request: Request) {
  const body = await readSmallJson(request, 4_000);
  if (!body) return fail("Invalid request.");

  const result = validateBuyerRegistration(body);
  if (!result.ok) return fail("Check the highlighted fields.", 400, result.fields);
  const input = result.value;

  // Only well-formed requests count against the limit (a typo never locks anyone out); invalid ones cost nothing: no hashing, no database.
  const limit = await rateLimit(`register:${clientIp(request)}`, 10, 3600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  return registerAccount(request, { name: input.name, email: input.email, role: "buyer", phone: input.phone, companyName: input.companyName, password: input.password, consentPolicyVersion: input.consentPolicyVersion });
}

export const POST = withApiPerf("POST api/auth/register/buyer", handlePOST);
