import { requireSupplierApi, forbiddenResponse } from "@/lib/auth/guards";
import { clean, fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { buildReport } from "@/lib/supplier/analyticsService";
import { METRIC_DEFINITIONS, formatMinor, parseRange } from "@/lib/supplier/analyticsRules";
import { csvCell } from "@/lib/supplier/quotationRules";

export const dynamic = "force-dynamic";

/** CSV of exactly the page's report (same range, currency and definitions), with metadata. Bounded: at most 366 days of buckets and 10 products. */
export async function POST(request: Request) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  if (!guard.context.permissions.viewAnalytics) return forbiddenResponse();
  const limit = await rateLimit(`supplier-analytics-export:${guard.user.id}`, 10, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const b = await readSmallJson(request, 1_000);
  if (!b) return fail("Invalid request.", 413);
  const parsed = parseRange(clean(b.start, 10), clean(b.end, 10));
  if (!parsed.ok) return fail(parsed.message, 422);
  const r = await buildReport(guard.context, parsed.range, clean(b.currency, 3).toUpperCase() || null);

  const rows: (string | number)[][] = [
    ["Finbyn Mart supplier report"],
    ["Generated at (UTC)", r.generatedAt],
    ["Timezone", r.timezone],
    ["Date range (inclusive days)", `${r.range.startDay} to ${r.range.endDay}`],
    ["Currency filter (financial rows only)", r.currency ?? "none"],
    ["Definitions version", r.version],
    ["Note", "All sections are read at the generated-at time; they are separate queries, not one atomic snapshot."],
    [],
    ["Metric", "Value", "Date basis"],
    ...METRIC_DEFINITIONS.filter((d) => ["inquiries", "quotations", "orders"].includes(d.key)).map((d) => [d.label, { inquiries: r.inquiries, quotations: r.quotations, orders: r.orders }[d.key as "inquiries"], d.dateBasis]),
    ["Confirmed order value", r.orderValueMinor === null ? "Unavailable (no confirmed orders)" : formatMinor(r.orderValueMinor, r.currency!), "Order date (placedAt); order value, not payment received"],
    ["Payment received", "Unavailable (no verified payment source)", ""],
    [],
    [`Trend (${r.range.bucket} buckets starting)`, "Inquiries", "Quotations", "Orders"],
    ...r.trend.map((p) => [p.bucket, p.inquiries, p.quotations, p.orders]),
    [],
    ["Top products by confirmed order value", "Orders containing it", "Value"],
    ...r.topProducts.map((p) => [p.name, p.orders, r.currency ? formatMinor(p.valueMinor, r.currency) : ""]),
  ];
  const csv = rows.map((row) => row.map((c) => csvCell(c as string | number)).join(",")).join("\r\n");
  console.info("supplier_analytics_exported", { rows: rows.length, range: r.range.days });
  return new Response("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="finbyn-report-${r.range.startDay}_${r.range.endDay}.csv"`, "Cache-Control": "private, no-store" } });
}
