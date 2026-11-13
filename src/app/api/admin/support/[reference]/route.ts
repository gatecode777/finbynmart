import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminApi } from "@/lib/auth/guards";
import { clean, cleanMultiline, fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { getStaffTicket, staffAct } from "@/lib/admin/supportStaff";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireAdminApi("support.manage");
  if ("response" in guard) return guard.response;
  const t = await getStaffTicket((await params).reference);
  return t ? NextResponse.json({ ok: true, data: t }, { headers: NO_STORE }) : fail("Ticket not found.", 404);
}

/** { kind: "reply" | "note", message, idempotencyKey, nextStatus? }. The staff member is the signed-in admin; any sender, visibility or ticket field in the body is ignored. */
export async function POST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("support.manage");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-support-write:${guard.user.id}`, 60, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const b = await readSmallJson(request, 4_000);
  if (!b) return fail("Invalid or oversized request.", 413);
  if (b.kind !== "reply" && b.kind !== "note") return fail("kind must be reply or note.", 422);
  const r = await staffAct(new ObjectId(guard.user.id), (await params).reference, { kind: b.kind, message: cleanMultiline(b.message, 2500), idempotencyKey: clean(b.idempotencyKey, 90), nextStatus: clean(b.nextStatus, 30) || undefined });
  if (!r.ok) return NextResponse.json({ ok: false, message: r.message }, { status: r.status, headers: NO_STORE });
  return NextResponse.json({ ok: true, message: r.duplicate ? "Already recorded." : b.kind === "reply" ? "Reply sent to the ticket owner." : "Internal note saved.", data: { status: r.status } }, { status: r.duplicate ? 200 : 201, headers: NO_STORE });
}
