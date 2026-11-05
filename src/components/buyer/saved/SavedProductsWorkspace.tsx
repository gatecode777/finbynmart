"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, LayoutGrid, List, Search, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/Modal";
import { flashToast } from "@/components/ui/Toast";
import { SAVED_SORTS } from "@/lib/wishlist/savedProductsRules";
import type { SavedProductItem, SavedProductsPage } from "@/lib/wishlist/savedProducts";
import inquiries from "../inquiries/Inquiries.module.css";
import { SavedProductCard } from "./SavedProductCard";
import styles from "./Saved.module.css";

export interface SavedParams {
  q: string;
  category: string;
  sort: string;
  page: number;
}

const DEFAULTS: SavedParams = { q: "", category: "", sort: "recent", page: 1 };
const KEYS = ["q", "category", "sort", "page"] as const;
const DEBOUNCE_MS = 300;
const VIEW_KEY = "finbyn.saved.view";

function toQuery(p: SavedParams): URLSearchParams {
  const sp = new URLSearchParams();
  for (const key of KEYS) {
    const value = p[key];
    if (value !== "" && value !== DEFAULTS[key]) sp.set(key, String(value));
  }
  return sp;
}

function paramsFromUrl(): SavedParams {
  const sp = new URLSearchParams(window.location.search);
  const page = Number(sp.get("page"));
  return { q: sp.get("q") ?? "", category: sp.get("category") ?? "", sort: sp.get("sort") ?? "recent", page: Number.isInteger(page) && page >= 1 ? page : 1 };
}

function pageNumbers(current: number, total: number): (number | "gap")[] {
  const set = new Set([1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

interface Props {
  initial: SavedProductsPage;
  initialParams: SavedParams;
  /** When the server built the page (ms): an old value means the browser restored it from its cache, so it is read again. */
  renderedAt: number;
}

/**
 * The buyer's Saved Products. The first page is read on the server; every change (category, search, sort, page, removal) asks the
 * buyer-scoped API again, ignores answers overtaken by a newer request, and keeps the choices in the address. A removal is shown only
 * after the server confirmed it. Each card has a Compare button (the comparison list is its own page, /buyer/compare-products).
 */
export function SavedProductsWorkspace({ initial, initialParams, renderedAt }: Props) {
  const [params, setParams] = useState(initialParams);
  const [search, setSearch] = useState(initialParams.q);
  const [data, setData] = useState(initial);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(false);
  const [removing, setRemoving] = useState<SavedProductItem | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const first = useRef(true);
  const latest = useRef(params);
  latest.current = params;

  const load = useCallback(async (p: SavedParams) => {
    const mine = ++request.current;
    setLoading(true);
    setError(false);
    const timer = window.setTimeout(() => mine === request.current && setSlow(true), 250);
    const res = await fetch(`/api/buyer/saved-products?${toQuery(p)}`, { cache: "no-store" }).catch(() => null);
    window.clearTimeout(timer);
    if (mine !== request.current) return;
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setLoading(false);
    setSlow(false);
    if (!body?.ok) {
      setError(true);
      return;
    }
    const result = body.data as SavedProductsPage;
    if (result.items.length === 0 && p.page > 1) {
      // the last item of this page was removed: show the last page that still has items
      const back = { ...p, page: Math.max(1, Math.min(p.page - 1, result.totalPages || 1)) };
      setParams(back);
      return;
    }
    setData(result);
    const qs = toQuery(p).toString();
    window.history.replaceState(window.history.state, "", qs ? `/buyer/saved-products?${qs}` : "/buyer/saved-products");
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void load(params);
  }, [params, load]);

  // Back/Forward can hand over the page built earlier; the address wins, and an old page is read again
  useEffect(() => {
    const fromUrl = paramsFromUrl();
    const same = KEYS.every((k) => fromUrl[k] === initialParams[k]);
    const stale = Math.abs(Date.now() - renderedAt) > 15_000;
    if (same && !stale) return;
    setSearch(fromUrl.q);
    if (same) void load(fromUrl);
    else setParams(fromUrl);
  }, [initialParams, renderedAt, load]);

  useEffect(() => {
    if (search === latest.current.q) return;
    const timer = window.setTimeout(() => setParams((p) => ({ ...p, q: search, page: 1 })), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(VIEW_KEY) === "list") setView("list");
    } catch {
      /* storage can be blocked: the grid stays */
    }
    const refresh = () => void load(latest.current);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);

  const chooseView = (next: "grid" | "list") => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  };
  const change = (patch: Partial<SavedParams>) => setParams((p) => ({ ...p, page: 1, ...patch }));

  async function confirmRemove() {
    if (!removing || busy) return;
    setBusy(true);
    setRemoveError("");
    const res = await fetch(`/api/buyer/wishlist/${encodeURIComponent(removing.key)}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      flashToast("success", "Removed from your saved products.");
      setRemoving(null);
      void load(latest.current);
      return;
    }
    setRemoveError(res ? "It could not be removed. Try again." : "Could not reach the server. Nothing was changed.");
  }

  const { items, categories, total, totalSaved, page, limit, totalPages } = data;
  const firstRow = total === 0 ? 0 : (page - 1) * limit + 1;
  const lastRow = Math.min(page * limit, total);
  const filtered = params.q !== "" || params.category !== "";

  return (
    <>
      <div className={inquiries.tabs} role="group" aria-label="Filter saved products by category">
        <button type="button" className={clsx(inquiries.tab, params.category === "" && inquiries.tabActive)} aria-pressed={params.category === ""} onClick={() => change({ category: "" })}>
          All Saved ({data.totalMatchingSearch.toLocaleString("en-IN")})
        </button>
        {categories.map((c) => (
          <button key={c.id} type="button" className={clsx(inquiries.tab, params.category === c.id && inquiries.tabActive)} aria-pressed={params.category === c.id} onClick={() => change({ category: c.id })}>
            {c.name} ({c.count.toLocaleString("en-IN")})
          </button>
        ))}
      </div>

      <div className={inquiries.toolbar}>
        <div className={inquiries.search} role="search">
          <Search className={inquiries.searchIcon} size={18} aria-hidden />
          <label htmlFor="saved-search" className="visually-hidden">Search your saved products</label>
          <input id="saved-search" type="search" className={inquiries.searchInput} placeholder="Search by product or supplier name..." value={search} maxLength={60} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
          {search && (
            <button type="button" className={inquiries.searchClear} aria-label="Clear search" onClick={() => { setSearch(""); setParams((p) => ({ ...p, q: "", page: 1 })); }}>
              <X size={18} aria-hidden />
            </button>
          )}
        </div>
        <label className="visually-hidden" htmlFor="saved-sort">Sort saved products</label>
        <select id="saved-sort" className={inquiries.select} value={params.sort} onChange={(e) => change({ sort: e.target.value })}>
          {SAVED_SORTS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
        </select>
        <div className={styles.viewToggle} role="group" aria-label="Choose how products are shown">
          <button type="button" className={clsx(styles.viewButton, view === "grid" && styles.viewActive)} aria-pressed={view === "grid"} aria-label="Grid view" onClick={() => chooseView("grid")}>
            <LayoutGrid size={18} aria-hidden />
          </button>
          <button type="button" className={clsx(styles.viewButton, view === "list" && styles.viewActive)} aria-pressed={view === "list"} aria-label="List view" onClick={() => chooseView("list")}>
            <List size={18} aria-hidden />
          </button>
        </div>
      </div>

      <div className={inquiries.results} aria-busy={loading} aria-live="polite">
        {error ? (
          <div className={inquiries.emptyBox} role="alert">
            <h2 className={inquiries.emptyTitle}>Your saved products could not be loaded</h2>
            <p className={inquiries.emptyText}>Nothing was changed. Check your connection and try again.</p>
            <button type="button" className={inquiries.btn} onClick={() => void load(params)}>Try again</button>
          </div>
        ) : loading && slow ? (
          <div aria-label="Loading your saved products">{[0, 1, 2, 3].map((i) => <div key={i} className={inquiries.skeletonRow} />)}</div>
        ) : items.length === 0 ? (
          totalSaved === 0 ? (
            <div className={inquiries.emptyBox}>
              <h2 className={inquiries.emptyTitle}>No Saved Products Yet</h2>
              <p className={inquiries.emptyText}>Tap the heart on a product to keep it here for quick access, and to ask suppliers for a quote later.</p>
              <Link href="/products" className={inquiries.cta}>Explore Products</Link>
            </div>
          ) : (
            <div className={inquiries.emptyBox}>
              <h2 className={inquiries.emptyTitle}>{params.q ? "No matching saved products" : "No saved products in this category"}</h2>
              <p className={inquiries.emptyText}>{params.q ? "Nothing you saved matches that search." : "Choose another category."}</p>
              <button type="button" className={inquiries.btn} onClick={() => { setSearch(""); setParams({ ...DEFAULTS }); }}>Clear filters</button>
            </div>
          )
        ) : (
          <ul className={view === "list" ? styles.list : styles.grid} aria-label="Your saved products">
            {items.map((item) => <SavedProductCard key={item.key} item={item} onRemove={(i) => { setRemoveError(""); setRemoving(i); }} />)}
          </ul>
        )}
      </div>

      {!error && total > 0 && (
        <nav className={inquiries.pager} aria-label="Saved product pages">
          <p className={inquiries.muted} aria-live="polite">Showing {firstRow.toLocaleString("en-IN")} - {lastRow.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} saved products</p>
          {totalPages > 1 && (
            <ul className={inquiries.pages}>
              <li><button type="button" className={inquiries.pageButton} aria-label="Previous page" onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))} disabled={page <= 1 || loading}><ChevronLeft size={16} aria-hidden /></button></li>
              {pageNumbers(page, totalPages).map((n, i) => n === "gap" ? (
                <li key={`g${i}`} aria-hidden className={inquiries.gap}>...</li>
              ) : (
                <li key={n}><button type="button" className={clsx(inquiries.pageButton, n === page && inquiries.pageCurrent)} aria-current={n === page ? "page" : undefined} aria-label={`Page ${n}`} onClick={() => setParams((p) => ({ ...p, page: n }))} disabled={loading}>{n}</button></li>
              ))}
              <li><button type="button" className={inquiries.pageButton} aria-label="Next page" onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))} disabled={page >= totalPages || loading}><ChevronRight size={16} aria-hidden /></button></li>
            </ul>
          )}
        </nav>
      )}
      {filtered && total > 0 && <p className="visually-hidden" aria-live="polite">{total} saved products match your filters.</p>}

      {removing && (
        <ConfirmDialog
          title="Remove from saved products?"
          message={`${removing.name} will be removed from your saved products. You can save it again from its product page.${removeError ? ` ${removeError}` : ""}`}
          confirmLabel={busy ? "Removing..." : "Remove"}
          cancelLabel="Keep it"
          tone="danger"
          busy={busy}
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  );
}
