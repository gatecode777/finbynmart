// category = the PRD target class (simple read < 300 ms, detail < 350, paginated listing < 400, filtered catalogue < 500, search < 500).
// The routes the benchmark exercises: public, read-only, no cookie. kind "api" = a route handler, "page" = a server page.
// The slugs exist in the seed data (shree-textiles has 29 products, sunrise-hub is a catalogue seller; 1758 is a catalogue product).
const CATALOG_SLUG = "lotto-men-white-collared-jacket-1758";

export const TARGETS = [
  // ---- APIs
  { name: "GET /api/public/products (page 1, limit 20)", path: "/api/public/products?limit=20", kind: "api", category: "listing" },
  { name: "GET /api/public/products (deep page 500)", path: "/api/public/products?limit=20&page=500", kind: "api", category: "listing" },
  { name: "GET /api/public/products (text search)", path: "/api/public/products?q=shirt&limit=20", kind: "api", category: "search" },
  { name: "GET /api/public/products (sort price)", path: "/api/public/products?sort=price-asc&limit=20", kind: "api", category: "filtered" },
  { name: "GET /api/public/products/suggest", path: "/api/public/products/suggest?q=jack", kind: "api", category: "simple" },
  { name: "GET /api/public/products/:slug (catalogue)", path: `/api/public/products/${CATALOG_SLUG}`, kind: "api", category: "detail" },
  { name: "GET /api/public/products/:slug (sample)", path: "/api/public/products/cotton-fabric", kind: "api", category: "detail" },
  { name: "GET /api/public/products/:slug/related", path: `/api/public/products/${CATALOG_SLUG}/related`, kind: "api", category: "simple" },
  { name: "GET /api/public/suppliers (directory)", path: "/api/public/suppliers?limit=20", kind: "api", category: "listing" },
  { name: "GET /api/public/suppliers/:slug (sample)", path: "/api/public/suppliers/shree-textiles", kind: "api", category: "detail" },
  { name: "GET /api/public/suppliers/:slug/products (merged)", path: "/api/public/suppliers/shree-textiles/products?limit=20", kind: "api", category: "listing" },
  { name: "GET /api/public/suppliers/:slug/products (catalogue)", path: "/api/public/suppliers/sunrise-hub/products?limit=20", kind: "api", category: "listing" },
  { name: "GET /api/public/suppliers/:slug/reviews", path: "/api/public/suppliers/shree-textiles/reviews", kind: "api", category: "listing" },
  { name: "GET /api/public/suppliers/:slug/reviews/summary", path: "/api/public/suppliers/shree-textiles/reviews/summary", kind: "api", category: "simple" },
  { name: "GET /api/public/suppliers/:slug/certifications", path: "/api/public/suppliers/shree-textiles/certifications", kind: "api", category: "listing" },
  // ---- pages (server rendered)
  { name: "PAGE /", path: "/", kind: "page", category: "detail" },
  { name: "PAGE /products", path: "/products", kind: "page", category: "listing" },
  { name: "PAGE /products?page=500", path: "/products?page=500", kind: "page", category: "listing" },
  { name: "PAGE /search?q=shirt", path: "/search?q=shirt", kind: "page", category: "search" },
  { name: "PAGE /products/:slug (sample)", path: "/products/cotton-fabric", kind: "page", category: "detail" },
  { name: "PAGE /products/:slug (catalogue)", path: `/products/${CATALOG_SLUG}`, kind: "page", category: "detail" },
  { name: "PAGE /suppliers", path: "/suppliers", kind: "page", category: "listing" },
  { name: "PAGE /suppliers/:slug (profile)", path: "/suppliers/shree-textiles", kind: "page", category: "detail" },
  { name: "PAGE /suppliers/:slug/products (merged)", path: "/suppliers/shree-textiles/products", kind: "page", category: "listing" },
  { name: "PAGE /suppliers/:slug/products (catalogue)", path: "/suppliers/sunrise-hub/products", kind: "page", category: "listing" },
  { name: "PAGE /suppliers/:slug/reviews", path: "/suppliers/shree-textiles/reviews", kind: "page", category: "listing" },
  { name: "PAGE /suppliers/:slug/certifications", path: "/suppliers/shree-textiles/certifications", kind: "page", category: "listing" },
  { name: "PAGE /inquiry/:slug", path: "/inquiry/shree-textiles", kind: "page", category: "detail" },
  { name: "PAGE /categories", path: "/categories", kind: "page", category: "detail" },
  { name: "PAGE /categories/:slug", path: "/categories/apparel-fashion", kind: "page", category: "listing" },
];
