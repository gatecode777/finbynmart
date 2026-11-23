"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Package,
  PackageSearch,
  Plus,
  Search,
  Tag,
} from "lucide-react";
import type { SupplierProductItem, SupplierProductsResult } from "@/lib/supplier/productService";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import inq from "@/components/buyer/inquiries/Inquiries.module.css";
import styles from "../profile/SupplierProfile.module.css";

export function SupplierProductsWorkspace({
  initial,
}: {
  initial: SupplierProductsResult;
}) {
  const [data, setData] = useState<SupplierProductsResult>(initial);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc" | "name_asc">("newest");
  const [page, setPage] = useState(1);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  const fetchProducts = useCallback(
    async (params: { q?: string; category?: string; status?: string; sort?: string; page?: number }) => {
      const sp = new URLSearchParams();
      if (params.q) sp.set("q", params.q);
      if (params.category && params.category !== "all") sp.set("category", params.category);
      if (params.status && params.status !== "all") sp.set("status", params.status);
      if (params.sort) sp.set("sort", params.sort);
      if (params.page && params.page > 1) sp.set("page", String(params.page));

      const res = await fetch(`/api/supplier/products?${sp.toString()}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) {
        const json = await res.json();
        if (json.ok) setData(json.data);
      }
    },
    []
  );

  const handleSearch = (val: string) => {
    setQ(val);
    setPage(1);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchProducts({ q: val, category, status, sort, page: 1 });
    }, 300);
  };

  const handleFilterChange = (updates: { category?: string; status?: string; sort?: typeof sort; page?: number }) => {
    const nextCat = updates.category ?? category;
    const nextStatus = updates.status ?? status;
    const nextSort = updates.sort ?? sort;
    const nextPage = updates.page ?? 1;

    if (updates.category) setCategory(updates.category);
    if (updates.status) setStatus(updates.status);
    if (updates.sort) setSort(updates.sort);
    setPage(nextPage);

    fetchProducts({ q, category: nextCat, status: nextStatus, sort: nextSort, page: nextPage });
  };

  const statusBadge = (s: SupplierProductItem["status"]) => {
    switch (s) {
      case "ACTIVE":
        return <span className={dash.badgeOk}><CheckCircle2 size={13} aria-hidden /> In Stock</span>;
      case "LOW_STOCK":
        return <span className={dash.badgeWarn}>Low Stock</span>;
      case "OUT_OF_STOCK":
        return <span className={dash.badgeError}>Out of Stock</span>;
      default:
        return <span className={dash.badgeWarn}>Draft</span>;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Summary KPI Cards */}
      <div className={inq.kpis} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div className={dash.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary, #526563)" }}>Total Products</span>
            <Package size={20} style={{ color: "var(--primary, #04534f)" }} aria-hidden />
          </div>
          <strong style={{ display: "block", fontSize: "1.75rem", color: "var(--text-primary, #183a38)", marginTop: "4px" }}>
            {data.summary.total}
          </strong>
        </div>

        <div className={dash.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary, #526563)" }}>Active Listings</span>
            <CheckCircle2 size={20} style={{ color: "#059669" }} aria-hidden />
          </div>
          <strong style={{ display: "block", fontSize: "1.75rem", color: "#059669", marginTop: "4px" }}>
            {data.summary.active}
          </strong>
        </div>

        <div className={dash.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary, #526563)" }}>In Stock</span>
            <Boxes size={20} style={{ color: "#0284c7" }} aria-hidden />
          </div>
          <strong style={{ display: "block", fontSize: "1.75rem", color: "#0284c7", marginTop: "4px" }}>
            {data.summary.inStock}
          </strong>
        </div>

        <div className={dash.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary, #526563)" }}>Categories</span>
            <Tag size={20} style={{ color: "#d97706" }} aria-hidden />
          </div>
          <strong style={{ display: "block", fontSize: "1.75rem", color: "#d97706", marginTop: "4px" }}>
            {data.summary.categories}
          </strong>
        </div>
      </div>

      {/* Main Workspace Card */}
      <section className={dash.card} aria-label="Product listings table">
        {/* Actions & Filters Bar */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", flex: "1 1 300px" }}>
            <div style={{ position: "relative", flex: "1 1 240px" }}>
              <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} aria-hidden />
              <input
                type="search"
                placeholder="Search products by title or SKU..."
                value={q}
                onChange={(e) => handleSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px 9px 36px",
                  border: "1px solid var(--border, #dce8e5)",
                  borderRadius: "8px",
                  fontSize: "0.875rem",
                }}
              />
            </div>

            <select
              value={category}
              onChange={(e) => handleFilterChange({ category: e.target.value })}
              style={{ padding: "9px 12px", border: "1px solid var(--border, #dce8e5)", borderRadius: "8px", fontSize: "0.875rem" }}
            >
              <option value="all">All Categories</option>
              {data.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) => handleFilterChange({ status: e.target.value })}
              style={{ padding: "9px 12px", border: "1px solid var(--border, #dce8e5)", borderRadius: "8px", fontSize: "0.875rem" }}
            >
              <option value="all">All Statuses</option>
              <option value="ACTIVE">In Stock</option>
              <option value="LOW_STOCK">Low Stock</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
            </select>

            <select
              value={sort}
              onChange={(e) => handleFilterChange({ sort: e.target.value as typeof sort })}
              style={{ padding: "9px 12px", border: "1px solid var(--border, #dce8e5)", borderRadius: "8px", fontSize: "0.875rem" }}
            >
              <option value="newest">Newest First</option>
              <option value="name_asc">Name (A-Z)</option>
              <option value="price_asc">Price (Low to High)</option>
              <option value="price_desc">Price (High to Low)</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <Link prefetch={false} href="/supplier/products/new" className={styles.btnGold}>
              <Plus size={16} aria-hidden /> Add New Product
            </Link>
          </div>
        </div>

        {/* Table View */}
        {data.items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary, #526563)" }}>
            <PackageSearch size={48} style={{ margin: "0 auto 12px", opacity: 0.5, color: "var(--primary, #04534f)" }} aria-hidden />
            <h3 style={{ margin: "0 0 6px", fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary, #183a38)" }}>
              No Products Found
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "0.875rem" }}>
              {q || category !== "all" || status !== "all"
                ? "Try adjusting your search filters to find what you are looking for."
                : "Your supplier catalog does not have any products listed yet. Click below to add your first product."}
            </p>
            <Link prefetch={false} href="/supplier/products/new" className={styles.btnGold}>
              <Plus size={16} aria-hidden /> Add Your First Product
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className={styles.docsTable} style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8faf9", textAlign: "left", fontSize: "0.8125rem" }}>
                  <th style={{ padding: "12px 14px" }}>Product</th>
                  <th style={{ padding: "12px 14px" }}>SKU</th>
                  <th style={{ padding: "12px 14px" }}>Category</th>
                  <th style={{ padding: "12px 14px" }}>Price</th>
                  <th style={{ padding: "12px 14px" }}>Stock</th>
                  <th style={{ padding: "12px 14px" }}>Status</th>
                  <th style={{ padding: "12px 14px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--border, #dce8e5)" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imageUrl}
                            alt=""
                            style={{ width: "42px", height: "42px", borderRadius: "6px", objectFit: "cover", flex: "none", background: "#f1f5f9" }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "42px",
                              height: "42px",
                              borderRadius: "6px",
                              background: "var(--light-mint, #eaf5f3)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--primary, #04534f)",
                              flex: "none",
                            }}
                          >
                            <Package size={20} aria-hidden />
                          </div>
                        )}
                        <div>
                          <strong style={{ display: "block", color: "var(--text-primary, #183a38)", fontSize: "0.875rem" }}>
                            {p.name}
                          </strong>
                          {p.description && (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary, #526563)", display: "block", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {p.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: "0.8125rem", color: "var(--text-secondary, #526563)" }}>
                      {p.sku}
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: "0.8125rem" }}>
                      <span className={styles.chip} style={{ margin: 0, padding: "2px 8px" }}>
                        {p.categoryName}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", fontWeight: 600, color: "var(--text-primary, #183a38)" }}>
                      ₹{p.price.toLocaleString("en-IN")}
                      <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--text-secondary, #526563)" }}>
                        {" "}
                        / {p.unit}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: "0.875rem", fontWeight: 500 }}>
                      {p.stock === null ? "Not tracked" : `${p.stock} ${p.unit}s`}
                    </td>
                    <td style={{ padding: "12px 14px" }}>{statusBadge(p.status)}</td>
                    <td style={{ padding: "12px 14px" }}>
                      {p.status === "DRAFT" && !p.isCatalog ? (
                        <Link prefetch={false} href={`/supplier/products/${p.id}/edit`} className={styles.btnSecondary} style={{ padding: "4px 8px", fontSize: "0.75rem" }}>
                          Edit draft
                        </Link>
                      ) : (
                        <Link prefetch={false} href={`/products/${p.slug}`} target="_blank" rel="noreferrer" className={styles.btnSecondary} style={{ padding: "4px 8px", fontSize: "0.75rem" }}>
                          <ExternalLink size={13} aria-hidden /> View
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data.meta.totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border, #dce8e5)" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary, #526563)" }}>
              Showing {data.items.length} of {data.meta.totalCount} products
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                className={styles.btnSecondary}
                style={{ padding: "6px 10px" }}
                disabled={page <= 1}
                onClick={() => handleFilterChange({ page: page - 1 })}
              >
                <ChevronLeft size={16} aria-hidden /> Previous
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                style={{ padding: "6px 10px" }}
                disabled={page >= data.meta.totalPages}
                onClick={() => handleFilterChange({ page: page + 1 })}
              >
                Next <ChevronRight size={16} aria-hidden />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
