import { ObjectId } from "mongodb";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { getDb } from "@/lib/db/mongo";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { exportAdminInquiries } from "@/lib/admin/inquiryService";
import { ADMIN_EXPORT_MAX } from "@/lib/admin/inquiryRules";
import { parseQueryParams } from "@/lib/admin/inquiryApi";
import { csvCell } from "@/lib/supplier/quotationRules";

export const dynamic = "force-dynamic";

/**
 * Scoped CSV of the SAME filters as the list (search, source, status group, distribution, dates). Needs inquiries.export AND inquiries.read (an account that may not see the list may not
 * export it). Columns: reference, source, status, buyer display name, requirement, quantity, selected supplier, recipient companies, distribution state, received. At most 5,000 rows built in
 * the response (no stored file), formula-safe cells, no message text, no contact data. Each export is recorded in the admin audit log by counts and filter names, never by content.
 */
export async function POST(request: Request) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("inquiries.export");
  if ("response" in guard) return guard.response;
  if (!guard.permissions.includes("inquiries.read")) return forbiddenResponse();
  const limit = await rateLimit(`admin-inquiries-export:${guard.user.id}`, 10, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const b = await readSmallJson(request, 1_000);
  if (!b) return fail("Invalid request.", 413);
  const parsed = parseQueryParams((k) => (typeof b[k] === "string" ? (b[k] as string) : null));
  if (!parsed.ok) return fail(parsed.message, 422);
  try {
    const { rows, truncated } = await exportAdminInquiries(parsed.query, ADMIN_EXPORT_MAX);
    const head = ["Reference", "Source", "Status", "Buyer", "Requirement", "Quantity", "Selected supplier", "Recipient companies", "Distribution", "Received (UTC)"];
    const lines = [head, ...rows.map((r) => [r.reference, r.sourceLabel, r.statusLabel, r.buyer, r.requirement, r.quantityText, r.selectedSupplier ?? "", String(r.recipients.total), r.distribution.label, r.receivedAt])];
    const csv = lines.map((row) => row.map((c) => csvCell(c)).join(",")).join("\r\n");
    const { range } = parsed.query;
    await (await getDb()).collection("admin_audit_log").insertOne({ _id: new ObjectId(), action: "INQUIRIES_EXPORTED", actorId: new ObjectId(guard.user.id), rows: rows.length, truncated, filters: ["source", "group", "dist", "q"].filter((k) => typeof b[k] === "string" && b[k] !== "" && b[k] !== "all"), days: range.days, at: new Date() });
    return new Response("﻿" + csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="inquiries-${range.startDay}_${range.endDay}.csv"`, "X-Export-Rows": String(rows.length), "X-Export-Truncated": String(truncated), "X-Export-Cap": String(ADMIN_EXPORT_MAX), "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("admin inquiries export failed", (error as Error).message);
    return fail("The export could not be created. Please try again.", 503);
  }
}
