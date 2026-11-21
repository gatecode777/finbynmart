import { ObjectId } from "mongodb";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { getDb } from "@/lib/db/mongo";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { exportCompanies } from "@/lib/admin/supplierManagement";
import { supplierCapsOf } from "@/lib/admin/supplierApi";
import { EXPORT_MAX, toListParams, validateListState } from "@/lib/admin/supplierRules";
import { csvCell } from "@/lib/supplier/quotationRules";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/suppliers/export: CSV of the SAME filters and scope as the list. Needs suppliers.export AND suppliers.read. Columns: reference, company name, business type, city, status, linked
 * catalogue sellers (count), updated. No e-mail, phone, address or document. At most 5,000 rows built in the response (no stored file), formula-safe cells, audited by counts and filter names.
 */
export async function POST(request: Request) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("suppliers.export");
  if ("response" in guard) return guard.response;
  if (!guard.permissions.includes("suppliers.read")) return forbiddenResponse();
  const limit = await rateLimit(`admin-suppliers-export:${guard.user.id}`, 10, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const b = await readSmallJson(request, 1_000);
  if (!b) return fail("Invalid request.", 413);
  const v = validateListState((k) => (typeof b[k] === "string" ? (b[k] as string) : null));
  if (!v.ok) return fail("Check the filters.", 422);
  try {
    const { rows, truncated } = await exportCompanies(v.state, supplierCapsOf(guard.permissions), EXPORT_MAX);
    const head = ["Reference", "Company", "Business type", "City", "Status", "Linked catalogue sellers", "Updated (UTC)"];
    const lines = [head, ...rows.map((r) => [r.code, r.name, r.businessType ?? "", r.city ?? "", r.statusLabel, String(r.linkedSellers), r.updatedAt])];
    const csv = lines.map((row) => row.map((c) => csvCell(c)).join(",")).join("\r\n");
    await (await getDb()).collection("admin_audit_log").insertOne({ _id: new ObjectId(), action: "SUPPLIERS_EXPORTED", actorId: new ObjectId(guard.user.id), rows: rows.length, truncated, filters: [...toListParams({ ...v.state, page: 1 }).keys()], at: new Date() });
    return new Response("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="suppliers.csv"', "X-Export-Rows": String(rows.length), "X-Export-Truncated": String(truncated), "X-Export-Cap": String(EXPORT_MAX), "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("admin suppliers export failed", (error as Error).message);
    return fail("The export could not be created. Please try again.", 503);
  }
}
