import { fail, readSmallJson } from "@/lib/auth/http";
import { addressFailure, buyerGuard, json } from "@/lib/buyer/api";
import { listAddresses, setDefaultAddress } from "@/lib/buyer/addresses";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * PATCH { type: "BILLING" | "DELIVERY" }: makes this address the buyer's default of that kind. The two defaults are independent;
 * the address needs the matching purpose; the previous default is cleared in the same transaction. The answer is the confirmed,
 * updated address list, so the page shows a default only after the database holds it.
 */
async function handlePATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await buyerGuard({ key: "buyer-address-write", limit: 60, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 500);
  if (!body) return fail("Invalid request.");
  if (body.type !== "BILLING" && body.type !== "DELIVERY") return json({ ok: false, message: "type must be BILLING or DELIVERY.", fields: { type: "Choose BILLING or DELIVERY." } }, 400);
  const result = await setDefaultAddress(guard.user.id, (await params).id, body.type);
  if (!result.ok) return addressFailure(result.code);
  const list = await listAddresses(guard.user.id, { type: "all", q: "", page: 1, limit: 50 });
  return json({ ok: true, message: body.type === "BILLING" ? "Default billing address updated." : "Default delivery address updated.", data: { address: result.address, ...list } });
}

export const PATCH = withApiPerf("PATCH api/buyer/addresses/id/default", handlePATCH);
