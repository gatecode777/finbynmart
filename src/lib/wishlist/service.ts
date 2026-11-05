import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { SAVED_CAP } from "./savedProductsRules";

interface WishlistDoc {
  _id?: ObjectId;
  userId: ObjectId;
  productKey: string;
  productName: string;
  addedAt: Date;
}

let indexReady: Promise<unknown> | undefined;

async function wishlist(): Promise<Collection<WishlistDoc>> {
  const collection = (await getDb()).collection<WishlistDoc>("wishlists");
  // One row per buyer and product: the unique index is what prevents duplicate saves.
  indexReady ??= Promise.all([
    collection.createIndex({ userId: 1, productKey: 1 }, { unique: true }),
    // Saved Products lists newest first without a sort stage (the id is the tie-breaker)
    collection.createIndex({ userId: 1, addedAt: -1, _id: -1 }, { name: "buyer_saved_newest" }),
  ]);
  await indexReady;
  return collection;
}

/** Every query below filters by the signed-in buyer's id, so one account can never read or change another's list. */
export async function listWishlist(userId: string): Promise<string[]> {
  const rows = await (await wishlist()).find({ userId: new ObjectId(userId) }, { projection: { productKey: 1 } }).sort({ addedAt: -1 }).limit(500).toArray();
  return rows.map((row) => row.productKey);
}

/** Returns false when the product was already saved, and "limit" when the buyer already keeps SAVED_CAP products. */
export async function addToWishlist(userId: string, productKey: string, productName: string): Promise<boolean | "limit"> {
  const mine = await wishlist();
  if ((await mine.countDocuments({ userId: new ObjectId(userId) }, { limit: SAVED_CAP })) >= SAVED_CAP && !(await mine.findOne({ userId: new ObjectId(userId), productKey }, { projection: { _id: 1 } }))) return "limit";
  try {
    await (await wishlist()).insertOne({ userId: new ObjectId(userId), productKey, productName, addedAt: new Date() });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

export async function removeFromWishlist(userId: string, productKey: string): Promise<boolean> {
  const result = await (await wishlist()).deleteOne({ userId: new ObjectId(userId), productKey });
  return result.deletedCount > 0;
}

/** How many products this buyer has saved (a count, not the list). */
export async function countWishlist(userId: string): Promise<number> {
  return (await wishlist()).countDocuments({ userId: new ObjectId(userId) });
}
