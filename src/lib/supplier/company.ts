import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";

/**
 * The supplier company (Page 39), the unit of tenancy for every supplier page and API.
 *
 * Audit result (docs/backend/PAGE_39_SUPPLIER_DASHBOARD_AUDIT.md): before this page a supplier account was only a `users` row with its
 * business details inline; there was no company record, no membership and no link to the sellers buyers send inquiries to. This adds the
 * minimum, backward compatible:
 *  - one `supplier_companies` row per supplier account (created the first time the account is resolved, so every existing supplier is migrated
 *    without a batch job); the business details stay on the user row (no second copy that could disagree);
 *  - **one login per company** (the owner), as the application supports today. The context carries a role and permissions so a membership
 *    table can be added later without changing callers, but no multi-user machinery is built;
 *  - `sellerKeys`: the sellers (canonical keys from resolveSupplier: a catalogue seller id or a sample supplier slug) this company OWNS, which is
 *    how inquiries, quotations, orders, products and reviews (all keyed by seller) reach a company. It starts EMPTY for every company and can only be
 *    changed by the platform (no self-claim: "companies cannot be claimed here"), so a supplier sees nothing that was not legitimately theirs.
 */
export type CompanyStatus = "ACTIVE" | "SUSPENDED";
export type VerificationStatus = "UNVERIFIED";

export interface SupplierCompanyDoc {
  _id: ObjectId;
  ownerUserId: ObjectId;
  sellerKeys: string[];
  status: CompanyStatus;
  /** There is no verification workflow: always UNVERIFIED. Email or phone confirmation and a complete profile are NOT company verification. */
  verificationStatus: VerificationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const SELLER_KEY_LIMIT = 50;

/**
 * Every company also has ONE implicit supplier key of its own, `co:<companyId>`: the identity under which its OWN approved products are public and
 * to which buyer inquiries for them are addressed. It is never stored in `sellerKeys` (that list stays admin-linked catalogue sellers only, so a new
 * supplier never has to claim an unrelated seeded seller); the session context adds it to the in-memory list, so every existing
 * `supplierKey in company.sellerKeys` scope already covers it.
 */
export const COMPANY_KEY_PREFIX = "co:";
export const companyKeyOf = (companyId: ObjectId | string): string => COMPANY_KEY_PREFIX + (typeof companyId === "string" ? companyId : companyId.toHexString());
export const isCompanyKey = (key: string): boolean => /^co:[a-f0-9]{24}$/.test(key);
export const realSellerKeys = (keys: string[]): string[] => keys.filter((k) => !k.startsWith(COMPANY_KEY_PREFIX));

/** The ACTIVE company that owns a supplier key: its own implicit key, or an admin-linked catalogue seller. */
export async function findCompanyBySupplierKey(key: string, projection: Record<string, 1> = { ownerUserId: 1 }) {
  const col = await supplierCompanies();
  if (isCompanyKey(key)) return col.findOne({ _id: new ObjectId(key.slice(COMPANY_KEY_PREFIX.length)), status: "ACTIVE" }, { projection });
  return col.findOne({ sellerKeys: key, status: "ACTIVE" }, { projection });
}

export type SupplierRole = "owner";
export interface SupplierPermissions {
  viewDashboard: boolean;
  viewInquiries: boolean;
  /** Send a response or a clarification question on an inquiry (Page 41). */
  respondToInquiries: boolean;
  manageQuotations: boolean;
  viewOrders: boolean;
  /** Download the order list as CSV (Page 45). */
  exportOrders: boolean;
  manageProducts: boolean;
  viewAnalytics: boolean;
  editCompany: boolean;
  manageSettings: boolean;
}

/** The only role today. A future membership table maps other roles (sales, catalogue, read-only) to narrower sets. */
export const OWNER_PERMISSIONS: SupplierPermissions = { viewDashboard: true, viewInquiries: true, respondToInquiries: true, manageQuotations: true, viewOrders: true, exportOrders: true, manageProducts: true, viewAnalytics: true, editCompany: true, manageSettings: true };

export interface SupplierProfile {
  displayName: string;
  contactName: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  city: string | null;
  description: string | null;
}

export interface SupplierContext {
  companyId: ObjectId;
  company: SupplierCompanyDoc;
  role: SupplierRole;
  permissions: SupplierPermissions;
  profile: SupplierProfile;
}

let indexReady: Promise<unknown> | undefined;
export async function supplierCompanies(): Promise<Collection<SupplierCompanyDoc>> {
  const col = (await getDb()).collection<SupplierCompanyDoc>("supplier_companies");
  // one company per owner account: a race between two first requests cannot create two
  indexReady ??= Promise.all([
    col.createIndex({ ownerUserId: 1 }, { unique: true, name: "company_owner" }),
    // a seller key belongs to at most one company, enforced by the database (partial: companies with no sellers are not indexed)
    col.createIndex({ sellerKeys: 1 }, { unique: true, partialFilterExpression: { "sellerKeys.0": { $exists: true } }, name: "company_seller_unique" }),
  ]);
  await indexReady;
  return col;
}

interface UserRow {
  _id: ObjectId;
  name: string;
  email: string;
  role: string;
  emailVerified?: boolean;
  supplier?: { businessName: string; phone: string; city: string; offering: string };
}

/**
 * The company and profile of the signed-in supplier account, from the account id the SESSION proved. Null when the account is not a
 * supplier account (or has no business details). Creates the company row on first use (idempotent, race safe).
 */
export async function resolveSupplierContext(userId: string): Promise<SupplierContext | null> {
  if (!ObjectId.isValid(userId)) return null;
  const _id = new ObjectId(userId);
  const db = await getDb();
  const col = await supplierCompanies();
  const [user, existing] = await Promise.all([
    db.collection<UserRow>("users").findOne({ _id }, { projection: { name: 1, email: 1, role: 1, emailVerified: 1, supplier: 1 } }),
    col.findOne({ ownerUserId: _id }),
  ]);
  if (!user || user.role !== "supplier" || !user.supplier) return null;
  let company = existing;
  if (!company) {
    const now = new Date();
    company = await col.findOneAndUpdate({ ownerUserId: _id }, { $setOnInsert: { ownerUserId: _id, sellerKeys: [], status: "ACTIVE" as const, verificationStatus: "UNVERIFIED" as const, createdAt: now, updatedAt: now } }, { upsert: true, returnDocument: "after" });
  }
  if (!company) return null;
  const s = user.supplier;
  return {
    companyId: company._id,
    company: { ...company, sellerKeys: [...company.sellerKeys, companyKeyOf(company._id)] },
    role: "owner",
    permissions: OWNER_PERMISSIONS,
    profile: { displayName: s.businessName, contactName: user.name, email: user.email, emailVerified: user.emailVerified === true, phone: s.phone || null, city: s.city || null, description: s.offering || null },
  };
}
