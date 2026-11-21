import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { ensureApproved } from "@/lib/catalog/approvedProducts";
import { formatPriceRange } from "@/lib/utils/format";
import { RECENT_CAP, RECENT_PAGE, encodeCursor, type Cursor } from "./rules";

/**
 * The buyer's recently viewed products (Page 32). One row per (buyer, canonical product key) in `recently_viewed`: the key is the SAME key the rest of the site uses
 * (`resolveProduct`: catalogue id, sample slug or approved supplier product `sp-<id>`), nothing else is stored (no name, price, URL, supplier, search term or contact detail).
 * Cards are built from the CURRENT public record, so a product that is no longer public never leaks details.
 *
 * Every query names the buyer from the verified session. Concurrency (no multi-document transaction is used or needed):
 *  - record: ONE upsert on the unique (userId, productKey) index with `$max: lastViewedAt`, so simultaneous views of one product make one row (a duplicate-key race is retried once) and a
 *    late-arriving older write can never move an entry backwards. The cap is enforced afterwards by deleting entries beyond RECENT_CAP in the newest-first order; two simultaneous trims delete
 *    the same rows (idempotent), and under heavy concurrency the history can briefly hold slightly more than RECENT_CAP until the next record trims it.
 *  - remove: deleteOne by (entry id, buyer): idempotent; removing an entry that is already gone is not an error.
 *  - clear: deleteMany by buyer. A view that is recorded while a clear runs may land before or after it, so a clear never promises to stop later recording.
 */
interface Doc { _id: ObjectId; userId: ObjectId; productKey: string; lastViewedAt: Date }

let indexReady: Promise<unknown> | undefined;
export async function recentCollection(): Promise<Collection<Doc>> {
  const col = (await getDb()).collection<Doc>("recently_viewed");
  indexReady ??= Promise.all([
    col.createIndex({ userId: 1, productKey: 1 }, { unique: true, name: "recent_per_buyer_product" }),
    col.createIndex({ userId: 1, lastViewedAt: -1, _id: -1 }, { name: "recent_newest" }),
  ]);
  await indexReady;
  return col;
}

export interface RecentItem {
  id: string;
  key: string;
  viewedAt: string;
  available: boolean;
  name: string | null;
  url: string | null;
  imageSrc: string | null;
  imageRemote: boolean;
  supplierName: string | null;
  location: string | null;
  /** null = "Price on request". */
  price: { text: string; unit: string; estimated: boolean } | null;
}
export interface RecentPage { items: RecentItem[]; nextCursor: string | null }

const uid = (userId: string) => new ObjectId(userId);

export async function recordView(userId: string, productKey: string, now = new Date()): Promise<void> {
  const col = await recentCollection();
  const filter = { userId: uid(userId), productKey };
  const op = { $max: { lastViewedAt: now }, $setOnInsert: { userId: uid(userId), productKey } };
  try { await col.updateOne(filter, op, { upsert: true }); }
  catch (error) { if ((error as { code?: number }).code !== 11000) throw error; await col.updateOne(filter, op, { upsert: true }); }
  const extra = await col.find({ userId: uid(userId) }, { projection: { _id: 1 } }).sort({ lastViewedAt: -1, _id: -1 }).skip(RECENT_CAP).limit(50).toArray();
  if (extra.length) await col.deleteMany({ userId: uid(userId), _id: { $in: extra.map((r) => r._id) } });
}

function toItem(row: Doc): RecentItem {
  const base = { id: row._id.toHexString(), key: row.productKey, viewedAt: row.lastViewedAt.toISOString() };
  const p = getPublicProductByKey(row.productKey);
  if (!p) return { ...base, available: false, name: null, url: null, imageSrc: null, imageRemote: false, supplierName: null, location: null, price: null };
  const image = p.images.find((i) => i.primary) ?? p.images[0];
  const priced = p.pricing.type !== "on_request" && Number.isFinite(p.pricing.min) && p.pricing.min > 0;
  return {
    ...base,
    available: true,
    name: p.name,
    url: p.url,
    imageSrc: image?.src ?? null,
    imageRemote: Boolean(image?.remote),
    supplierName: p.supplier.name,
    location: [p.supplier.city, p.supplier.state].filter(Boolean).join(", ") || null,
    price: priced ? { text: formatPriceRange(p.pricing.min, p.pricing.max), unit: p.pricing.unit, estimated: p.pricing.type === "estimated" } : null,
  };
}

/** One bounded query (limit + 1 rows) in the newest-first index order, then in-memory resolution of those keys only (no query per entry, never the whole history). */
export async function listRecent(userId: string, cursor: Cursor | null, limit = RECENT_PAGE): Promise<RecentPage> {
  await ensureApproved();
  const col = await recentCollection();
  const filter = cursor
    ? { userId: uid(userId), $or: [{ lastViewedAt: { $lt: new Date(cursor.ms) } }, { lastViewedAt: new Date(cursor.ms), _id: { $lt: new ObjectId(cursor.id) } }] }
    : { userId: uid(userId) };
  const rows = await col.find(filter).sort({ lastViewedAt: -1, _id: -1 }).limit(limit + 1).toArray();
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { items: page.map(toItem), nextCursor: rows.length > limit && last ? encodeCursor({ ms: last.lastViewedAt.getTime(), id: last._id.toHexString() }) : null };
}

export async function removeEntry(userId: string, entryId: string): Promise<void> {
  await (await recentCollection()).deleteOne({ _id: new ObjectId(entryId), userId: uid(userId) });
}

export async function clearHistory(userId: string): Promise<number> {
  return (await (await recentCollection()).deleteMany({ userId: uid(userId) })).deletedCount;
}
