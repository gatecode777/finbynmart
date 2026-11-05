import { fail, readSmallJson } from "@/lib/auth/http";
import { buyerGuard, conflictResponse, json } from "@/lib/buyer/api";
import { createBuyerCompany, getBuyerCompany, updateBuyerCompany } from "@/lib/buyer/profile";
import { validateCompany } from "@/lib/buyer/profileRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** The buyer's own company (they are its single owner). `company: null` means none has been added yet. */
async function handleGET() {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  return json({ ok: true, data: { company: await getBuyerCompany(guard.user.id) } });
}

/** POST creates the company. One per buyer; a name already held by another company is refused (it cannot be claimed here). */
async function handlePOST(request: Request) {
  const guard = await buyerGuard({ key: "buyer-company-write", limit: 20, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 6_000);
  if (!body) return fail("Invalid request.");
  const checked = validateCompany(body, "create");
  if (!checked.ok) return json({ ok: false, message: "Check the highlighted fields.", fields: checked.fields }, 400);
  const result = await createBuyerCompany(guard.user.id, checked.value);
  if (!result.ok) return conflictResponse(result.code);
  return json({ ok: true, message: "Your company was saved.", data: { company: result.company } }, 201);
}

/** PATCH updates the buyer's own company (never an id from the request). `version` guards against a stale form. */
async function handlePATCH(request: Request) {
  const guard = await buyerGuard({ key: "buyer-company-write", limit: 20, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 6_000);
  if (!body) return fail("Invalid request.");
  const checked = validateCompany(body, "update");
  if (!checked.ok) return json({ ok: false, message: "Check the highlighted fields.", fields: checked.fields }, 400);
  const result = await updateBuyerCompany(guard.user.id, checked.value, checked.version as number);
  if (!result.ok) return conflictResponse(result.code);
  return json({ ok: true, message: "Your company details were saved.", data: { company: result.company } });
}

export const GET = withApiPerf("GET api/buyer/company", handleGET);
export const POST = withApiPerf("POST api/buyer/company", handlePOST);
export const PATCH = withApiPerf("PATCH api/buyer/company", handlePATCH);
