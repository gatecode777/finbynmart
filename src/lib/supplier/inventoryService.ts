import { createHash } from "node:crypto";
import { ObjectId, type Collection } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import type { SupplierContext } from "./company";
import { collectSupplierProducts, type SupplierProductItem } from "./productService";
import { movementEffect, parseQtyMilli, stockStatus, validateAdjust, type AdjustErrors, type AdjustInput, type AdjustKind, type StockStatus } from "./inventoryRules";

/** Stock position: one per company + product. Quantities are integer thousandths of the product's own unit. */
export interface PositionDoc {
  _id: ObjectId;
  companyId: ObjectId;
  productRef: string;
  sku: string;
  name: string;
  searchKey: string;
  unit: string;
  onHandMilli: number;
  reorderMilli: number | null;
  status: StockStatus;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Append-only ledger. Never edited or deleted; a mistake is corrected by a new ADD/REMOVE entry. */
export interface MovementDoc {
  _id: ObjectId;
  companyId: ObjectId;
  positionId: ObjectId;
  productRef: string;
  sku: string;
  name: string;
  unit: string;
  type: AdjustKind;
  deltaMilli: number;
  resultMilli: number;
  reason: string;
  note: string;
  actorId: ObjectId;
  idempotencyKey: string;
  bodyHash: string;
  createdAt: Date;
}

let ready: Promise<unknown> | undefined;
async function stores(): Promise<{ positions: Collection<PositionDoc>; movements: Collection<MovementDoc> }> {
  const db = await getDb();
  const positions = db.collection<PositionDoc>("inventory_positions");
  const movements = db.collection<MovementDoc>("inventory_movements");
  ready ??= Promise.all([
    positions.createIndex({ companyId: 1, productRef: 1 }, { unique: true, name: "inv_position_identity" }),
    positions.createIndex({ companyId: 1, status: 1, updatedAt: -1, _id: -1 }, { name: "inv_position_status" }),
    movements.createIndex({ companyId: 1, createdAt: -1, _id: -1 }, { name: "inv_movement_newest" }),
    movements.createIndex({ companyId: 1, actorId: 1, idempotencyKey: 1 }, { unique: true, name: "inv_movement_idem" }),
  ]);
  await ready;
  return { positions, movements };
}

export interface InventoryRow {
  productRef: string;
  sku: string;
  name: string;
  categoryName: string;
  unit: string;
  imageUrl: string;
  /** null when the product has no position (UNTRACKED, which is not zero). */
  onHandMilli: number | null;
  reorderMilli: number | null;
  status: StockStatus | "UNTRACKED";
  revision: number;
  updatedAt: string | null;
}

export interface InventorySummary {
  tracked: number;
  lowStock: number;
  outOfStock: number;
  untracked: number;
}

export interface InventoryResult {
  items: InventoryRow[];
  summary: InventorySummary;
  meta: { page: number; limit: number; totalCount: number; totalPages: number };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function rowOf(p: SupplierProductItem, pos?: PositionDoc | null): InventoryRow {
  return {
    productRef: p.id,
    sku: p.sku,
    name: p.name,
    categoryName: p.categoryName,
    unit: p.unit || "piece",
    imageUrl: p.imageUrl,
    onHandMilli: pos ? pos.onHandMilli : null,
    reorderMilli: pos ? pos.reorderMilli : null,
    status: pos ? pos.status : "UNTRACKED",
    revision: pos?.revision ?? 0,
    updatedAt: pos ? pos.updatedAt.toISOString() : null,
  };
}

export async function getInventory(ctx: SupplierContext, q: { q?: string; status?: string; page?: number; limit?: number }): Promise<InventoryResult> {
  const { positions } = await stores();
  const products = await collectSupplierProducts(ctx);
  const byRef = new Map(products.map((p) => [p.id, p]));
  const term = (q.q ?? "").trim().toLowerCase().slice(0, 80);
  const page = Math.max(1, Math.min(1000, Math.floor(q.page ?? 1)));
  const limit = Math.min(50, Math.max(1, Math.floor(q.limit ?? 20)));

  // counts come from the database, scoped by the search only; the status filter does not change them
  const base: Record<string, unknown> = { companyId: ctx.companyId };
  if (term) base.searchKey = { $regex: escapeRe(term) };
  const grouped = await positions.aggregate<{ _id: StockStatus; n: number }>([{ $match: base }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray();
  const n = (s: StockStatus) => grouped.find((g) => g._id === s)?.n ?? 0;
  const matchingProducts = term ? products.filter((p) => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)) : products;
  const summary: InventorySummary = {
    tracked: n("IN_STOCK") + n("LOW_STOCK") + n("OUT_OF_STOCK"),
    lowStock: n("LOW_STOCK"),
    outOfStock: n("OUT_OF_STOCK"),
    untracked: Math.max(0, matchingProducts.length - (n("IN_STOCK") + n("LOW_STOCK") + n("OUT_OF_STOCK"))),
  };

  const status = q.status ?? "all";
  let items: InventoryRow[];
  let totalCount: number;
  if (status === "IN_STOCK" || status === "LOW_STOCK" || status === "OUT_OF_STOCK") {
    totalCount = n(status);
    const docs = await positions.find({ ...base, status }).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray();
    items = docs.map((d) => rowOf(byRef.get(d.productRef) ?? { id: d.productRef, sku: d.sku, name: d.name, categoryName: "", unit: d.unit, imageUrl: "" } as SupplierProductItem, d));
  } else {
    // "all" and "untracked" page over the company's own products, then batch-read just that page's positions
    let list = matchingProducts.slice().sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (status === "untracked") {
      const have = new Set((await positions.find({ companyId: ctx.companyId }, { projection: { productRef: 1 } }).toArray()).map((d) => d.productRef));
      list = list.filter((p) => !have.has(p.id));
    }
    totalCount = list.length;
    const slice = list.slice((page - 1) * limit, page * limit);
    const docs = await positions.find({ companyId: ctx.companyId, productRef: { $in: slice.map((p) => p.id) } }).toArray();
    const map = new Map(docs.map((d) => [d.productRef, d]));
    items = slice.map((p) => rowOf(p, map.get(p.id)));
  }
  return { items, summary, meta: { page, limit, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / limit)) } };
}

export interface MovementRow {
  id: string;
  productRef: string;
  sku: string;
  name: string;
  unit: string;
  type: AdjustKind;
  deltaMilli: number;
  resultMilli: number;
  reason: string;
  note: string;
  createdAt: string;
}

const movementRow = (m: MovementDoc): MovementRow => ({ id: m._id.toHexString(), productRef: m.productRef, sku: m.sku, name: m.name, unit: m.unit, type: m.type, deltaMilli: m.deltaMilli, resultMilli: m.resultMilli, reason: m.reason, note: m.note, createdAt: m.createdAt.toISOString() });

export async function getMovements(ctx: SupplierContext, q: { page?: number; limit?: number }) {
  const { movements } = await stores();
  const page = Math.max(1, Math.min(1000, Math.floor(q.page ?? 1)));
  const limit = Math.min(50, Math.max(1, Math.floor(q.limit ?? 20)));
  const [docs, total] = await Promise.all([
    movements.find({ companyId: ctx.companyId }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
    movements.countDocuments({ companyId: ctx.companyId }),
  ]);
  return { items: docs.map(movementRow), meta: { page, limit, totalCount: total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

export type AdjustResult =
  | { ok: true; row: InventoryRow; movement: MovementRow; replayed: boolean }
  | { ok: false; status: 404 | 409 | 422; message: string; fields?: AdjustErrors };

/** One atomic transaction: position update + ledger entry. Same key + same body returns the original; a changed body is a 409. */
export async function recordAdjustment(ctx: SupplierContext, actor: ObjectId, input: AdjustInput, idempotencyKey: string): Promise<AdjustResult> {
  const fields = validateAdjust(input);
  if (Object.keys(fields).length) return { ok: false, status: 422, message: "Please fix the highlighted fields.", fields };
  const product = (await collectSupplierProducts(ctx)).find((p) => p.id === input.productRef);
  if (!product) return { ok: false, status: 404, message: "Product not found." };

  const qty = parseQtyMilli(input.quantity)!;
  const reorder = input.reorderLevel ? parseQtyMilli(input.reorderLevel) : undefined;
  const bodyHash = createHash("sha256").update(JSON.stringify([input.productRef, input.kind, qty, input.reason, input.note.trim(), reorder ?? null])).digest("hex");
  const { positions, movements } = await stores();

  const replay = async (): Promise<AdjustResult | null> => {
    const prior = await movements.findOne({ companyId: ctx.companyId, actorId: actor, idempotencyKey });
    if (!prior) return null;
    if (prior.bodyHash !== bodyHash) return { ok: false, status: 409, message: "This request key was already used with different content." };
    const pos = await positions.findOne({ _id: prior.positionId, companyId: ctx.companyId });
    return { ok: true, row: rowOf(product, pos), movement: movementRow(prior), replayed: true };
  };
  const done = await replay();
  if (done) return done;

  const client = await getMongoClient();
  const session = client.startSession();
  let out: AdjustResult | undefined;
  try {
    await session.withTransaction(async () => {
      out = undefined;
      const now = new Date();
      const cur = await positions.findOne({ companyId: ctx.companyId, productRef: product.id }, { session });
      const eff = movementEffect(input.kind, qty, cur ? cur.onHandMilli : null);
      if ("error" in eff) {
        out = { ok: false, status: 409, message: eff.error };
        return;
      }
      const reorderMilli = reorder !== undefined ? reorder : (cur?.reorderMilli ?? null);
      let pos: PositionDoc;
      if (!cur) {
        pos = { _id: new ObjectId(), companyId: ctx.companyId, productRef: product.id, sku: product.sku, name: product.name, searchKey: `${product.name} ${product.sku}`.toLowerCase(), unit: product.unit || "piece", onHandMilli: eff.result, reorderMilli, status: stockStatus(eff.result, reorderMilli), revision: 1, createdAt: now, updatedAt: now };
        await positions.insertOne(pos, { session });
      } else {
        // conditional on the revision we read: a concurrent change aborts and retries the transaction
        const upd = await positions.findOneAndUpdate(
          { _id: cur._id, revision: cur.revision },
          { $set: { onHandMilli: eff.result, reorderMilli, status: stockStatus(eff.result, reorderMilli), updatedAt: now }, $inc: { revision: 1 } },
          { returnDocument: "after", session },
        );
        if (!upd) throw new Error("INVENTORY_CONFLICT");
        pos = upd;
      }
      const mv: MovementDoc = { _id: new ObjectId(), companyId: ctx.companyId, positionId: pos._id, productRef: product.id, sku: product.sku, name: product.name, unit: pos.unit, type: input.kind, deltaMilli: eff.delta, resultMilli: eff.result, reason: input.reason, note: input.note.trim(), actorId: actor, idempotencyKey, bodyHash, createdAt: now };
      await movements.insertOne(mv, { session });
      out = { ok: true, row: rowOf(product, pos), movement: movementRow(mv), replayed: false };
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } catch (e) {
    const err = e as { code?: number; message?: string };
    if (err.code === 11000) return (await replay()) ?? { ok: false, status: 409, message: "Stock changed at the same time. Reload and try again." };
    if (err.message === "INVENTORY_CONFLICT") return { ok: false, status: 409, message: "Stock changed at the same time. Reload and try again." };
    throw e;
  } finally {
    await session.endSession();
  }
  return out ?? { ok: false, status: 409, message: "Could not record the adjustment." };
}
