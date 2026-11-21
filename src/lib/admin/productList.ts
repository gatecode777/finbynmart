/**
 * Admin Product Management: the client-safe CONTRACT of the product list (types, filters, URL state). No server code here.
 *
 * Listing status is DERIVED from facts the product model already stores, never a new persisted status:
 *   PUBLISHED       publication.state = APPROVED and not unpublished/archived
 *   PENDING_REVIEW  a submitted revision awaits a decision (draft.review.state = PENDING) and nothing is published
 *   UNPUBLISHED     an approved listing that was taken down (archivedAt set)
 *   REJECTED        the submitted revision was rejected and nothing is published
 * `pendingChanges` is true for a PUBLISHED listing whose newer revision is under review (the live content is still the approved one).
 * A supplier draft that was never submitted is not visible to admins and is not in this list.
 *
 * The read API this page expects is documented in docs/admin/PRODUCT_MANAGEMENT_FRONTEND.md (it does not exist yet).
 */
export const LISTING_STATUSES = [
  { value: "PUBLISHED", label: "Published" },
  { value: "PENDING_REVIEW", label: "Pending review" },
  { value: "UNPUBLISHED", label: "Unpublished" },
  { value: "REJECTED", label: "Rejected" },
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number]["value"];
export const statusLabel = (s: ListingStatus): string => LISTING_STATUSES.find((x) => x.value === s)?.label ?? s;

export const SORTS = [
  { value: "updated", label: "Last updated" },
  { value: "name", label: "Name (A to Z)" },
] as const;
export type ProductSort = (typeof SORTS)[number]["value"];

export const PAGE_SIZE = 20;

export interface ProductRow {
  reference: string;
  name: string;
  sku: string | null;
  company: string;
  category: string;
  /** Neutral fallback is shown when null or when the image fails to load. */
  imageUrl: string | null;
  /** Pre-formatted by the server from the approved snapshot ("₹120 / metre", "Price on request"); null when unknown. */
  priceText: string | null;
  moqText: string | null;
  status: ListingStatus;
  pendingChanges: boolean;
  updatedAt: string;
  /** What THIS admin may do with the row, decided by the server from the capability, the source and the current state. */
  actions: { unpublish: boolean };
}

export interface ProductDetail extends ProductRow {
  images: { url: string; name: string }[];
  specifications: { label: string; value: string }[];
  /** When the live (approved) content was approved, if published. */
  approvedAt: string | null;
  unpublishedAt: string | null;
  /** The approved revision number: sent back as expectedRevision when unpublishing (a stale one is refused with 409). */
  revision: number | null;
  /** The real public route, only while the product is effectively public. */
  publicUrl: string | null;
  /** Why the listing is or is not public, in words. */
  visibilityNote: string;
  /** A newer submitted revision awaiting review: only for admins who may read review data (products.review), else null. */
  pending: { revision: number; submittedAt: string } | null;
  /** The internal unpublish reason: shown only to admins with the unpublish capability. */
  unpublishReason: string | null;
}

export interface ProductListQuery {
  q: string;
  status: ListingStatus | "";
  category: string;
  supplier: string;
  sort: ProductSort;
  page: number;
}

export interface ProductListResponse {
  items: ProductRow[];
  meta: { page: number; limit: number; total: number | null; hasMore: boolean };
  /** Options for the category and supplier filters, from the same repository (never derived from the current page). */
  facets: { categories: { value: string; label: string }[]; suppliers: { value: string; label: string }[] };
}

export const EMPTY_QUERY: ProductListQuery = { q: "", status: "", category: "", supplier: "", sort: "updated", page: 1 };

export function parseQuery(sp: URLSearchParams): ProductListQuery {
  const status = sp.get("status") ?? "";
  const sort = sp.get("sort") ?? "";
  const page = Number(sp.get("page"));
  return {
    q: (sp.get("q") ?? "").slice(0, 80),
    status: LISTING_STATUSES.some((s) => s.value === status) ? (status as ListingStatus) : "",
    category: (sp.get("category") ?? "").slice(0, 80),
    supplier: (sp.get("supplier") ?? "").slice(0, 80),
    sort: SORTS.some((s) => s.value === sort) ? (sort as ProductSort) : "updated",
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

/** Only non-default values are written, so the URL of an unfiltered list is clean. */
export function toParams(q: ProductListQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.q.trim()) p.set("q", q.q.trim());
  if (q.status) p.set("status", q.status);
  if (q.category) p.set("category", q.category);
  if (q.supplier) p.set("supplier", q.supplier);
  if (q.sort !== "updated") p.set("sort", q.sort);
  if (q.page > 1) p.set("page", String(q.page));
  return p;
}

export const isFiltered = (q: ProductListQuery): boolean => Boolean(q.q.trim() || q.status || q.category || q.supplier);

export const UNPUBLISH_REASON = { min: 10, max: 500 } as const;
export function validateUnpublishReason(reason: string): string | null {
  const t = reason.trim();
  if (t.length < UNPUBLISH_REASON.min) return `Write at least ${UNPUBLISH_REASON.min} characters explaining why this listing is being unpublished.`;
  if (t.length > UNPUBLISH_REASON.max) return `Use at most ${UNPUBLISH_REASON.max} characters.`;
  return null;
}

// ---------- pure rules shared by the server and the tests ----------
/** Derive the listing status from facts the model already stores (see the header). Draft that was never submitted has no admin status (null). */
export function deriveListing(d: { publicationApproved: boolean; archived: boolean; reviewState?: string }): { status: ListingStatus; pendingChanges: boolean } | null {
  if (d.publicationApproved) return d.archived ? { status: "UNPUBLISHED", pendingChanges: false } : { status: "PUBLISHED", pendingChanges: d.reviewState === "PENDING" };
  if (d.reviewState === "PENDING") return { status: "PENDING_REVIEW", pendingChanges: false };
  if (d.reviewState === "REJECTED") return { status: "REJECTED", pendingChanges: false };
  return null;
}

/** Effective public visibility: approved AND not unpublished. (The loader adds category and company eligibility on top.) */
export const isEffectivelyPublic = (d: { publicationApproved: boolean; archived: boolean }): boolean => d.publicationApproved && !d.archived;

/** Supported actions: unpublish exists only for a live supplier-created listing and only with the capability. */
export const canUnpublishRow = (status: ListingStatus, hasCapability: boolean): boolean => hasCapability && status === "PUBLISHED";

const UNIT_LABEL: Record<string, string> = { piece: "piece", metre: "metre", kg: "kg", tonne: "tonne", roll: "roll", box: "box", set: "set" };
/** Exact price text from integer paise (no floating point): "₹120", "₹120.50 / metre", or "Price on request". Null when the snapshot has neither a valid price nor on-request. */
export function priceText(s: { pricingMode?: unknown; unitPricePaise?: unknown; priceUnit?: unknown }): string | null {
  if (s.pricingMode === "ON_REQUEST") return "Price on request";
  if (s.pricingMode !== "FIXED" || typeof s.unitPricePaise !== "number" || !Number.isInteger(s.unitPricePaise) || s.unitPricePaise <= 0) return null;
  const rupees = Math.floor(s.unitPricePaise / 100);
  const paise = s.unitPricePaise % 100;
  const unit = typeof s.priceUnit === "string" && UNIT_LABEL[s.priceUnit] ? ` / ${UNIT_LABEL[s.priceUnit]}` : "";
  return `₹${rupees.toLocaleString("en-IN")}${paise ? `.${String(paise).padStart(2, "0")}` : ""}${unit}`;
}
export function moqText(s: { moq?: unknown; quantityUnit?: unknown }): string | null {
  if (typeof s.moq !== "number" || !Number.isInteger(s.moq) || s.moq < 1) return null;
  const unit = typeof s.quantityUnit === "string" && UNIT_LABEL[s.quantityUnit] ? ` ${UNIT_LABEL[s.quantityUnit]}` : "";
  return `MOQ ${s.moq.toLocaleString("en-IN")}${unit}`;
}
