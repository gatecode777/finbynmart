/**
 * The in-memory snapshot of PUBLICLY ELIGIBLE supplier products (loaded by approvedProducts.ts). Kept free of database imports so the synchronous catalogue
 * engine (categories, listing, detail, supplier profile) can read it. Content here is only ever the approved publication snapshot, in an allow-listed shape.
 * Freshness: the snapshot is replaced as a whole (version + 1) by the loader; readers see the last complete one. A stale snapshot triggers a non-blocking refresh.
 */
import type { ProductCardData } from "@/types";

export interface ApprovedImage { src: string; remote: boolean; alt: string }
export interface ApprovedSupplier { key: string; slug: string; name: string; city: string; companyId: string; since: string | null; description: string | null }
export interface ApprovedItem {
  /** Public product id: "sp-" + the product id (never all digits, so it cannot be mistaken for a catalogue id). */
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** Directory node id (a slug path such as "industrial-machinery" or "apparel-fashion/men/men-tshirts"). */
  nodeId: string;
  categoryName: string;
  main: string;
  sub: string;
  images: ApprovedImage[];
  pricing: { mode: "FIXED" | "ON_REQUEST"; min: number | null; unit: string };
  moq: { quantity: number; unit: string } | null;
  supplier: ApprovedSupplier;
  approvedAt: string;
}

interface Snapshot {
  version: number;
  loadedAt: number;
  loading: boolean;
  items: ApprovedItem[];
  bySlug: Map<string, ApprovedItem>;
  byId: Map<string, ApprovedItem>;
  bySupplier: Map<string, ApprovedItem[]>;
  suppliers: Map<string, ApprovedSupplier>;
}
const g = globalThis as unknown as { __finbynApprovedV1?: Snapshot; __finbynApprovedKick?: () => void };
const empty = (): Snapshot => ({ version: 0, loadedAt: 0, loading: false, items: [], bySlug: new Map(), byId: new Map(), bySupplier: new Map(), suppliers: new Map() });
const state = () => (g.__finbynApprovedV1 ??= empty());

export const approvedTtlMs = (): number => {
  const v = Number(process.env.FINBYN_APPROVED_CACHE_MS);
  return Number.isFinite(v) && v >= 0 ? v : 60_000;
};

export function registerApprovedKick(fn: () => void): void {
  g.__finbynApprovedKick = fn;
}

/** The current snapshot. A stale one still answers (never blocks a synchronous caller) and starts a refresh. */
export function getApproved(): Snapshot {
  const s = state();
  if (!s.loading && Date.now() - s.loadedAt > approvedTtlMs()) g.__finbynApprovedKick?.();
  return s;
}
export const approvedVersion = (): number => state().version;
export const approvedLoadedAt = (): number => state().loadedAt;

export function markApprovedLoading(on: boolean): void {
  state().loading = on;
}
export function markApprovedStale(): void {
  state().loadedAt = 0;
}

/** Replace the snapshot as a whole. Duplicate ids / slugs are dropped (first wins) so identities stay unique. */
export function setApproved(items: ApprovedItem[]): void {
  const prev = state();
  const next = empty();
  next.version = prev.version + 1;
  next.loadedAt = Date.now();
  for (const it of items) {
    if (next.byId.has(it.id) || next.bySlug.has(it.slug)) continue;
    next.items.push(it);
    next.byId.set(it.id, it);
    next.bySlug.set(it.slug, it);
    next.suppliers.set(it.supplier.slug, it.supplier);
    const list = next.bySupplier.get(it.supplier.slug);
    if (list) list.push(it);
    else next.bySupplier.set(it.supplier.slug, [it]);
  }
  g.__finbynApprovedV1 = next;
}

/** Eligible products per directory node, counted once at every level of the node's path ("a" and "a/b" for an item in "a/b"). */
export function approvedCountsByNode(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const it of state().items) {
    const parts = it.nodeId.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const id = parts.slice(0, i).join("/");
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/** The listing card of an approved product. A product with no stated price carries priceOnRequest (priceMin 0 is never displayed). */
export const toApprovedCard = (it: ApprovedItem): ProductCardData => ({
  id: it.id,
  name: it.name,
  href: `/products/${it.slug}`,
  tile: { iconName: "Package", tint: "slate", ...(it.images[0] ? { imageSrc: it.images[0].src } : {}) },
  priceMin: it.pricing.min ?? 0,
  priceUnit: it.pricing.unit,
  ...(it.pricing.mode === "ON_REQUEST" ? { priceOnRequest: true } : {}),
  ...(it.moq ? { moq: it.moq.quantity, moqUnit: it.moq.unit } : {}),
  supplierName: it.supplier.name,
  supplierHref: `/suppliers/${it.supplier.slug}`,
  supplierCity: it.supplier.city,
  supplierState: "",
});

export const companyPublicSlug = (companyId: string): string => `c-${companyId}`;
