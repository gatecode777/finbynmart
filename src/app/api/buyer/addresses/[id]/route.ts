import { fail, readSmallJson } from "@/lib/auth/http";
import { addressFailure, buyerGuard, json } from "@/lib/buyer/api";
import { deleteAddress, getAddress, updateAddress } from "@/lib/buyer/addresses";
import { validateAddress } from "@/lib/buyer/addressRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** One of the signed-in buyer's addresses. Someone else's id and an unknown id answer the same 404. */
async function handleGET(_request: Request, { params }: Ctx) {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  const address = await getAddress(guard.user.id, (await params).id);
  return address ? json({ ok: true, data: { address } }) : addressFailure("NOT_FOUND");
}

/** PATCH updates the buyer's own address with the `version` the form loaded (a stale one is a 409). A default is kept unless changed or its purpose is removed. */
async function handlePATCH(request: Request, { params }: Ctx) {
  const guard = await buyerGuard({ key: "buyer-address-write", limit: 60, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 4_000);
  if (!body) return fail("Invalid request.");
  const checked = validateAddress(body, "update");
  if (!checked.ok) return json({ ok: false, message: "Check the highlighted fields.", fields: checked.fields }, 400);
  const result = await updateAddress(guard.user.id, (await params).id, checked.value);
  if (!result.ok) return addressFailure(result.code);
  return json({ ok: true, message: result.clearedDefaults.length ? `The address was saved. It is no longer your default ${result.clearedDefaults.join(" and ").toLowerCase()} address because that purpose was removed.` : "The address was saved.", data: { address: result.address, clearedDefaults: result.clearedDefaults } });
}

async function handleDELETE(_request: Request, { params }: Ctx) {
  const guard = await buyerGuard({ key: "buyer-address-write", limit: 60, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const result = await deleteAddress(guard.user.id, (await params).id);
  if (!result.ok) return addressFailure(result.code);
  return json({ ok: true, message: result.clearedDefaults.length ? "The address was removed. You no longer have a default " + result.clearedDefaults.join(" or ").toLowerCase() + " address: choose another." : "The address was removed.", data: { clearedDefaults: result.clearedDefaults } });
}

export const GET = withApiPerf("GET api/buyer/addresses/id", handleGET);
export const PATCH = withApiPerf("PATCH api/buyer/addresses/id", handlePATCH);
export const DELETE = withApiPerf("DELETE api/buyer/addresses/id", handleDELETE);
