import type { Collection, Document } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { REPORT_TIMEZONE, dayKeys, reportOf, type DayRow, type ReportKey } from "./reportRules";
import type { ReportRange } from "@/lib/supplier/analyticsRules";

/**
 * Admin Reports (Page 61): READ-ONLY database-side counts. One aggregation per report returns the per-day counts (grouped by the calendar day in Asia/Kolkata); the summary is the sum of exactly
 * those rows and the days are zero-filled afterwards, so the summary, the daily series and the breakdown can never disagree. No record, name, e-mail, phone, message or amount is read or
 * returned: only counts. A database failure throws (the route answers 503); it is never turned into zeros.
 * Consistency: each report is ONE aggregation, so its numbers are consistent with each other; across reports and between requests they are approximate while writes continue.
 */
let indexReady: Promise<unknown> | undefined;
async function ensureIndexes() {
  const db = await getDb();
  indexReady ??= Promise.all([
    db.collection("users").createIndex({ role: 1, createdAt: -1, _id: -1 }, { name: "buyers_admin_newest" }),
    db.collection("inquiries").createIndex({ createdAt: -1, _id: -1 }, { name: "admin_inquiries_newest" }),
    db.collection("quotations").createIndex({ version: 1, sentAt: 1 }, { name: "admin_reports_quotes_first" }),
    db.collection("orders").createIndex({ placedAt: 1 }, { name: "admin_reports_orders_placed" }),
  ]).catch((e) => { indexReady = undefined; throw e; });
  await indexReady;
}

const dayOf = (field: string): Document => ({ $dateToString: { format: "%Y-%m-%d", date: `$${field}`, timezone: REPORT_TIMEZONE } });

interface Source { collection: string; field: string; match: Document; cls?: Document }
function sourceOf(report: ReportKey): Source {
  switch (report) {
    case "buyers": return { collection: "users", field: "createdAt", match: { role: "buyer" } };
    case "suppliers": return { collection: "users", field: "createdAt", match: { role: "supplier" } };
    case "requirements": return {
      collection: "inquiries", field: "createdAt", match: {},
      cls: { $switch: { branches: [{ case: { $eq: ["$sourceType", "GENERAL_REQUIREMENT"] }, then: "general" }, { case: { $in: [{ $ifNull: ["$sourceType", null] }, [null, "DIRECT_INQUIRY"]] }, then: "direct" }], default: "unclassified" } },
    };
    case "quotations": return { collection: "quotations", field: "sentAt", match: { version: 1, status: { $ne: "DRAFT" } } };
    case "orders": return { collection: "orders", field: "placedAt", match: {} };
  }
}

export interface ReportResult {
  report: ReportKey;
  label: string;
  unit: string;
  dateBasis: string;
  definition: string;
  limitation: string;
  range: { from: string; to: string; timezone: string; days: number; bucket: "day" | "week" };
  generatedAt: string;
  columns: { key: string; label: string }[];
  summary: { total: number; [column: string]: number };
  rows: DayRow[];
  warnings: string[];
}

export async function runReport(report: ReportKey, range: ReportRange, now = new Date()): Promise<ReportResult> {
  const def = reportOf(report)!;
  await ensureIndexes();
  const src = sourceOf(report);
  const col = (await getDb()).collection(src.collection) as Collection<Document>;
  const range_ = { [src.field]: { $gte: range.start, $lt: range.end } };
  const groupId: Document = { day: dayOf(src.field), ...(src.cls ? { cls: src.cls } : {}) };
  const agg = await col.aggregate<{ _id: { day: string; cls?: string }; n: number }>([{ $match: { ...src.match, ...range_ } }, { $group: { _id: groupId, n: { $sum: 1 } } }]).toArray();

  const cols = def.columns.map((c) => c.key);
  const byDay = new Map<string, Record<string, number>>();
  for (const k of dayKeys(range.startDay, range.endDay)) byDay.set(k, Object.fromEntries(cols.map((c) => [c, 0])));
  for (const g of agg) {
    const row = byDay.get(g._id.day);
    if (!row) continue; // cannot happen: the match and the day grouping use the same zone and bounds
    row[src.cls ? (g._id.cls as string) : "count"] += g.n;
  }
  const rows: DayRow[] = [...byDay].map(([date, c]) => ({ date, ...c, total: cols.reduce((s, k) => s + c[k], 0) }));
  const summary: ReportResult["summary"] = { total: rows.reduce((s, r) => s + r.total, 0), ...Object.fromEntries(cols.map((k) => [k, rows.reduce((s, r) => s + (r[k] as number), 0)])) };
  const warnings: string[] = [];
  if (report === "requirements" && summary.unclassified > 0) warnings.push(`${summary.unclassified} inquiries have a source value that is neither Direct nor General Requirement and are shown as Unclassified.`);
  return { report, label: def.label, unit: def.unit, dateBasis: def.dateBasis, definition: def.definition, limitation: def.limitation, range: { from: range.startDay, to: range.endDay, timezone: REPORT_TIMEZONE, days: range.days, bucket: range.bucket }, generatedAt: now.toISOString(), columns: [...def.columns], summary, rows, warnings };
}
