import { ObjectId, type Collection, type Document } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { FILTER_PURPOSE, MAX_ADDRESSES, type AddressInput, type AddressPurpose, type AddressQuery } from "./addressRules";
import { recordProfileEvent } from "./profile";

/**
 * The buyer's saved addresses (`buyer_addresses`). Every function takes the buyer id from the verified session and every query
 * names it, so another buyer's address can never be read, changed, deleted or made default. There are no public address routes.
 *
 * Defaults: one default billing and one default delivery address per buyer, independent of each other. Changing a default runs
 * in one transaction (clear the old one, set the new one), and two partial unique indexes make a second default of the same kind
 * impossible even under concurrent requests (the loser gets a conflict, never a second default).
 *
 * Deletion: addresses are deleted outright (no personal data is kept longer than needed). Nothing else references an address by
 * id: an inquiry stores the location text it was sent with, and no order, quotation or checkout exists yet. When orders exist they
 * must store an immutable snapshot (`toAddressSnapshot` in addressRules.ts), so editing or deleting a saved address never
 * rewrites a confirmed record. `isReferencedByActiveRecord` is the hook for the "address in use" check once such records exist.
 */
interface AddressRow extends Document {
  _id: ObjectId;
  buyerId: ObjectId;
  companyId?: ObjectId;
  label: string;
  purposes: AddressPurpose[];
  contactPerson?: string;
  companyName?: string;
  phone?: { countryCode: string; number: string; normalized: string };
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  country: string;
  state: string;
  city: string;
  postalCode: string;
  isDefaultBilling: boolean;
  isDefaultDelivery: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

let indexReady: Promise<unknown> | undefined;
async function addresses(): Promise<{ db: Awaited<ReturnType<typeof getDb>>; col: Collection<AddressRow> }> {
  const db = await getDb();
  const col = db.collection<AddressRow>("buyer_addresses");
  indexReady ??= Promise.all([
    col.createIndex({ buyerId: 1, createdAt: -1 }),
    // at most one default of each kind per buyer, enforced by the database itself
    col.createIndex({ buyerId: 1, isDefaultBilling: 1 }, { unique: true, partialFilterExpression: { isDefaultBilling: true }, name: "one_default_billing_per_buyer" }),
    col.createIndex({ buyerId: 1, isDefaultDelivery: 1 }, { unique: true, partialFilterExpression: { isDefaultDelivery: true }, name: "one_default_delivery_per_buyer" }),
  ]);
  await indexReady;
  return { db, col };
}

export interface AddressDto {
  id: string;
  label: string;
  purposes: AddressPurpose[];
  contactPerson: string | null;
  companyName: string | null;
  phone: { countryCode: string; number: string; normalized: string } | null;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  country: string;
  state: string;
  city: string;
  postalCode: string;
  isDefaultBilling: boolean;
  isDefaultDelivery: boolean;
  forCompany: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const toDto = (a: AddressRow): AddressDto => ({
  id: a._id.toString(),
  label: a.label,
  purposes: a.purposes,
  contactPerson: a.contactPerson ?? null,
  companyName: a.companyName ?? null,
  phone: a.phone ?? null,
  addressLine1: a.addressLine1,
  addressLine2: a.addressLine2 ?? null,
  landmark: a.landmark ?? null,
  country: a.country,
  state: a.state,
  city: a.city,
  postalCode: a.postalCode,
  isDefaultBilling: a.isDefaultBilling === true,
  isDefaultDelivery: a.isDefaultDelivery === true,
  forCompany: Boolean(a.companyId),
  version: a.version,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

export interface AddressStatistics {
  total: number;
  billing: number;
  delivery: number;
  business: number;
  hasDefaultBilling: boolean;
  hasDefaultDelivery: boolean;
}

const owner = (buyerId: string) => new ObjectId(buyerId);
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isDuplicate = (error: unknown) => (error as { code?: number }).code === 11000;

/** One aggregation over the buyer's own addresses (at most 50): unique records, never double counted for multiple purposes. */
export async function getAddressStatistics(buyerId: string): Promise<AddressStatistics> {
  const { col } = await addresses();
  const [row] = await col
    .aggregate<{ total: number; billing: number; delivery: number; business: number; db: number; dd: number }>([
      { $match: { buyerId: owner(buyerId) } },
      { $group: { _id: null, total: { $sum: 1 }, billing: { $sum: { $cond: [{ $in: ["BILLING", "$purposes"] }, 1, 0] } }, delivery: { $sum: { $cond: [{ $in: ["DELIVERY", "$purposes"] }, 1, 0] } }, business: { $sum: { $cond: [{ $in: ["BUSINESS", "$purposes"] }, 1, 0] } }, db: { $sum: { $cond: ["$isDefaultBilling", 1, 0] } }, dd: { $sum: { $cond: ["$isDefaultDelivery", 1, 0] } } } },
    ])
    .toArray();
  return { total: row?.total ?? 0, billing: row?.billing ?? 0, delivery: row?.delivery ?? 0, business: row?.business ?? 0, hasDefaultBilling: (row?.db ?? 0) > 0, hasDefaultDelivery: (row?.dd ?? 0) > 0 };
}

export interface AddressList {
  addresses: AddressDto[];
  statistics: AddressStatistics;
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** The buyer's addresses, filtered by purpose and a bounded text search over label, contact person, company, city, state and PIN. Defaults first, then newest. */
export async function listAddresses(buyerId: string, query: AddressQuery): Promise<AddressList> {
  const { col } = await addresses();
  const filter: Document = { buyerId: owner(buyerId) };
  if (query.type !== "all") filter.purposes = FILTER_PURPOSE[query.type];
  if (query.q) {
    const re = new RegExp(escapeRegex(query.q), "i");
    filter.$or = ["label", "contactPerson", "companyName", "city", "state", "postalCode"].map((field) => ({ [field]: re }));
  }
  // Read in index order ({buyerId, createdAt} serves the sort, no blocking sort stage). A buyer has at most MAX_ADDRESSES rows, so
  // ranking the defaults first (stable, so newest-first is kept inside each group) and paging happen on a bounded array.
  const [all, statistics] = await Promise.all([col.find(filter).sort({ createdAt: -1 }).limit(MAX_ADDRESSES).toArray(), getAddressStatistics(buyerId)]);
  const rank = (a: AddressRow) => (a.isDefaultBilling ? 0 : a.isDefaultDelivery ? 1 : 2);
  const ordered = all.map((row, index) => ({ row, index })).sort((x, y) => rank(x.row) - rank(y.row) || x.index - y.index).map((x) => x.row);
  const total = ordered.length;
  const rows = ordered.slice((query.page - 1) * query.limit, query.page * query.limit);
  return { addresses: rows.map(toDto), statistics, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
}

export async function getAddress(buyerId: string, id: string): Promise<AddressDto | null> {
  if (!ObjectId.isValid(id)) return null;
  const { col } = await addresses();
  const row = await col.findOne({ _id: new ObjectId(id), buyerId: owner(buyerId) });
  return row ? toDto(row) : null;
}

export type AddressFailure = { ok: false; code: "NOT_FOUND" | "CONFLICT" | "LIMIT" | "NO_COMPANY" | "PURPOSE_MISSING" };

async function companyIdOf(buyerId: string): Promise<ObjectId | null> {
  const { db } = await addresses();
  const company = await db.collection("companies").findOne({ ownerUserId: owner(buyerId) }, { projection: { _id: 1 } });
  return (company?._id as ObjectId | undefined) ?? null;
}

export async function createAddress(buyerId: string, input: AddressInput): Promise<{ ok: true; address: AddressDto } | AddressFailure> {
  const { db, col } = await addresses();
  if ((await col.countDocuments({ buyerId: owner(buyerId) })) >= MAX_ADDRESSES) return { ok: false, code: "LIMIT" };
  let companyId: ObjectId | undefined;
  if (input.forCompany) {
    const found = await companyIdOf(buyerId);
    if (!found) return { ok: false, code: "NO_COMPANY" };
    companyId = found;
  }
  const now = new Date();
  const row: AddressRow = { _id: new ObjectId(), buyerId: owner(buyerId), ...(companyId ? { companyId } : {}), label: input.label, purposes: input.purposes, ...(input.contactPerson ? { contactPerson: input.contactPerson } : {}), ...(input.companyName ? { companyName: input.companyName } : {}), ...(input.phone ? { phone: input.phone } : {}), addressLine1: input.addressLine1, ...(input.addressLine2 ? { addressLine2: input.addressLine2 } : {}), ...(input.landmark ? { landmark: input.landmark } : {}), country: input.country, state: input.state, city: input.city, postalCode: input.postalCode, isDefaultBilling: input.isDefaultBilling === true, isDefaultDelivery: input.isDefaultDelivery === true, version: 1, createdAt: now, updatedAt: now };
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      if (row.isDefaultBilling) await col.updateMany({ buyerId: row.buyerId, isDefaultBilling: true }, { $set: { isDefaultBilling: false, updatedAt: now } }, { session });
      if (row.isDefaultDelivery) await col.updateMany({ buyerId: row.buyerId, isDefaultDelivery: true }, { $set: { isDefaultDelivery: false, updatedAt: now } }, { session });
      await col.insertOne(row, { session });
    });
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, code: "CONFLICT" };
    throw error;
  } finally {
    await session.endSession();
  }
  await recordProfileEvent(row.buyerId, "ADDRESS_CREATED", ["label", "purposes", "city", "state", "postalCode"]);
  return { ok: true, address: toDto(row) };
}

export async function updateAddress(buyerId: string, id: string, input: AddressInput): Promise<{ ok: true; address: AddressDto; clearedDefaults: ("BILLING" | "DELIVERY")[] } | AddressFailure> {
  if (!ObjectId.isValid(id)) return { ok: false, code: "NOT_FOUND" };
  const { db, col } = await addresses();
  const _id = new ObjectId(id);
  const buyer = owner(buyerId);
  const current = await col.findOne({ _id, buyerId: buyer });
  if (!current) return { ok: false, code: "NOT_FOUND" };
  // a default is kept unless the buyer changes it, or removes the purpose it needs (then it is cleared, never moved to another address)
  let billing = input.isDefaultBilling ?? current.isDefaultBilling;
  let delivery = input.isDefaultDelivery ?? current.isDefaultDelivery;
  const clearedDefaults: ("BILLING" | "DELIVERY")[] = [];
  if (billing && !input.purposes.includes("BILLING")) { billing = false; clearedDefaults.push("BILLING"); }
  if (delivery && !input.purposes.includes("DELIVERY")) { delivery = false; clearedDefaults.push("DELIVERY"); }
  let companyId: ObjectId | undefined = current.companyId;
  if (input.forCompany === true) {
    const found = await companyIdOf(buyerId);
    if (!found) return { ok: false, code: "NO_COMPANY" };
    companyId = found;
  } else if (input.forCompany === false) companyId = undefined;

  const now = new Date();
  const set: Document = { label: input.label, purposes: input.purposes, addressLine1: input.addressLine1, country: input.country, state: input.state, city: input.city, postalCode: input.postalCode, isDefaultBilling: billing, isDefaultDelivery: delivery, updatedAt: now };
  const unset: Document = {};
  const optional: [string, unknown][] = [["contactPerson", input.contactPerson], ["companyName", input.companyName], ["phone", input.phone], ["addressLine2", input.addressLine2], ["landmark", input.landmark]];
  for (const [key, value] of optional) if (value) set[key] = value; else unset[key] = "";
  if (companyId) set.companyId = companyId; else unset.companyId = "";

  const session = db.client.startSession();
  let updated: AddressRow | null = null;
  try {
    await session.withTransaction(async () => {
      updated = null;
      if (billing && !current.isDefaultBilling) await col.updateMany({ buyerId: buyer, isDefaultBilling: true, _id: { $ne: _id } }, { $set: { isDefaultBilling: false, updatedAt: now } }, { session });
      if (delivery && !current.isDefaultDelivery) await col.updateMany({ buyerId: buyer, isDefaultDelivery: true, _id: { $ne: _id } }, { $set: { isDefaultDelivery: false, updatedAt: now } }, { session });
      updated = await col.findOneAndUpdate({ _id, buyerId: buyer, version: input.version }, { $set: set, $unset: unset, $inc: { version: 1 } }, { session, returnDocument: "after" });
      if (!updated) await session.abortTransaction();
    });
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, code: "CONFLICT" };
    throw error;
  } finally {
    await session.endSession();
  }
  const result = updated as AddressRow | null;
  if (!result) return { ok: false, code: "CONFLICT" };
  await recordProfileEvent(buyer, "ADDRESS_UPDATED", ["label", "purposes", "addressLine1", "city", "state", "postalCode"].filter((k) => k in set));
  return { ok: true, address: toDto(result), clearedDefaults };
}

/** Whether a confirmed order, invoice or active quotation uses this address by id. None exist yet, so nothing can: the hook is here for when they do. */
async function isReferencedByActiveRecord(): Promise<boolean> {
  return false;
}

export async function deleteAddress(buyerId: string, id: string): Promise<{ ok: true; clearedDefaults: ("BILLING" | "DELIVERY")[] } | AddressFailure> {
  if (!ObjectId.isValid(id)) return { ok: false, code: "NOT_FOUND" };
  const { col } = await addresses();
  const row = await col.findOne({ _id: new ObjectId(id), buyerId: owner(buyerId) }, { projection: { isDefaultBilling: 1, isDefaultDelivery: 1 } });
  if (!row) return { ok: false, code: "NOT_FOUND" };
  if (await isReferencedByActiveRecord()) return { ok: false, code: "CONFLICT" };
  const result = await col.deleteOne({ _id: row._id, buyerId: owner(buyerId) });
  if (result.deletedCount !== 1) return { ok: false, code: "NOT_FOUND" };
  await recordProfileEvent(owner(buyerId), "ADDRESS_DELETED", []);
  // no other address is promoted: the buyer chooses the next default
  return { ok: true, clearedDefaults: [...(row.isDefaultBilling ? (["BILLING"] as const) : []), ...(row.isDefaultDelivery ? (["DELIVERY"] as const) : [])] };
}

export async function setDefaultAddress(buyerId: string, id: string, type: "BILLING" | "DELIVERY"): Promise<{ ok: true; address: AddressDto } | AddressFailure> {
  if (!ObjectId.isValid(id)) return { ok: false, code: "NOT_FOUND" };
  const { db, col } = await addresses();
  const _id = new ObjectId(id);
  const buyer = owner(buyerId);
  const flag = type === "BILLING" ? "isDefaultBilling" : "isDefaultDelivery";
  const session = db.client.startSession();
  let outcome: { ok: true; row: AddressRow } | AddressFailure = { ok: false, code: "NOT_FOUND" };
  try {
    await session.withTransaction(async () => {
      const row = await col.findOne({ _id, buyerId: buyer }, { session });
      if (!row) { outcome = { ok: false, code: "NOT_FOUND" }; return; }
      if (!row.purposes.includes(type)) { outcome = { ok: false, code: "PURPOSE_MISSING" }; return; }
      const now = new Date();
      await col.updateMany({ buyerId: buyer, [flag]: true, _id: { $ne: _id } }, { $set: { [flag]: false, updatedAt: now } }, { session });
      const updated = await col.findOneAndUpdate({ _id, buyerId: buyer }, { $set: { [flag]: true, updatedAt: now }, $inc: { version: 1 } }, { session, returnDocument: "after" });
      outcome = updated ? { ok: true, row: updated } : { ok: false, code: "NOT_FOUND" };
    });
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, code: "CONFLICT" };
    throw error;
  } finally {
    await session.endSession();
  }
  const final = outcome as { ok: true; row: AddressRow } | AddressFailure;
  if (!final.ok) return final;
  await recordProfileEvent(buyer, type === "BILLING" ? "ADDRESS_DEFAULT_BILLING" : "ADDRESS_DEFAULT_DELIVERY", []);
  return { ok: true, address: toDto(final.row) };
}
