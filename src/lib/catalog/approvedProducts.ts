import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { getProductsCollection } from "@/lib/supplier/productService";
import { supplierCompanies, companyKeyOf } from "@/lib/supplier/company";
import { UNITS, isPubliclyEligible } from "@/lib/supplier/productDraftRules";
import { getManagementCategories } from "./categories";
import { normalizeImage } from "./publicProduct";
import { markApprovedLoading, markApprovedStale, registerApprovedKick, setApproved, companyPublicSlug, getApproved, approvedLoadedAt, type ApprovedItem } from "./approvedStore";

/**
 * Loads the PUBLICLY ELIGIBLE supplier products into the in-memory snapshot (approvedStore). THE one eligibility rule, applied here and nowhere else:
 *   publication.state === "APPROVED"  AND  not archived/unpublished  AND  the category exists and is active  AND  the owning company is ACTIVE.
 * Content comes ONLY from `publication.snapshot` (the approved revision): draft edits, a pending revision, rejected content, review notes and documents are
 * never read (the query projects just the publication, ids and company). A pending edit therefore never replaces the live approved version.
 * Bounded: at most MAX_APPROVED products (an operational cap, reported by `capped`), one indexed query (`published_by_category`), one batched company query,
 * one batched user query: never per product. Freshness: TTL (FINBYN_APPROVED_CACHE_MS, default 60 s), an explicit `invalidateApproved()` after a decision,
 * and a non-blocking refresh when a reader finds the snapshot stale; a failed load keeps the previous snapshot and retries on the next reader.
 */
export const MAX_APPROVED = 2000;
const unitLabel = (code: string) => UNITS.find((u) => u.code === code)?.label ?? code;

export interface ApprovedLoadReport { loaded: number; skipped: Record<string, number>; capped: boolean }
let last: ApprovedLoadReport | null = null;
let inFlight: Promise<ApprovedLoadReport> | null = null;
export const lastApprovedReport = () => last;

export function isEligibleDoc(d: { publication?: { state?: string }; archivedAt?: Date | null }, categoryActive: boolean, companyActive: boolean): boolean {
  return isPubliclyEligible(d.publication?.state, categoryActive) && !d.archivedAt && companyActive;
}

export async function refreshApproved(): Promise<ApprovedLoadReport> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    markApprovedLoading(true);
    const skipped: Record<string, number> = {};
    const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);
    try {
      const docs = await (await getProductsCollection())
        .find({ "publication.state": "APPROVED" }, { projection: { slug: 1, companyId: 1, archivedAt: 1, publication: 1 } })
        .sort({ _id: 1 })
        .limit(MAX_APPROVED + 1)
        .toArray();
      const capped = docs.length > MAX_APPROVED;
      const slice = docs.slice(0, MAX_APPROVED);
      const cats = new Map(getManagementCategories().map((n) => [n.id, n]));
      const companyIds = [...new Set(slice.map((d) => d.companyId.toHexString()))].map((h) => new ObjectId(h));
      const companies = new Map((await (await supplierCompanies()).find({ _id: { $in: companyIds }, status: "ACTIVE" }, { projection: { ownerUserId: 1, createdAt: 1 } }).toArray()).map((c) => [c._id.toHexString(), c]));
      const users = new Map(
        (await (await getDb()).collection<{ _id: ObjectId; supplier?: { businessName?: string; city?: string; offering?: string } }>("users").find({ _id: { $in: [...companies.values()].map((c) => c.ownerUserId) } }, { projection: { supplier: 1 } }).toArray()).map((u) => [u._id.toHexString(), u.supplier]),
      );
      const items: ApprovedItem[] = [];
      for (const d of slice) {
        const s = d.publication!.snapshot as Record<string, unknown>;
        const node = cats.get(String(s.categoryId ?? ""));
        const company = companies.get(d.companyId.toHexString());
        if (!isEligibleDoc(d as never, Boolean(node?.isActive), Boolean(company))) { skip(!company ? "company-inactive" : !node ? "category-inactive" : "not-eligible"); continue; }
        const profile = users.get(company!.ownerUserId.toHexString());
        const name = String(s.name ?? "").trim();
        if (!name || !profile?.businessName) { skip("missing-name-or-supplier"); continue; }
        const images = ((s.images as { url?: string }[]) ?? []).flatMap((i) => { const n = normalizeImage(i.url); return n ? [{ ...n, alt: name }] : []; });
        const mode = s.pricingMode === "FIXED" && typeof s.unitPricePaise === "number" && s.unitPricePaise > 0 ? "FIXED" : "ON_REQUEST";
        const parts = node!.id.split("/");
        const hex = d.companyId.toHexString();
        items.push({
          id: `sp-${d._id.toHexString()}`,
          slug: d.slug,
          name,
          description: String(s.description ?? "").trim() || null,
          nodeId: node!.id,
          categoryName: node!.name,
          main: parts[0],
          sub: parts.length > 1 ? parts[parts.length - 1] : parts[0],
          images,
          pricing: { mode, min: mode === "FIXED" ? (s.unitPricePaise as number) / 100 : null, unit: unitLabel(String(s.priceUnit ?? "")) },
          moq: typeof s.moq === "number" && s.moq >= 1 && s.quantityUnit ? { quantity: s.moq, unit: unitLabel(String(s.quantityUnit)) } : null,
          supplier: { key: companyKeyOf(hex), slug: companyPublicSlug(hex), name: profile.businessName, city: (profile.city ?? "").trim(), companyId: hex, since: company!.createdAt ? String(company!.createdAt.getUTCFullYear()) : null, description: (profile.offering ?? "").trim() || null },
          approvedAt: d.publication!.approvedAt.toISOString(),
        });
      }
      setApproved(items);
      return (last = { loaded: items.length, skipped, capped });
    } catch (error) {
      // keep the previous snapshot; the next reader retries
      markApprovedStale();
      console.error("approved products not refreshed", (error as Error).message);
      return (last = { loaded: getApproved().items.length, skipped: { "load-failed": 1 }, capped: false });
    } finally {
      markApprovedLoading(false);
      inFlight = null;
    }
  })();
  return inFlight;
}

const building = () => process.env.NEXT_PHASE === "phase-production-build";
registerApprovedKick(() => {
  if (!building()) void refreshApproved();
});

/** Await a loaded snapshot (pages and APIs that must not miss a just-approved product). Cheap when one exists and is fresh. */
let failedAt = 0;
export async function ensureApproved(): Promise<void> {
  if (building()) return;
  // after a failed load, requests are not held up again for 15 s (the previous snapshot keeps answering)
  if (approvedLoadedAt() === 0 && Date.now() - failedAt > 15_000) {
    const r = await refreshApproved();
    if (r.skipped["load-failed"]) failedAt = Date.now();
  }
}

/** Called by the approval / unpublish code after its transaction commits: readers in this process see the change at once. Other instances converge within the TTL. */
export async function invalidateApproved(): Promise<void> {
  markApprovedStale();
  await refreshApproved().catch(() => undefined);
}
