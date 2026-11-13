import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminApi } from "@/lib/auth/guards";
import { clean, fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { decide, getReview } from "@/lib/admin/productReview";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

/** The exact submitted snapshot. */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireAdminApi("products.review");
  if ("response" in guard) return guard.response;
  const d = await getReview((await params).reference);
  return d ? NextResponse.json({ ok: true, data: d }, { headers: NO_STORE }) : fail("Not found.", 404);
}

/** { decision: "APPROVE" | "REJECT", expectedRevision, reasonCode?, internalNote? }. The reviewer is the signed-in admin. */
export async function POST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("products.review");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-review-write:${guard.user.id}`, 60, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const b = await readSmallJson(request, 2_000);
  if (!b) return fail("Invalid or oversized request.", 413);
  const r = await decide(new ObjectId(guard.user.id), (await params).reference, {
    decision: b.decision === "APPROVE" ? "APPROVE" : b.decision === "REJECT" ? "REJECT" : ("" as never),
    expectedRevision: typeof b.expectedRevision === "number" ? b.expectedRevision : 0,
    reasonCode: clean(b.reasonCode, 40),
    internalNote: clean(b.internalNote, 500),
  });
  if (!r.ok) return NextResponse.json({ ok: false, message: r.message }, { status: r.status, headers: NO_STORE });
  return NextResponse.json({ ok: true, message: r.state === "APPROVED" ? "Approved." : "Rejected.", data: { state: r.state } }, { headers: NO_STORE });
}
