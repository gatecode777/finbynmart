import { ObjectId } from "mongodb";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { getDb } from "@/lib/db/mongo";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { parseQuery, statusLabel, toParams } from "@/lib/admin/productList";
import { exportProducts, PRODUCT_EXPORT_MAX } from "@/lib/admin/productManagement";
import { csvCell } from "@/lib/supplier/quotationRules";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/products/export { q, status, category, supplier, sort }: CSV of the same filters and scope as the list (capabilities products.export AND products.read). At most 5,000 rows built in
 * the response (X-Export-Truncated says when more exist), formula-safe cells, no drafts, no internal notes, no contacts. Currency and unit are explicit columns. The export is audited by counts and filter names.
 */
export async function POST(request: Request) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("products.export");
  if ("response" in guard) return guard.response;
  if (!guard.permissions.includes("products.read")) return forbiddenResponse();
  const limit = await rateLimit(`admin-products-export:${guard.user.id}`, 10, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const b = await readSmallJson(request, 1_000);
  if (!b) return fail("Invalid or oversized request.", 413);
  try {
    const sp = new URLSearchParams();
    for (const k of ["q", "status", "category", "supplier", "sort"]) if (typeof b[k] === "string") sp.set(k, b[k] as string);
    const q = parseQuery(sp);
    const { rows, truncated } = await exportProducts(q, { unpublish: false, review: false });
    const head = ["Reference", "SKU", "Product", "Supplier", "Category", "Currency", "Price and unit", "Minimum order", "Listing status", "Pending changes", "Updated (UTC)"];
    const lines = [head, ...rows.map((r) => [r.reference, r.sku ?? "", r.name, r.company, r.category, r.priceText && r.priceText !== "Price on request" ? "INR" : "", r.priceText ?? "", r.moqText ?? "", statusLabel(r.status), r.pendingChanges ? "Yes" : "No", r.updatedAt])];
    const csv = lines.map((row) => row.map((c) => csvCell(c)).join(",")).join("\r\n");
    await (await getDb()).collection("admin_audit_log").insertOne({ _id: new ObjectId(), action: "PRODUCTS_EXPORTED", actorId: new ObjectId(guard.user.id), rows: rows.length, truncated, filters: [...toParams(q).keys()], at: new Date() });
    return new Response("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="products.csv"', "X-Export-Rows": String(rows.length), "X-Export-Truncated": String(truncated), "X-Export-Cap": String(PRODUCT_EXPORT_MAX), "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("admin products export failed", (error as Error).message);
    return fail("The export could not be created. Please try again.", 503);
  }
}
