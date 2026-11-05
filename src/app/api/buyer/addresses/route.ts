import { fail, readSmallJson } from "@/lib/auth/http";
import { addressFailure, buyerGuard, json } from "@/lib/buyer/api";
import { createAddress, listAddresses } from "@/lib/buyer/addresses";
import { parseAddressQuery, validateAddress } from "@/lib/buyer/addressRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/addresses?type=all|delivery|billing|business&q=...&page=&limit=
 * The signed-in buyer's own addresses (never an id from the request), bounded (at most 50 a page, 50 in total), with the
 * statistics of the whole address book. A buyerId parameter is never read.
 */
async function handleGET(request: Request) {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  const params = new URL(request.url).searchParams;
  const query = parseAddressQuery({ type: params.get("type") ?? undefined, q: params.get("q") ?? undefined, page: params.get("page") ?? undefined, limit: params.get("limit") ?? undefined });
  if (!query.ok) return fail(query.error, 400, { query: query.error });
  return json({ ok: true, data: await listAddresses(guard.user.id, query.value) });
}

/** POST creates an address for the signed-in buyer. The owner, company link and timestamps are decided by the server. */
async function handlePOST(request: Request) {
  const guard = await buyerGuard({ key: "buyer-address-write", limit: 60, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 4_000);
  if (!body) return fail("Invalid request.");
  const checked = validateAddress(body, "create");
  if (!checked.ok) return json({ ok: false, message: "Check the highlighted fields.", fields: checked.fields }, 400);
  const result = await createAddress(guard.user.id, checked.value);
  if (!result.ok) return addressFailure(result.code);
  return json({ ok: true, message: "The address was saved.", data: { address: result.address } }, 201);
}

export const GET = withApiPerf("GET api/buyer/addresses", handleGET);
export const POST = withApiPerf("POST api/buyer/addresses", handlePOST);
