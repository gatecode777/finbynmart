import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSupplierApi, forbiddenResponse } from "@/lib/auth/guards";
import { clean, cleanMultiline, fail, numberText, readSmallJson, tooMany } from "@/lib/auth/http";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { recordAdjustment } from "@/lib/supplier/inventoryService";
import type { AdjustInput, AdjustKind } from "@/lib/supplier/inventoryRules";

export const dynamic = "force-dynamic";

/** Idempotent, validated stock adjustment. Field allow-list: nothing about company, actor, balance or revision is read from the body. */
export async function POST(request: Request) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  if (!guard.context.permissions.manageProducts) return forbiddenResponse();

  const limit = await rateLimit(`supplier-inventory-adjust:${guard.user.id}`, 60, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const b = await readSmallJson(request, 4_000);
  if (!b) return fail("Invalid or oversized request.", 413);
  const key = clean(b.idempotencyKey, 80);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(key)) return fail("A valid idempotencyKey is required.", 422);

  const input: AdjustInput = {
    productRef: clean(b.productRef, 60),
    kind: clean(b.kind, 20) as AdjustKind,
    quantity: numberText(b.quantity, 20),
    reason: clean(b.reason, 30),
    note: cleanMultiline(b.note, 400),
    reorderLevel: numberText(b.reorderLevel, 20),
  };
  const r = await recordAdjustment(guard.context, new ObjectId(guard.user.id), input, key);
  if (!r.ok) return NextResponse.json({ ok: false, message: r.message, fields: r.fields }, { status: r.status });
  return NextResponse.json({ ok: true, message: r.replayed ? "Already recorded." : "Adjustment recorded.", data: { row: r.row, movement: r.movement } }, { status: r.replayed ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
}
