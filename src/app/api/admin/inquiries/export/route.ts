import { requireAdminApi } from "@/lib/auth/guards";
import { clean, fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { exportAdminInquiries } from "@/lib/admin/inquiryService";
import { ADMIN_EXPORT_MAX, GROUP_KEYS, type AdminStatusGroup } from "@/lib/admin/inquiryRules";
import { parseRange } from "@/lib/supplier/analyticsRules";
import { csvCell } from "@/lib/supplier/quotationRules";

export const dynamic = "force-dynamic";

/** Scoped CSV of the same filters: reference, status, buyer display name, requirement, quantity, supplier, received. At most 5,000 rows, no message text or contact data. */
export async function POST(request: Request) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("inquiries.export");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-inquiries-export:${guard.user.id}`, 10, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const b = await readSmallJson(request, 1_000);
  if (!b) return fail("Invalid request.", 413);
  const parsed = parseRange(clean(b.start, 10), clean(b.end, 10));
  if (!parsed.ok) return fail(parsed.message, 422);
  const group = GROUP_KEYS.includes(clean(b.group, 12)) ? (clean(b.group, 12) as AdminStatusGroup) : "all";
  const { rows, truncated } = await exportAdminInquiries({ q: clean(b.q, 60), group, range: parsed.range }, ADMIN_EXPORT_MAX);

  const head = ["Reference", "Status", "Buyer", "Requirement", "Quantity", "Supplier", "Received (UTC)"];
  const lines = [head, ...rows.map((r) => [r.reference, r.statusLabel, r.buyer, r.requirement, r.quantityText, r.supplier, r.receivedAt])];
  const csv = lines.map((row) => row.map((c) => csvCell(c)).join(",")).join("\r\n");
  console.info("admin_inquiries_exported", { rows: rows.length, truncated, days: parsed.range.days });
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="inquiries-${parsed.range.startDay}_${parsed.range.endDay}.csv"`, "X-Export-Rows": String(rows.length), "X-Export-Truncated": String(truncated), "Cache-Control": "private, no-store" },
  });
}
