import type { SupplierContext } from "./company";
import { inquiriesCollection } from "@/lib/inquiries/service";
import { ordersCollection } from "@/lib/orders/service";
import { quotationsCollection } from "@/lib/quotations/service";
import { UNCONFIRMED_ORDER_STATUSES } from "./dashboardRules";
import { METRICS_VERSION, REPORT_TIMEZONE, bucketKeys, type ReportRange } from "./analyticsRules";

export interface TrendPoint { bucket: string; inquiries: number; quotations: number; orders: number }
export interface TopProduct { name: string; orders: number; valueMinor: number }

export interface Report {
  version: string;
  timezone: string;
  range: { startDay: string; endDay: string; days: number; bucket: "day" | "week" };
  generatedAt: string;
  currencies: string[];
  currency: string | null;
  inquiries: number;
  quotations: number;
  orders: number;
  /** null when no confirmed order exists in the period (not zero). */
  orderValueMinor: number | null;
  trend: TrendPoint[];
  topProducts: TopProduct[];
  payments: { available: false; reason: string };
}

let indexReady: Promise<unknown> | undefined;

/** Every query is scoped to supplierKey ∈ the verified company's sellers and bounded by the half-open date range, and runs in the database. */
export async function buildReport(ctx: SupplierContext, r: ReportRange, currencyWanted: string | null): Promise<Report> {
  const keys = ctx.company.sellerKeys;
  const empty = (): Report => ({ version: METRICS_VERSION, timezone: REPORT_TIMEZONE, range: { startDay: r.startDay, endDay: r.endDay, days: r.days, bucket: r.bucket }, generatedAt: new Date().toISOString(), currencies: [], currency: null, inquiries: 0, quotations: 0, orders: 0, orderValueMinor: null, trend: bucketKeys(r).map((bucket) => ({ bucket, inquiries: 0, quotations: 0, orders: 0 })), topProducts: [], payments: { available: false, reason: "No verified payment source is connected, so payment analytics are unavailable." } });
  if (keys.length === 0) return empty();

  const [inqCol, qtCol, ordCol] = await Promise.all([inquiriesCollection(), quotationsCollection(), ordersCollection()]);
  // quotations (supplierKey, version, sentAt) and orders (supplierKey, placedAt) are indexed by the dashboard; inquiries need this range index
  indexReady ??= inqCol.createIndex({ supplierKey: 1, createdAt: -1 }, { name: "supplier_received_range" });
  await indexReady;
  const bucketOf = (field: string) => ({ $dateTrunc: { date: field, unit: r.bucket, timezone: REPORT_TIMEZONE, startOfWeek: "monday" } });
  const fmt = (d: unknown) => (d instanceof Date ? new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) : "");
  const group = (field: string) => [{ $group: { _id: bucketOf(field), n: { $sum: 1 } } }];

  const inqMatch = { supplierKey: { $in: keys }, createdAt: { $gte: r.start, $lt: r.end } };
  const qtMatch = { supplierKey: { $in: keys }, version: 1, sentAt: { $gte: r.start, $lt: r.end } };
  const ordMatch = { supplierKey: { $in: keys }, status: { $nin: [...UNCONFIRMED_ORDER_STATUSES] }, placedAt: { $gte: r.start, $lt: r.end } };

  const [inqB, qtB, ordB, cur] = await Promise.all([
    inqCol.aggregate<{ _id: Date; n: number }>([{ $match: inqMatch as never }, ...group("$createdAt")]).toArray(),
    qtCol.aggregate<{ _id: Date; n: number }>([{ $match: qtMatch as never }, ...group("$sentAt")]).toArray(),
    ordCol.aggregate<{ _id: Date; n: number }>([{ $match: ordMatch as never }, ...group("$placedAt")]).toArray(),
    ordCol.aggregate<{ _id: string; n: number; total: number }>([{ $match: ordMatch as never }, { $group: { _id: "$currency", n: { $sum: 1 }, total: { $sum: "$totalMinor" } } }, { $sort: { _id: 1 } }]).toArray(),
  ]);

  const currencies = cur.map((c) => c._id).filter(Boolean);
  const currency = currencyWanted && currencies.includes(currencyWanted) ? currencyWanted : (currencies[0] ?? null);
  const point = new Map<string, TrendPoint>(bucketKeys(r).map((b) => [b, { bucket: b, inquiries: 0, quotations: 0, orders: 0 }]));
  for (const [rows, k] of [[inqB, "inquiries"], [qtB, "quotations"], [ordB, "orders"]] as const) {
    for (const row of rows) {
      const p = point.get(fmt(row._id));
      if (p) p[k] += row.n;
    }
  }

  let topProducts: TopProduct[] = [];
  if (currency) {
    const rows = await ordCol
      .aggregate<{ _id: string; name: string; orders: number; value: unknown }>([
        { $match: { ...ordMatch, currency } as never },
        { $unwind: "$items" },
        { $group: { _id: { $ifNull: ["$items.productKey", "$items.name"] }, name: { $first: "$items.name" }, orderIds: { $addToSet: "$_id" }, value: { $sum: { $multiply: [{ $toDecimal: "$items.quantity" }, { $toDecimal: "$items.unitPriceMinor" }] } } } },
        { $project: { name: 1, orders: { $size: "$orderIds" }, value: { $toString: { $round: ["$value", 0] } } } },
        { $sort: { value: -1 } },
        { $limit: 10 },
      ])
      .toArray();
    topProducts = rows.map((x) => ({ name: x.name, orders: x.orders, valueMinor: Number(x.value) })).sort((a, b) => b.valueMinor - a.valueMinor);
  }

  const total = (rows: { n: number }[]) => rows.reduce((s, x) => s + x.n, 0);
  return {
    ...empty(),
    currencies,
    currency,
    inquiries: total(inqB),
    quotations: total(qtB),
    orders: total(cur),
    orderValueMinor: currency ? (cur.find((c) => c._id === currency)?.total ?? null) : null,
    trend: [...point.values()],
    topProducts,
  };
}

