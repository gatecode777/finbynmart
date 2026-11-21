/**
 * DEMO FIXTURES for the Admin Product Management frontend. Illustrative records only: they are never real admin data, are never returned by any API and are loaded
 * (dynamic import) only when the page is opened by an authenticated admin in a non-production build with ?preview=demo. Filtering, sorting and paging below are a local
 * frontend demonstration of the contract, not a backend.
 */
import { PAGE_SIZE, type ListingStatus, type ProductDetail, type ProductListQuery, type ProductListResponse } from "./productList";

const mk = (n: number, name: string, company: string, category: string, status: ListingStatus, over: Partial<ProductDetail> = {}): ProductDetail => ({
  reference: `demo-${String(n).padStart(3, "0")}`,
  name,
  sku: `DEMO-${String(n).padStart(3, "0")}`,
  company,
  category,
  imageUrl: null,
  priceText: "₹120 / metre",
  moqText: "MOQ 100 m",
  status,
  pendingChanges: false,
  updatedAt: new Date(Date.UTC(2026, 10, 20 - n, 9, 30)).toISOString(),
  images: [],
  specifications: [{ label: "Composition", value: "100% cotton" }, { label: "Weight (GSM)", value: "120 g/m²" }, { label: "Width", value: "58 inch" }],
  approvedAt: status === "PUBLISHED" || status === "UNPUBLISHED" ? new Date(Date.UTC(2026, 10, 10 - n, 9, 0)).toISOString() : null,
  unpublishedAt: status === "UNPUBLISHED" ? new Date(Date.UTC(2026, 10, 12 - n, 9, 0)).toISOString() : null,
  revision: status === "PUBLISHED" || status === "UNPUBLISHED" ? 1 : null,
  publicUrl: status === "PUBLISHED" ? "/products" : null,
  visibilityNote: status === "PUBLISHED" ? "Public: the approved version is live." : "Demo record.",
  pending: null,
  unpublishReason: null,
  actions: { unpublish: status === "PUBLISHED" },
  ...over,
});

export const DEMO_PRODUCTS: ProductDetail[] = [
  mk(1, "Cotton poplin fabric", "Example Textiles", "Cotton Fabric", "PUBLISHED"),
  mk(2, "Linen blend fabric", "Sample Fabrics", "Blended Fabric", "PENDING_REVIEW", { priceText: "Price on request", moqText: "MOQ 50 m", approvedAt: null }),
  mk(3, "Printed cotton fabric", "Example Mills", "Printed Fabric", "UNPUBLISHED", { priceText: "₹145 / metre" }),
  mk(4, "Polyester suiting fabric with an unusually long product name that must wrap inside its cell without breaking the layout", "Example Textiles With A Very Long Company Name Private Limited", "Suiting Fabric", "PUBLISHED", { sku: null, moqText: null, specifications: [] }),
  mk(5, "Denim fabric 12 oz", "Sample Fabrics", "Denim", "PUBLISHED", { pendingChanges: true, priceText: "₹210 / metre" }),
  mk(6, "Viscose rayon fabric", "Example Mills", "Blended Fabric", "REJECTED", { approvedAt: null, priceText: null }),
];

const FACETS = {
  categories: [...new Set(DEMO_PRODUCTS.map((p) => p.category))].sort().map((c) => ({ value: c, label: c })),
  suppliers: [...new Set(DEMO_PRODUCTS.map((p) => p.company))].sort().map((c) => ({ value: c, label: c })),
};

export async function demoList(q: ProductListQuery): Promise<ProductListResponse> {
  await new Promise((r) => setTimeout(r, 250)); // a visible loading state in the preview
  const term = q.q.trim().toLowerCase();
  const rows = DEMO_PRODUCTS.filter((p) => (!q.status || p.status === q.status) && (!q.category || p.category === q.category) && (!q.supplier || p.company === q.supplier) && (!term || `${p.name} ${p.sku ?? ""} ${p.reference}`.toLowerCase().includes(term)));
  rows.sort(q.sort === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const start = (q.page - 1) * PAGE_SIZE;
  return { items: rows.slice(start, start + PAGE_SIZE), meta: { page: q.page, limit: PAGE_SIZE, total: rows.length, hasMore: start + PAGE_SIZE < rows.length }, facets: FACETS };
}

export async function demoDetail(reference: string): Promise<ProductDetail | null> {
  await new Promise((r) => setTimeout(r, 150));
  return DEMO_PRODUCTS.find((p) => p.reference === reference) ?? null;
}
