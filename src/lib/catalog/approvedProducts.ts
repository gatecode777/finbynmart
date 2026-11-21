import { ObjectId } from "mongodb";
import { displayAttributes, validateAttributes } from "./attributes";
import { getDb } from "@/lib/db/mongo";
import { getProductsCollection } from "@/lib/supplier/productService";
import { supplierCompanies, companyKeyOf } from "@/lib/supplier/company";
import { companyActiveNow } from "@/lib/supplier/companyEligibility";
import { setDeactivatedCategories } from "./approvedStore";
import { effectiveOf } from "@/lib/verification/identity";
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

/** The administratively deactivated main categories, read from the database into the in-memory overlay. A failed read keeps the LAST known set (a deactivation is never lost to a refresh failure). */
export async function loadCategoryOverlay(): Promise<void> {
  try {
    const docs = await (await getDb()).collection<{ _id: string }>("category_overrides").find({ isActive: false }, { projection: { _id: 1 } }).limit(500).toArray();
    setDeactivatedCategories(docs.map((d) => d._id));
  } catch (error) {
    console.error("category overlay not refreshed", (error as Error).message);
  }
}

/** Authorization-grade: is this MAIN category active, read from the database (never from the cached overlay)? Used before a new inquiry or a lead commit. */
export async function categoryActiveNow(id: string, session?: import("mongodb").ClientSession): Promise<boolean> {
  const main = id.split("/")[0];
  return !(await (await getDb()).collection("category_overrides").findOne({ _id: main as never, isActive: false }, { projection: { _id: 1 }, session }));
}

export async function refreshApproved(): Promise<ApprovedLoadReport> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    markApprovedLoading(true);
    // the activation overlay first: the directory built below (management categories, eligibility) must already reflect it
    await loadCategoryOverlay();
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
      const companies = new Map((await (await supplierCompanies()).find({ _id: { $in: companyIds }, status: "ACTIVE" }, { projection: { ownerUserId: 1, createdAt: 1, verificationStatus: 1, verification: 1, displayName: 1, businessType: 1, country: 1, state: 1, city: 1 } }).toArray()).map((c) => [c._id.toHexString(), c]));
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
        // specifications come from the approved snapshot only and are re-validated here: an invalid set is dropped whole, never shown, never defaulted
        const parsed = validateAttributes(node!.id, s.attributes ?? {}, { requireRequired: false });
        if (!parsed.ok) skip("attributes-invalid");
        const attributes = parsed.ok ? parsed.value : {};
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
          attributes,
          specs: displayAttributes(node!.id, attributes).map(({ label, value }) => ({ label, value })),
          pricing: { mode, min: mode === "FIXED" ? (s.unitPricePaise as number) / 100 : null, unit: unitLabel(String(s.priceUnit ?? "")) },
          moq: typeof s.moq === "number" && s.moq >= 1 && s.quantityUnit ? { quantity: s.moq, unit: unitLabel(String(s.quantityUnit)) } : null,
          supplier: { key: companyKeyOf(hex), slug: companyPublicSlug(hex), name: profile.businessName, city: (profile.city ?? "").trim(), companyId: hex, since: company!.createdAt ? String(company!.createdAt.getUTCFullYear()) : null, description: (profile.offering ?? "").trim() || null, verified: effectiveOf(company as never, { supplier: { businessName: profile.businessName, city: profile.city } }, null).publicBadge },
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
/**
 * Authorization-grade eligibility of ONE supplier product, read from the database (never from the cached snapshot): an admin unpublish takes effect here at once, on every instance.
 * Used before a new inquiry or requirement is accepted and before a matching lead is created. Anything that is not a supplier product key is not this function's concern (true).
 */
export async function isProductPublicNow(productKey: string, session?: import("mongodb").ClientSession): Promise<boolean> {
  if (!productKey.startsWith("sp-")) return true;
  if (!/^sp-[a-f0-9]{24}$/.test(productKey)) return false;
  const d = await (await getProductsCollection()).findOne({ _id: new ObjectId(productKey.slice(3)), "publication.state": "APPROVED", archivedAt: { $exists: false } }, { projection: { _id: 1, companyId: 1, "publication.snapshot.categoryId": 1 }, session });
  // the product's own restrictions, its owning company being ACTIVE and its category being active are three separate facts, all required
  const category = String((d?.publication?.snapshot as { categoryId?: string } | undefined)?.categoryId ?? "");
  return Boolean(d) && (await companyActiveNow(d!.companyId, session)) && (!category || (await categoryActiveNow(category, session)));
}

export const APPROVED_WAIT_MS = 1500;
export async function ensureApproved(): Promise<void> {
  if (building()) return;
  // after a failed or slow load, requests are not held up again for 15 s: the previous (possibly empty) snapshot keeps answering and the load continues in the background
  if (approvedLoadedAt() === 0 && Date.now() - failedAt > 15_000) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = refreshApproved();
    const r = await Promise.race([load, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), APPROVED_WAIT_MS); })]);
    if (timer) clearTimeout(timer);
    if (r === null || r.skipped["load-failed"]) failedAt = Date.now();
  }
}

/** Called by the approval / unpublish code after its transaction commits: readers in this process see the change at once. Other instances converge within the TTL. */
export async function invalidateApproved(): Promise<void> {
  markApprovedStale();
  await refreshApproved().catch(() => undefined);
}
