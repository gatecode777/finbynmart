import "server-only";
import { ObjectId } from "mongodb";
import { getCategoryDirectory } from "@/lib/catalog/categories";
import { getProductsCollection, type SupplierProductDoc } from "@/lib/supplier/productService";
import { isPubliclyEligible } from "@/lib/supplier/productDraftRules";

/**
 * THE one public-eligibility rule for supplier-created products. A supplier product is public only when ALL hold:
 *  - a reviewer approved an exact revision (`publication.state === "APPROVED"`),
 *  - the public content is that approved snapshot (later edits stay private until a new approval replaces it),
 *  - its category is still active (category activation stays admin-controlled; deactivating it hides the product, it never reactivates it).
 * Drafts, pending and rejected revisions and private media are never returned. Pagination is by the database (bounded, indexed, stable on _id).
 * NOT YET WIRED into the listing engine, product detail, search, category, supplier-profile or homepage surfaces (see docs/audits).
 */
export const PUBLISHED_MAX = 50;

const activeCategoryIds = (): string[] => getCategoryDirectory().nodes.filter((n) => n.isActive).map((n) => n.id);

export interface PublishedProduct { id: string; slug: string; name: string; description: string; categoryId: string; categoryName: string; images: { url: string; name: string }[]; companyId: string }

const view = (d: SupplierProductDoc): PublishedProduct => {
  const s = d.publication!.snapshot as Record<string, unknown>;
  return { id: d._id.toHexString(), slug: d.slug, name: String(s.name ?? ""), description: String(s.description ?? ""), categoryId: String(s.categoryId ?? ""), categoryName: String(s.categoryName ?? ""), images: ((s.images as { url: string; name: string }[]) ?? []).map((i) => ({ url: i.url, name: i.name })), companyId: d.companyId.toHexString() };
};

let idx: Promise<unknown> | undefined;
async function col() {
  const c = await getProductsCollection();
  idx ??= c.createIndex({ "publication.state": 1, "publication.snapshot.categoryId": 1, _id: 1 }, { name: "published_by_category", partialFilterExpression: { "publication.state": { $exists: true } } });
  await idx;
  return c;
}

export async function listPublished(q: { categoryId?: string; companyId?: string; page?: number; limit?: number }): Promise<{ items: PublishedProduct[]; hasMore: boolean }> {
  const limit = Math.min(PUBLISHED_MAX, Math.max(1, Math.floor(q.limit ?? 20)));
  const page = Math.max(1, Math.min(1000, Math.floor(q.page ?? 1)));
  const filter: Record<string, unknown> = { "publication.state": "APPROVED", "publication.snapshot.categoryId": q.categoryId ? { $in: activeCategoryIds().filter((id) => id === q.categoryId) } : { $in: activeCategoryIds() } };
  if (q.companyId && /^[a-f0-9]{24}$/.test(q.companyId)) filter.companyId = new ObjectId(q.companyId);
  const docs = await (await col()).find(filter as never).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit + 1).toArray();
  return { items: docs.slice(0, limit).map(view), hasMore: docs.length > limit };
}

export async function getPublishedBySlug(slug: string): Promise<PublishedProduct | null> {
  if (!/^[a-z0-9-]{1,140}$/.test(slug)) return null;
  const d = await (await col()).findOne({ slug, "publication.state": "APPROVED" });
  if (!d) return null;
  const cat = (d.publication!.snapshot as Record<string, unknown>).categoryId;
  return isPubliclyEligible(d.publication?.state, getCategoryDirectory().nodes.some((n) => n.id === cat && n.isActive)) ? view(d) : null;
}
