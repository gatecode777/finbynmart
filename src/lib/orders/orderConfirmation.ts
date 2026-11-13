import { ObjectId } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { priceBreakdown } from "@/lib/quotations/money";
import { REFERENCE_PATTERN as REFERENCE } from "@/lib/quotations/quotationRules";
import { quotationsCollection } from "@/lib/quotations/service";
import { findCompanyBySupplierKey } from "@/lib/supplier/company";
import { canReserve, orderQtyMilli } from "@/lib/supplier/inventoryRules";
import type { MovementDoc, PositionDoc } from "@/lib/supplier/inventoryService";
import { notifySellerOwner } from "@/lib/supplier/notifyOwner";
import { buildOrderDoc, ordersCollection, type OrderDoc } from "./service";

/**
 * EXPLICIT ORDER CONFIRMATION (the approved trigger). Accepting a quotation records a decision only. The buyer who owns the accepted quotation
 * then confirms it here, which creates exactly ONE order for that quotation from the accepted version's own stored commercial fields (never today's
 * catalogue price or tax rules). No payment is collected or implied. Rules:
 *  - one order per quotation: unique partial index `order_per_quotation`; a repeat (same or different key) returns the original order;
 *  - an idempotency key reused for a DIFFERENT quotation is a 409 (`order_confirm_key`);
 *  - a tracked line (the seller's company has an inventory position for the product) reserves its quantity in the same transaction and the whole
 *    confirmation fails with 409 if the available quantity is not enough (no backorder); a line with no position is UNTRACKED and stays untracked;
 *  - the order is shown to the buyer and to the supplier by the existing pages; the supplier gets an in-app notice after the commit.
 */
export interface ConfirmOk { ok: true; replayed: boolean; reference: string; inventory: "TRACKED" | "UNTRACKED" }
export type ConfirmResult = ConfirmOk | { ok: false; status: 404 | 409 | 422; code: string; message: string };
const fail = (status: 404 | 409 | 422, code: string, message: string): ConfirmResult => ({ ok: false, status, code, message });

export interface ConfirmationState { eligible: boolean; reason: string | null; order: { reference: string } | null }

const KEY = /^[A-Za-z0-9_-]{16,80}$/;

async function loadAccepted(buyerId: ObjectId, reference: string) {
  return (await quotationsCollection()).findOne({ reference, buyerId, accepted: true, status: "ACCEPTED" });
}

/** What the page may offer. Read-only: opening a quotation never creates anything. */
export async function getConfirmationState(buyer: string, reference: string): Promise<ConfirmationState | null> {
  if (!ObjectId.isValid(buyer) || !REFERENCE.test(reference)) return null;
  const buyerId = new ObjectId(buyer);
  const q = await loadAccepted(buyerId, reference);
  if (!q) return null; // not the buyer's, not accepted, or unknown: nothing to offer, nothing revealed
  const existing = await (await ordersCollection()).findOne({ quotationReference: reference, buyerId }, { projection: { reference: 1 } });
  if (existing) return { eligible: false, reason: null, order: { reference: existing.reference } };
  return { eligible: true, reason: null, order: null };
}

export async function confirmOrder(buyer: string, reference: string, idempotencyKey: string): Promise<ConfirmResult> {
  if (!ObjectId.isValid(buyer)) return fail(404, "NOT_FOUND", "That quotation was not found.");
  if (!REFERENCE.test(reference)) return fail(404, "NOT_FOUND", "That quotation was not found.");
  if (!KEY.test(idempotencyKey)) return fail(422, "VALIDATION", "A valid idempotencyKey is required.");
  const buyerId = new ObjectId(buyer);
  const orders = await ordersCollection();

  const q = await loadAccepted(buyerId, reference);
  if (!q) return fail(404, "NOT_FOUND", "That quotation was not found or is not accepted.");

  const replay = async (): Promise<ConfirmResult | null> => {
    const prior = await orders.findOne({ quotationReference: reference, buyerId });
    if (prior) return { ok: true, replayed: true, reference: prior.reference, inventory: prior.inventory?.mode ?? "UNTRACKED" };
    return null;
  };
  const done = await replay();
  if (done) return done;
  // the same key already used for another quotation: a conflict, never a second order
  const keyed = await orders.findOne({ buyerId, confirmKey: idempotencyKey }, { projection: { quotationReference: 1 } });
  if (keyed && keyed.quotationReference !== reference) return fail(409, "KEY_CONFLICT", "This request key was already used for a different quotation.");

  // the price comes from the accepted version's own stored fields
  const price = priceBreakdown({ unitPriceMinor: q.unitPriceMinor, quantity: q.quantity, discount: q.discount ?? null, tax: q.tax ?? null, charges: q.charges ?? [] });
  if (!price.ok) return fail(422, "PRICE", "The accepted quotation has no valid stored price, so it cannot be confirmed.");

  // tracked or untracked: only an EXISTING inventory position of the owning company counts; nothing is guessed or created
  const company = await findCompanyBySupplierKey(q.supplierKey, { _id: 1 });
  const positions = (await getDb()).collection<PositionDoc>("inventory_positions");
  const movements = (await getDb()).collection<MovementDoc>("inventory_movements");
  let position: PositionDoc | null = null;
  if (company && q.productKey) {
    position = await positions.findOne({ companyId: company._id, productRef: { $in: [`cat-${q.productKey}`, q.productKey] } });
  }
  const wantMilli = position ? orderQtyMilli(q.quantity) : null;
  if (position && wantMilli === null) return fail(422, "QUANTITY", "This tracked item cannot be reserved: its quantity is not an exact number of thousandths.");

  const now = new Date();
  const order: OrderDoc = buildOrderDoc({
    buyerId,
    supplierKey: q.supplierKey,
    supplierName: q.supplierName,
    supplierSlug: q.supplierSlug,
    quotationReference: q.reference,
    inquiryReference: q.inquiryReference,
    items: [{ productKey: q.productKey, name: q.productName, quantity: q.quantity, unit: q.unit, unitPriceMinor: q.unitPriceMinor }],
    currency: q.currency,
    totalMinor: price.value.totalMinor,
    status: "CONFIRMED",
    placedAt: now,
    events: [{ type: "CONFIRMED", at: now, actor: "buyer" }],
  });
  order._id = new ObjectId();
  const stored = { ...order, confirmKey: idempotencyKey, confirmedFromVersion: q.version, inventory: position ? { mode: "TRACKED" as const, positionId: position._id, reservedMilli: wantMilli! } : { mode: "UNTRACKED" as const } };

  const client = await getMongoClient();
  const session = client.startSession();
  let result: ConfirmResult | undefined;
  try {
    await session.withTransaction(
      async () => {
        result = undefined;
        if (position && wantMilli !== null) {
          const upd = await positions.findOneAndUpdate(
            { _id: position._id, $expr: { $gte: [{ $subtract: ["$onHandMilli", { $ifNull: ["$reservedMilli", 0] }] }, wantMilli] } },
            { $inc: { reservedMilli: wantMilli, revision: 1 }, $set: { updatedAt: now } },
            { returnDocument: "after", session },
          );
          if (!upd) {
            result = fail(409, "INSUFFICIENT_STOCK", "There is not enough available stock to reserve this order, so it was not confirmed. Ask the supplier to update stock or revise the quotation.");
            return;
          }
          if (!canReserve(upd.onHandMilli, (upd.reservedMilli ?? 0) - wantMilli, wantMilli)) throw new Error("reservation invariant");
          await movements.insertOne({ _id: new ObjectId(), companyId: upd.companyId, positionId: upd._id, productRef: upd.productRef, sku: upd.sku, name: upd.name, unit: upd.unit, type: "RESERVE", deltaMilli: 0, reservedDeltaMilli: wantMilli, sourceRef: order.reference, resultMilli: upd.onHandMilli, reason: "ORDER", note: "", actorId: buyerId, idempotencyKey: `reserve:${order.reference}`, bodyHash: "", createdAt: now }, { session });
        }
        await orders.insertOne(stored as OrderDoc, { session });
        result = { ok: true, replayed: false, reference: order.reference, inventory: position ? "TRACKED" : "UNTRACKED" };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } catch (e) {
    const err = e as { code?: number; message?: string };
    if (err.code === 11000) return (await replay()) ?? fail(409, "KEY_CONFLICT", "This request key was already used for a different quotation.");
    throw e;
  } finally {
    await session.endSession();
  }
  const r = result ?? fail(409, "FAILED", "The order could not be confirmed.");
  if (r.ok && !r.replayed) {
    // after the commit only; a failed notice never undoes or repeats the order
    await notifySellerOwner(q.supplierKey, { category: "orders", type: "ORDER_CONFIRMED", title: "Order confirmed by a buyer", body: `A buyer confirmed order ${r.reference} from quotation ${q.reference}.`, link: `/supplier/orders/${r.reference}`, dedupeKey: `order:${r.reference}` });
  }
  return r;
}
