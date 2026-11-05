import { NextResponse } from "next/server";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { getCurrentUser } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { validateSupportRequest } from "@/lib/support/rules";
import { createSupportRequest } from "@/lib/support/service";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/support/requests: a Contact Us message to Finbyn Mart, from a guest or a signed-in account (the account, when
 * there is one, is read from the session only). Pipeline: small JSON body -> validation -> rate limits (well-formed requests
 * only: 5 per hour per address, 3 per hour per email) -> saved. The success message says the request was SAVED and that nobody
 * is emailed, because that is all that happens.
 */
async function handlePOST(request: Request) {
  const body = await readSmallJson(request, 6_000);
  if (!body) return fail("Send the message as JSON.", 400);

  const checked = validateSupportRequest(body);
  if (!checked.ok) return fail("Check the highlighted fields.", 400, checked.fields);
  const { value } = checked;

  const perAddress = await rateLimit(`support:${clientIp(request)}`, 5, 3600);
  if (!perAddress.ok) return tooMany(perAddress.retryAfterSeconds);
  const perEmail = await rateLimit(`support-email:${value.email}`, 3, 3600);
  if (!perEmail.ok) return tooMany(perEmail.retryAfterSeconds);

  try {
    const user = await getCurrentUser().catch(() => null);
    const saved = await createSupportRequest(value, user?.id);
    return NextResponse.json(
      {
        ok: true,
        message: "Your message was saved. Nobody is notified by email yet, so keep your reference number.",
        reference: saved.reference,
        duplicate: saved.duplicate,
        notified: false,
      },
      { status: saved.duplicate ? 200 : 201 },
    );
  } catch (error) {
    console.error("support request failed", error);
    return fail("We could not save your message right now. Please try again.", 503);
  }
}

export const POST = withApiPerf("POST api/support/requests", handlePOST);
