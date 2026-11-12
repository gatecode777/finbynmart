import { ObjectId, type Collection, type Document } from "mongodb";
import { isSupplierCategoryEnabled } from "./settingsService";
import { getDb } from "@/lib/db/mongo";

export type SupplierNotificationCategory = "inquiries" | "orders" | "quotations" | "account" | "system";

export interface SupplierNotificationDoc extends Document {
  _id: ObjectId;
  supplierId: ObjectId;
  category: SupplierNotificationCategory;
  type: string;
  title: string;
  body: string;
  link: string | null;
  dedupeKey: string;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
  purgeAt: Date;
}

export interface SupplierNotificationDto {
  id: string;
  category: SupplierNotificationCategory;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

const RETENTION_DAYS = 180;
const MAX_TITLE = 140;
const MAX_BODY = 300;

let indexReady: Promise<unknown> | undefined;
async function collection(): Promise<Collection<SupplierNotificationDoc>> {
  const col = (await getDb()).collection<SupplierNotificationDoc>("supplier_notifications");
  indexReady ??= (async () => {
    await Promise.all([
      col.createIndex({ supplierId: 1, createdAt: -1, _id: -1 }, { name: "sn_supplier_newest" }),
      col.createIndex({ supplierId: 1, isRead: 1, createdAt: -1, _id: -1 }, { name: "sn_supplier_status_newest" }),
      col.createIndex({ supplierId: 1, dedupeKey: 1 }, { unique: true, name: "sn_dedupe" }),
      col.createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0, name: "sn_ttl" }),
    ]);
  })();
  await indexReady;
  return col;
}

const toDto = (n: SupplierNotificationDoc): SupplierNotificationDto => ({
  id: n._id.toString(),
  category: n.category,
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link ?? null,
  read: n.isRead === true,
  readAt: n.readAt ? n.readAt.toISOString() : null,
  createdAt: n.createdAt.toISOString(),
});

export async function notifySupplier(
  supplierId: string,
  event: {
    category: SupplierNotificationCategory;
    type: string;
    title: string;
    body: string;
    link?: string | null;
    dedupeKey: string;
  }
): Promise<boolean> {
  try {
    if (!ObjectId.isValid(supplierId)) return false;
    // preferences decide whether an optional notice is delivered; the business record behind it is never touched
    if (!(await isSupplierCategoryEnabled(supplierId, event.category))) return false;
    const col = await collection();
    const now = new Date();
    await col.insertOne({
      _id: new ObjectId(),
      supplierId: new ObjectId(supplierId),
      category: event.category,
      type: event.type,
      title: event.title.slice(0, MAX_TITLE),
      body: event.body.slice(0, MAX_BODY),
      link: event.link ?? null,
      dedupeKey: event.dedupeKey.slice(0, 120),
      isRead: false,
      readAt: null,
      createdAt: now,
      purgeAt: new Date(now.getTime() + RETENTION_DAYS * 86_400_000),
    });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) console.error("supplier notification not recorded", event.type);
    return false;
  }
}

export async function countUnreadSupplierNotifications(supplierId: string): Promise<number> {
  if (!ObjectId.isValid(supplierId)) return 0;
  const col = await collection();
  return col.countDocuments({ supplierId: new ObjectId(supplierId), isRead: false });
}

export async function listSupplierNotifications(
  supplierId: string,
  query: { status?: "unread" | "all"; limit?: number; page?: number }
): Promise<{ notifications: SupplierNotificationDto[]; unread: number; meta: { total: number; page: number; limit: number; totalPages: number } }> {
  if (!ObjectId.isValid(supplierId)) {
    return { notifications: [], unread: 0, meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
  }
  const col = await collection();
  const sid = new ObjectId(supplierId);
  const filter: Record<string, unknown> = { supplierId: sid };
  if (query.status === "unread") filter.isRead = false;

  const limit = Math.min(Math.max(1, query.limit ?? 10), 50);
  const page = Math.max(1, query.page ?? 1);
  const skip = (page - 1) * limit;

  const [total, unread, docs] = await Promise.all([
    col.countDocuments(filter),
    col.countDocuments({ supplierId: sid, isRead: false }),
    col.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
  ]);

  return {
    notifications: docs.map(toDto),
    unread,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || (total === 0 ? 0 : 1),
    },
  };
}

export async function markSupplierNotificationRead(supplierId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(supplierId) || !ObjectId.isValid(id)) return false;
  const col = await collection();
  const res = await col.updateOne(
    { _id: new ObjectId(id), supplierId: new ObjectId(supplierId) },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return res.matchedCount > 0;
}

export async function markAllSupplierNotificationsRead(supplierId: string): Promise<number> {
  if (!ObjectId.isValid(supplierId)) return 0;
  const col = await collection();
  const res = await col.updateMany(
    { supplierId: new ObjectId(supplierId), isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return res.modifiedCount;
}

/**
 * Ensures the supplier has at least the initial welcome notification if their list is currently empty.
 */
export async function seedWelcomeIfEmpty(supplierId: string, businessName: string): Promise<void> {
  if (!ObjectId.isValid(supplierId)) return;
  const col = await collection();
  const count = await col.countDocuments({ supplierId: new ObjectId(supplierId) });
  if (count === 0) {
    await notifySupplier(supplierId, {
      category: "system",
      type: "WELCOME_SUPPLIER",
      title: "Welcome to Supplier Portal",
      body: `Your business account for ${businessName || "Finbyn Mart"} is ready. You can now manage incoming buyer inquiries, issue quotations, and fulfill orders.`,
      link: "/supplier/dashboard",
      dedupeKey: `welcome:${supplierId}`,
    });
  }
}

