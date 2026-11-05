import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { SAVED_SUPPLIER_CAP } from "./savedSuppliersRules";

/**
 * Saved suppliers. A separate collection from saved products so that each has its own unique index
 * (one row per buyer and supplier), instead of mixing two kinds of key in one collection.
 */
interface SavedSupplierDoc {
  _id?: ObjectId;
  userId: ObjectId;
  supplierKey: string;
  supplierName: string;
  addedAt: Date;
}

let indexReady: Promise<unknown> | undefined;

async function saved(): Promise<Collection<SavedSupplierDoc>> {
  const collection = (await getDb()).collection<SavedSupplierDoc>("wishlist_suppliers");
  // one row per buyer and supplier; the second index serves the newest-first list without an in-database sort
  indexReady ??= Promise.all([collection.createIndex({ userId: 1, supplierKey: 1 }, { unique: true }), collection.createIndex({ userId: 1, addedAt: -1, _id: -1 }, { name: "buyer_saved_suppliers_newest" })]);
  await indexReady;
  return collection;
}

/** Every query filters by the signed-in buyer's id, so one account can never read or change another's list. */
export async function listSavedSuppliers(userId: string): Promise<string[]> {
  const rows = await (await saved()).find({ userId: new ObjectId(userId) }, { projection: { supplierKey: 1 } }).sort({ addedAt: -1, _id: -1 }).limit(SAVED_SUPPLIER_CAP).toArray();
  return rows.map((row) => row.supplierKey);
}

/** Returns false when the supplier was already saved, and "limit" when the buyer already keeps SAVED_SUPPLIER_CAP suppliers. */
export async function saveSupplier(userId: string, supplierKey: string, supplierName: string): Promise<boolean | "limit"> {
  const mine = await saved();
  if ((await mine.countDocuments({ userId: new ObjectId(userId) }, { limit: SAVED_SUPPLIER_CAP })) >= SAVED_SUPPLIER_CAP && !(await mine.findOne({ userId: new ObjectId(userId), supplierKey }, { projection: { _id: 1 } }))) return "limit";
  try {
    await (await saved()).insertOne({ userId: new ObjectId(userId), supplierKey, supplierName, addedAt: new Date() });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

export async function removeSavedSupplier(userId: string, supplierKey: string): Promise<boolean> {
  const result = await (await saved()).deleteOne({ userId: new ObjectId(userId), supplierKey });
  return result.deletedCount > 0;
}

/** The buyer's saved rows, newest first, at most SAVED_SUPPLIER_CAP (the list page reads the live details for these keys only). */
export async function listSavedSupplierRows(userId: string): Promise<{ supplierKey: string; supplierName: string; addedAt: Date }[]> {
  const rows = await (await saved()).find({ userId: new ObjectId(userId) }, { projection: { supplierKey: 1, supplierName: 1, addedAt: 1 } }).sort({ addedAt: -1, _id: -1 }).limit(SAVED_SUPPLIER_CAP).toArray();
  return rows.map((r) => ({ supplierKey: r.supplierKey, supplierName: r.supplierName ?? "Saved supplier", addedAt: r.addedAt }));
}

/**
 * Removes the buyer's OWN saved relationships to these keys (only the bookmark: no supplier record is touched) and says what happened
 * to each key. A key the buyer never saved is reported, not an error, and another buyer's relationship cannot be reached: every
 * query includes this buyer's id.
 */
export async function removeSavedSuppliers(userId: string, keys: string[]): Promise<{ removed: string[]; notSaved: string[] }> {
  const col = await saved();
  const owner = new ObjectId(userId);
  const existing = new Set((await col.find({ userId: owner, supplierKey: { $in: keys } }, { projection: { supplierKey: 1 } }).toArray()).map((r) => r.supplierKey));
  if (existing.size > 0) await col.deleteMany({ userId: owner, supplierKey: { $in: [...existing] } });
  return { removed: keys.filter((k) => existing.has(k)), notSaved: keys.filter((k) => !existing.has(k)) };
}

/** Empties the buyer's own saved-supplier list. Returns how many relationships were removed. */
export async function clearSavedSuppliers(userId: string): Promise<number> {
  return (await (await saved()).deleteMany({ userId: new ObjectId(userId) })).deletedCount;
}

/** How many suppliers this buyer has saved (a count, not the list). */
export async function countSavedSuppliers(userId: string): Promise<number> {
  return (await saved()).countDocuments({ userId: new ObjectId(userId) });
}
