import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongo";

/**
 * Admin capabilities. Authority comes only from the account record on the server: role "admin" AND the capability listed in the user's
 * `adminPermissions` array. A missing or empty array allows nothing (default deny). Admin accounts are never created through any web form;
 * an operator grants them directly in the database (see docs/admin/ADMIN_ACCESS.md).
 */
export const ADMIN_CAPABILITIES = ["inquiries.read", "inquiries.responses", "inquiries.export", "sellers.map", "products.review", "support.manage"] as const;
export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

export async function getAdminPermissions(userId: string): Promise<AdminCapability[]> {
  if (!ObjectId.isValid(userId)) return [];
  const doc = await (await getDb()).collection<{ _id: ObjectId; role?: string; accountStatus?: string; adminPermissions?: unknown }>("users").findOne({ _id: new ObjectId(userId) }, { projection: { role: 1, accountStatus: 1, adminPermissions: 1 } });
  if (!doc || doc.role !== "admin" || (doc.accountStatus && doc.accountStatus !== "ACTIVE")) return [];
  const list = Array.isArray(doc.adminPermissions) ? doc.adminPermissions : [];
  return ADMIN_CAPABILITIES.filter((c) => list.includes(c));
}
