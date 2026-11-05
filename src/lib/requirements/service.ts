import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";

export interface RequirementDoc {
  _id?: ObjectId;
  userId: ObjectId;
  product: string;
  quantity: number;
  unit?: string;
  city: string;
  category?: string;
  subcategory?: string;
  /** Set when the buyer addressed the requirement to one supplier (resolved on the server). */
  supplierKey?: string;
  supplierName?: string;
  status: "open";
  createdAt: Date;
}

export interface RequirementInput {
  product: string;
  quantity: number;
  unit?: string;
  city: string;
  category?: string;
  subcategory?: string;
  supplierKey?: string;
  supplierName?: string;
}

const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
let indexReady: Promise<unknown> | undefined;

async function requirements(): Promise<Collection<RequirementDoc>> {
  const collection = (await getDb()).collection<RequirementDoc>("requirements");
  indexReady ??= collection.createIndex({ userId: 1, createdAt: -1 });
  await indexReady;
  return collection;
}

/** Stores a buyer's requirement. Returns null when the same requirement was submitted a moment ago. */
export async function createRequirement(userId: string, input: RequirementInput): Promise<{ id: string } | null> {
  const collection = await requirements();
  const owner = new ObjectId(userId);

  const duplicate = await collection.findOne({
    userId: owner,
    product: input.product,
    quantity: input.quantity,
    city: input.city,
    createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
  });
  if (duplicate) return null;

  // Leave optional fields out rather than storing nulls.
  const defined = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const doc = { userId: owner, ...defined, status: "open", createdAt: new Date() } as RequirementDoc;
  const result = await collection.insertOne(doc);
  return { id: result.insertedId.toString() };
}
