import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminApi } from "@/lib/auth/guards";
import { clean, fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { linkSeller, searchCompanies } from "@/lib/admin/sellerMapping";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

/** Companies by business name (bounded, 20 per page). Capability sellers.map. */
export async function GET(request: Request) {
  const guard = await requireAdminApi("sellers.map");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-links-read:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const sp = new URL(request.url).searchParams;
  const data = await searchCompanies(sp.get("q") ?? "", Number(sp.get("page")) || 1);
  return NextResponse.json({ ok: true, data }, { headers: NO_STORE });
}

/** { companyId, sellerKey, reason, acknowledgeHistory }. The admin is the signed-in one; exclusivity and the audit row are enforced in the service. */
export async function POST(request: Request) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("sellers.map");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-links-write:${guard.user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const b = await readSmallJson(request, 2_000);
  if (!b) return fail("Invalid or oversized request.", 413);
  const r = await linkSeller(new ObjectId(guard.user.id), {
    companyId: clean(b.companyId, 30),
    sellerKey: clean(b.sellerKey, 90),
    reason: clean(b.reason, 400),
    acknowledgeHistory: b.acknowledgeHistory === true,
  });
  if (!r.ok) return NextResponse.json({ ok: false, message: r.message, fields: r.fields }, { status: r.status, headers: NO_STORE });
  return NextResponse.json({ ok: true, message: r.replayed ? "Already linked." : "Seller linked.", data: { sellerKeys: r.sellerKeys } }, { status: r.replayed ? 200 : 201, headers: NO_STORE });
}
