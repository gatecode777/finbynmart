import { ObjectId } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { getCatalog } from "@/lib/catalog/data";
import { resolveSupplier } from "@/lib/catalog/productRef";
import { supplierCompanies } from "@/lib/supplier/company";
import { SELLER_KEY_LIMIT, validateLink, type LinkErrors, type LinkRequest } from "./mappingRules";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PAGE = 20;

export interface CompanyRow { companyId: string; businessName: string; city: string; sellerKeys: string[]; status: string; createdAt: string }

/** Bounded company search by business name. Minimal fields: no e-mail, phone or documents. */
export async function searchCompanies(q: string, page = 1): Promise<{ items: CompanyRow[]; hasMore: boolean }> {
  const db = await getDb();
  const term = q.trim().slice(0, 60);
  const userFilter: Record<string, unknown> = { role: "supplier" };
  if (term) userFilter["supplier.businessName"] = { $regex: escapeRe(term), $options: "i" };
  const users = await db
    .collection<{ _id: ObjectId; supplier?: { businessName?: string; city?: string } }>("users")
    .find(userFilter as never, { projection: { supplier: 1 } })
    .sort({ _id: -1 })
    .skip((Math.max(1, Math.min(200, page)) - 1) * PAGE)
    .limit(PAGE + 1)
    .toArray();
  const slice = users.slice(0, PAGE);
  const companies = await (await supplierCompanies()).find({ ownerUserId: { $in: slice.map((u) => u._id) } }).toArray();
  const byOwner = new Map(companies.map((c) => [c.ownerUserId.toHexString(), c]));
  const items: CompanyRow[] = [];
  for (const u of slice) {
    const c = byOwner.get(u._id.toHexString());
    // a company row is created on the supplier's first sign-in; an account that never signed in has nothing to link yet
    if (c) items.push({ companyId: c._id.toHexString(), businessName: u.supplier?.businessName ?? "(unnamed)", city: u.supplier?.city ?? "", sellerKeys: c.sellerKeys, status: c.status, createdAt: c.createdAt.toISOString() });
  }
  return { items, hasMore: users.length > PAGE };
}

export interface SellerRow { key: string; name: string; city: string; ownedByCompany: boolean }

/** Bounded catalogue seller search (at most 20). Never matched automatically against a company. */
export async function searchSellers(q: string): Promise<SellerRow[]> {
  const term = q.trim().toLowerCase().slice(0, 60);
  if (term.length < 2) return [];
  const hits = getCatalog().sellers.filter((s) => s.name.toLowerCase().includes(term)).slice(0, PAGE);
  const refs = hits.map((s) => resolveSupplier(s.id)).filter((r): r is NonNullable<typeof r> => !!r);
  const owned = await (await supplierCompanies()).find({ sellerKeys: { $in: refs.map((r) => r.key) } }, { projection: { sellerKeys: 1 } }).toArray();
  const taken = new Set(owned.flatMap((c) => c.sellerKeys));
  return refs.map((r) => ({ key: r.key, name: r.name, city: getCatalog().sellerById.get(r.key)?.city ?? "", ownedByCompany: taken.has(r.key) }));
}

export type LinkResult =
  | { ok: true; replayed: boolean; sellerKeys: string[] }
  | { ok: false; status: 404 | 409 | 422; message: string; fields?: LinkErrors };

/**
 * Links ONE catalogue seller to ONE company. Exclusivity is enforced by the database: a unique partial index on `sellerKeys`
 * (company_seller_unique) makes a second company claiming the same key fail with a duplicate-key error, even for simultaneous requests.
 * The link and its audit row commit in one transaction. Linking gives the company access to every existing inquiry, quotation, order and message
 * addressed to that seller (that is what ownership means here), so the caller must have acknowledged it. Unlinking is NOT implemented (policy unresolved).
 */
export async function linkSeller(adminId: ObjectId, req: LinkRequest): Promise<LinkResult> {
  const fields = validateLink(req);
  if (Object.keys(fields).length) return { ok: false, status: 422, message: "Please fix the highlighted fields.", fields };
  const ref = resolveSupplier(req.sellerKey);
  if (!ref) return { ok: false, status: 404, message: "That seller does not exist in the catalogue." };
  const companyId = new ObjectId(req.companyId);
  const companies = await supplierCompanies();
  const audit = (await getDb()).collection("admin_audit_log");

  const current = await companies.findOne({ _id: companyId });
  if (!current || current.status !== "ACTIVE") return { ok: false, status: 404, message: "Company not found or not active." };
  if (current.sellerKeys.includes(ref.key)) return { ok: true, replayed: true, sellerKeys: current.sellerKeys };
  if (current.sellerKeys.length >= SELLER_KEY_LIMIT) return { ok: false, status: 409, message: `A company can own at most ${SELLER_KEY_LIMIT} sellers.` };

  const client = await getMongoClient();
  const session = client.startSession();
  let result: LinkResult | undefined;
  try {
    await session.withTransaction(
      async () => {
        result = undefined;
        const now = new Date();
        const upd = await companies.findOneAndUpdate(
          { _id: companyId, status: "ACTIVE", sellerKeys: { $ne: ref.key } },
          { $addToSet: { sellerKeys: ref.key }, $set: { updatedAt: now } },
          { returnDocument: "after", session },
        );
        if (!upd) {
          result = { ok: false, status: 409, message: "The company changed while you were reviewing. Reload and try again." };
          return;
        }
        await audit.insertOne({ _id: new ObjectId(), action: "SELLER_LINKED", actorId: adminId, companyId, sellerKey: ref.key, sellerName: ref.name, reason: req.reason.trim(), keysBefore: current.sellerKeys.length, keysAfter: upd.sellerKeys.length, at: now }, { session });
        result = { ok: true, replayed: false, sellerKeys: upd.sellerKeys };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return { ok: false, status: 409, message: "This seller is already linked to another company." };
    throw e;
  } finally {
    await session.endSession();
  }
  return result ?? { ok: false, status: 409, message: "Could not link the seller." };
}
