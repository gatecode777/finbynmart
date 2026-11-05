"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { BadgeCheck, Building2, ChevronLeft, ChevronRight, Filter, Heart, LayoutGrid, List, Layers, MapPin, MessageSquare, Scale, Search, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/Modal";
import { flashToast } from "@/components/ui/Toast";
import { BULK_MAX, COMPARE_MAX, COMPARE_MIN, SUPPLIER_SORTS, VERIFICATION_FILTERS } from "@/lib/wishlist/savedSuppliersRules";
import type { SavedSupplierFacets, SavedSupplierItem, SavedSuppliersPage, SavedSuppliersSummary } from "@/lib/wishlist/savedSuppliers";
import dash from "../Dashboard.module.css";
import inquiries from "../inquiries/Inquiries.module.css";
import { SavedSupplierCard } from "./SavedSupplierCard";
import { SavedSupplierFiltersDialog, type SupplierFilterValues } from "./SavedSupplierFiltersDialog";
import styles from "./Saved.module.css";

export interface SavedSupplierParams {
  q: string;
  category: string;
  state: string;
  city: string;
  type: string;
  verification: string;
  sort: string;
  page: number;
}

const DEFAULTS: SavedSupplierParams = { q: "", category: "", state: "", city: "", type: "", verification: "", sort: "recent", page: 1 };
const KEYS = ["q", "category", "state", "city", "type", "verification", "sort", "page"] as const;
const DEBOUNCE_MS = 300;
const VIEW_KEY = "finbyn.savedSuppliers.view";

function toQuery(p: SavedSupplierParams): URLSearchParams {
  const sp = new URLSearchParams();
  for (const key of KEYS) {
    const value = p[key];
    if (value !== "" && value !== DEFAULTS[key]) sp.set(key, String(value));
  }
  return sp;
}

function paramsFromUrl(): SavedSupplierParams {
  const sp = new URLSearchParams(window.location.search);
  const page = Number(sp.get("page"));
  const out: SavedSupplierParams = { ...DEFAULTS };
  for (const key of KEYS) if (key !== "page") out[key] = sp.get(key) ?? DEFAULTS[key];
  out.page = Number.isInteger(page) && page >= 1 ? page : 1;
  return out;
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

interface SummaryState {
  summary: SavedSuppliersSummary;
  facets: SavedSupplierFacets;
}

interface Props {
  initial: SavedSuppliersPage;
  initialParams: SavedSupplierParams;
  initialSummary: SummaryState | null;
  /** When the server built the page (ms): an old value means the browser restored it from its cache, so it is read again. */
  renderedAt: number;
}

type Pick = { key: string; name: string; available: boolean; inquiryHref: string | null };
type Confirm = { kind: "one"; item: SavedSupplierItem } | { kind: "selected" } | { kind: "all" };

/**
 * The buyer's Saved Suppliers. The first page and the numbers are read on the server; every change (search, filters, sort, page,
 * removal) asks the buyer-scoped API again, ignores answers overtaken by a newer request, and keeps the choices in the address.
 * Selecting only selects (at most 20): Compare, Add to Inquiry and Remove act on the selection, and every removal is shown only
 * after the server confirmed it, with the real count. Bookmarks are removed, never supplier records.
 */
export function SavedSuppliersWorkspace({ initial, initialParams, initialSummary, renderedAt }: Props) {
  const router = useRouter();
  const [params, setParams] = useState(initialParams);
  const [search, setSearch] = useState(initialParams.q);
  const [data, setData] = useState(initial);
  const [summary, setSummary] = useState<SummaryState | null>(initialSummary);
  const [summaryFailed, setSummaryFailed] = useState(initialSummary === null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [picked, setPicked] = useState<Pick[]>([]);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmError, setConfirmError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const first = useRef(true);
  const latest = useRef(params);
  latest.current = params;

  const load = useCallback(async (p: SavedSupplierParams) => {
    const mine = ++request.current;
    setLoading(true);
    setError(false);
    const timer = window.setTimeout(() => mine === request.current && setSlow(true), 250);
    const res = await fetch(`/api/buyer/saved-suppliers?${toQuery(p)}`, { cache: "no-store" }).catch(() => null);
    window.clearTimeout(timer);
    if (mine !== request.current) return;
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setLoading(false);
    setSlow(false);
    if (!body?.ok) {
      setError(true);
      return;
    }
    const result = body.data as SavedSuppliersPage;
    if (result.items.length === 0 && p.page > 1) {
      // the last supplier of this page was removed: show the last page that still has items
      setParams({ ...p, page: Math.max(1, Math.min(p.page - 1, result.totalPages || 1)) });
      return;
    }
    setData(result);
    const qs = toQuery(p).toString();
    window.history.replaceState(window.history.state, "", qs ? `/buyer/saved-suppliers?${qs}` : "/buyer/saved-suppliers");
  }, []);

  const loadSummary = useCallback(async () => {
    const res = await fetch("/api/buyer/saved-suppliers/summary", { cache: "no-store" }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (!body?.ok) {
      setSummaryFailed(true);
      return;
    }
    setSummary(body.data);
    setSummaryFailed(false);
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
    void loadSummary();
    setSearch(fromUrl.q);
    if (same) void load(fromUrl);
    else setParams(fromUrl);
  }, [initialParams, renderedAt, load, loadSummary]);

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
    const refresh = () => {
      void load(latest.current);
      void loadSummary();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load, loadSummary]);

  const chooseView = (next: "grid" | "list") => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  };
  const change = (patch: Partial<SavedSupplierParams>) => setParams((p) => ({ ...p, page: 1, ...patch }));
  const isPicked = (key: string) => picked.some((p) => p.key === key);
  const toggle = (item: SavedSupplierItem) => setPicked((cur) => (cur.some((p) => p.key === item.key) ? cur.filter((p) => p.key !== item.key) : cur.length >= BULK_MAX ? cur : [...cur, { key: item.key, name: item.name, available: item.available, inquiryHref: item.inquiryHref }]));
  const allOnPage = data.items.length > 0 && data.items.every((i) => isPicked(i.key));
  const togglePage = () => setPicked((cur) => {
    if (allOnPage) return cur.filter((p) => !data.items.some((i) => i.key === p.key));
    const next = [...cur];
    for (const i of data.items) if (!next.some((p) => p.key === i.key) && next.length < BULK_MAX) next.push({ key: i.key, name: i.name, available: i.available, inquiryHref: i.inquiryHref });
    return next;
  });

  async function runRemoval() {
    if (!confirm || busy) return;
    setBusy(true);
    setConfirmError("");
    let res: Response | null;
    if (confirm.kind === "one") res = await fetch(`/api/buyer/wishlist/suppliers/${encodeURIComponent(confirm.item.key)}`, { method: "DELETE" }).catch(() => null);
    else if (confirm.kind === "selected") res = await fetch("/api/buyer/saved-suppliers/bulk-remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplierIds: picked.map((p) => p.key) }) }).catch(() => null);
    else res = await fetch("/api/buyer/saved-suppliers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && body.ok !== false) {
      const removed = confirm.kind === "one" ? (body.removed ? 1 : 0) : confirm.kind === "selected" ? body.removedCount : body.removed;
      flashToast("success", confirm.kind === "all" ? `Your saved suppliers were cleared (${removed} removed).` : `Removed ${removed} ${removed === 1 ? "supplier" : "suppliers"} from your saved suppliers.`);
      setPicked((cur) => (confirm.kind === "one" ? cur.filter((p) => p.key !== confirm.item.key) : []));
      setConfirm(null);
      void load(latest.current);
      void loadSummary();
      router.refresh();
      return;
    }
    setConfirmError(res ? (body.message ?? "It could not be removed. Try again.") : "Could not reach the server. Nothing was changed.");
  }

  const { items, total, totalSaved, page, limit, totalPages } = data;
  const firstRow = total === 0 ? 0 : (page - 1) * limit + 1;
  const lastRow = Math.min(page * limit, total);
  const filterKeys = ["category", "state", "city", "type", "verification"] as const;
  const activeFilters = filterKeys.filter((k) => params[k] !== "").length;
  const anyFilter = activeFilters > 0 || params.q !== "";
  const clearAdvanced = { category: "", state: "", city: "", type: "", verification: "" };
  const facets = summary?.facets ?? null;

  const chips: { key: string; label: string; clear: Partial<SavedSupplierParams> }[] = [];
  if (params.category) chips.push({ key: "category", label: facets?.categories.find((c) => c.id === params.category)?.name ?? params.category, clear: { category: "" } });
  if (params.state) chips.push({ key: "state", label: facets?.states.find((s) => s.id === params.state)?.name ?? params.state, clear: { state: "", city: "" } });
  if (params.city) chips.push({ key: "city", label: facets?.cities.find((c) => c.id === params.city)?.name ?? params.city, clear: { city: "" } });
  if (params.type) chips.push({ key: "type", label: facets?.types.find((t) => t.id === params.type)?.name ?? params.type, clear: { type: "" } });
  if (params.verification) chips.push({ key: "verification", label: VERIFICATION_FILTERS.find((v) => v.value === params.verification)?.label ?? params.verification, clear: { verification: "" } });

  const s = summary?.summary;
  const cards = s
    ? [
        { label: "Total Saved", value: s.totalSaved, icon: Heart, tone: dash.toneMint, note: "Every supplier you saved." },
        { label: "Verified", value: s.verified, icon: BadgeCheck, tone: dash.toneMint, note: "Verified in the supplier's own record." },
        { label: "Active Suppliers", value: s.active, icon: Building2, tone: dash.toneCream, note: "Still listed, so you can view and contact them." },
        { label: "Product Categories", value: s.categories, icon: Layers, tone: dash.toneBlue, note: "Distinct categories across them." },
        { label: "States", value: s.states, icon: MapPin, tone: dash.toneBlue, note: "Supplier records store a state, not a country." },
      ]
    : [];

  const canCompare = picked.length >= COMPARE_MIN && picked.length <= COMPARE_MAX && picked.every((p) => p.available);
  const inquiryTarget = picked.length === 1 && picked[0].available ? picked[0].inquiryHref : null;

  return (
    <>
      <div className={styles.topActions}>
        {canCompare ? (
          <Link href={`/buyer/compare-suppliers?ids=${picked.map((p) => p.key).join(",")}`} className={inquiries.btn}><Scale size={18} aria-hidden /> Compare Selected ({picked.length})</Link>
        ) : (
          <button type="button" className={inquiries.btn} disabled aria-disabled="true"><Scale size={18} aria-hidden /> Compare Selected ({picked.length})</button>
        )}
        {inquiryTarget ? (
          <Link href={inquiryTarget} className={inquiries.btn}><MessageSquare size={18} aria-hidden /> Add to Inquiry</Link>
        ) : (
          <button type="button" className={inquiries.btn} disabled aria-disabled="true"><MessageSquare size={18} aria-hidden /> Add to Inquiry</button>
        )}
        <button type="button" className={`${inquiries.btn} ${inquiries.btnDanger}`} disabled={picked.length === 0} onClick={() => { setConfirmError(""); setConfirm({ kind: "selected" }); }}>
          <Trash2 size={18} aria-hidden /> Remove Selected ({picked.length})
        </button>
      </div>
      <p className={styles.hint}>
        Compare needs {COMPARE_MIN} to {COMPARE_MAX} selected suppliers. An inquiry goes to one supplier at a time, so Add to Inquiry works with one selected supplier. You can select up to {BULK_MAX}. Selecting never changes what is saved.
      </p>

      {summaryFailed || !s ? (
        <div className={dash.card} role="alert">
          <p className={dash.welcome}>The key figures could not be loaded. The list below still works.</p>
          <button type="button" className={inquiries.btn} onClick={() => void loadSummary()}>Try again</button>
        </div>
      ) : (
        <ul className={clsx(dash.kpiGrid, styles.summaryGap)} aria-label="Saved supplier summary">
          {cards.map((c) => (
            <li key={c.label} className={`${dash.kpiCard} ${c.tone}`}>
              <span className={dash.kpiIcon}><c.icon size={24} aria-hidden /></span>
              <div className={dash.kpiBody}>
                <h2 className={dash.kpiLabel}>{c.label}</h2>
                <p className={dash.kpiValue}>{c.value.toLocaleString("en-IN")}</p>
                <p className={inquiries.cardNote}>{c.note}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={inquiries.toolbar}>
        <div className={inquiries.search} role="search">
          <Search className={inquiries.searchIcon} size={18} aria-hidden />
          <label htmlFor="saved-supplier-search" className="visually-hidden">Search in saved suppliers</label>
          <input id="saved-supplier-search" type="search" className={inquiries.searchInput} placeholder="Search in saved suppliers..." value={search} maxLength={60} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
          {search && (
            <button type="button" className={inquiries.searchClear} aria-label="Clear search" onClick={() => { setSearch(""); setParams((p) => ({ ...p, q: "", page: 1 })); }}>
              <X size={18} aria-hidden />
            </button>
          )}
        </div>
        <button type="button" className={inquiries.btn} onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
          <Filter size={18} aria-hidden /> Filters {activeFilters > 0 && <span className={inquiries.badgeCount} aria-label={`${activeFilters} active`}>{activeFilters}</span>}
        </button>
        <label className="visually-hidden" htmlFor="saved-supplier-sort">Sort saved suppliers</label>
        <select id="saved-supplier-sort" className={inquiries.select} value={params.sort} onChange={(e) => change({ sort: e.target.value })}>
          {SUPPLIER_SORTS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
        </select>
        <div className={styles.viewToggle} role="group" aria-label="Choose how suppliers are shown">
          <button type="button" className={clsx(styles.viewButton, view === "grid" && styles.viewActive)} aria-pressed={view === "grid"} aria-label="Grid view" onClick={() => chooseView("grid")}>
            <LayoutGrid size={18} aria-hidden />
          </button>
          <button type="button" className={clsx(styles.viewButton, view === "list" && styles.viewActive)} aria-pressed={view === "list"} aria-label="List view" onClick={() => chooseView("list")}>
            <List size={18} aria-hidden />
          </button>
        </div>
        <button type="button" className={inquiries.btn} disabled={totalSaved === 0} onClick={() => { setConfirmError(""); setConfirm({ kind: "all" }); }}>Clear all saved</button>
      </div>

      {chips.length > 0 && (
        <ul className={inquiries.chips} aria-label="Active filters">
          {chips.map((c) => (
            <li key={c.key} className={inquiries.chip}>
              {c.label}
              <button type="button" className={inquiries.chipRemove} aria-label={`Remove filter ${c.label}`} onClick={() => change(c.clear)}><X size={14} aria-hidden /></button>
            </li>
          ))}
          <li><button type="button" className={inquiries.linkButton} onClick={() => change(clearAdvanced)}>Clear all filters</button></li>
        </ul>
      )}

      {items.length > 0 && !error && (
        <div className={styles.selectionBar}>
          <label className={styles.selectAll}>
            <input type="checkbox" checked={allOnPage} onChange={togglePage} />
            Select all on this page ({items.length})
          </label>
          <span aria-live="polite">{picked.length} selected{picked.length >= BULK_MAX ? ` (the most you can select: ${BULK_MAX})` : ""}</span>
          <button type="button" className={inquiries.linkButton} disabled={picked.length === 0} onClick={() => setPicked([])}>Clear selection</button>
        </div>
      )}

      <div className={inquiries.results} aria-busy={loading} aria-live="polite">
        {error ? (
          <div className={inquiries.emptyBox} role="alert">
            <h2 className={inquiries.emptyTitle}>Your saved suppliers could not be loaded</h2>
            <p className={inquiries.emptyText}>Nothing was changed. Check your connection and try again.</p>
            <button type="button" className={inquiries.btn} onClick={() => void load(params)}>Try again</button>
          </div>
        ) : loading && slow ? (
          <div aria-label="Loading your saved suppliers">{[0, 1, 2, 3].map((i) => <div key={i} className={inquiries.skeletonRow} />)}</div>
        ) : items.length === 0 ? (
          totalSaved === 0 ? (
            <div className={inquiries.emptyBox}>
              <h2 className={inquiries.emptyTitle}>No Saved Suppliers Yet</h2>
              <p className={inquiries.emptyText}>Save suppliers you trust to quickly revisit their business profiles and start future sourcing inquiries.</p>
              <Link href="/suppliers" className={inquiries.cta}>Explore Suppliers</Link>
            </div>
          ) : (
            <div className={inquiries.emptyBox}>
              <h2 className={inquiries.emptyTitle}>{params.q ? "No matching saved suppliers" : "No saved suppliers match these filters"}</h2>
              <p className={inquiries.emptyText}>{params.q ? "Nothing you saved matches that search with the filters you chose." : "Try another filter."}</p>
              <button type="button" className={inquiries.btn} onClick={() => { setSearch(""); setParams({ ...DEFAULTS }); }}>Clear filters</button>
            </div>
          )
        ) : (
          <ul className={view === "list" ? styles.supplierList : styles.grid} aria-label="Your saved suppliers">
            {items.map((item) => <SavedSupplierCard key={item.key} item={item} selected={isPicked(item.key)} selectionFull={picked.length >= BULK_MAX} onToggle={toggle} onRemove={(i) => { setConfirmError(""); setConfirm({ kind: "one", item: i }); }} />)}
          </ul>
        )}
      </div>

      {!error && total > 0 && (
        <nav className={inquiries.pager} aria-label="Saved supplier pages">
          <p className={inquiries.muted} aria-live="polite">Showing {firstRow.toLocaleString("en-IN")} - {lastRow.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} saved suppliers</p>
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
      {anyFilter && total > 0 && <p className="visually-hidden" aria-live="polite">{total} saved suppliers match your filters.</p>}

      {filtersOpen && (
        <SavedSupplierFiltersDialog
          values={{ category: params.category, state: params.state, city: params.city, type: params.type, verification: params.verification } satisfies SupplierFilterValues}
          facets={facets}
          onClose={() => setFiltersOpen(false)}
          onClear={() => { change(clearAdvanced); setFiltersOpen(false); }}
          onApply={(v) => { change(v); setFiltersOpen(false); }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "all" ? "Clear all saved suppliers?" : confirm.kind === "selected" ? `Remove ${picked.length} selected ${picked.length === 1 ? "supplier" : "suppliers"}?` : "Remove from saved suppliers?"}
          message={`${confirm.kind === "all" ? `All ${totalSaved} suppliers will be removed from your saved list.` : confirm.kind === "selected" ? `${picked.length} ${picked.length === 1 ? "supplier" : "suppliers"} will be removed from your saved list.` : `${confirm.item.name} will be removed from your saved suppliers.`} Only your own bookmarks are removed: the suppliers and their products are not affected, and you can save them again from their pages.${confirmError ? ` ${confirmError}` : ""}`}
          confirmLabel={busy ? "Removing..." : confirm.kind === "all" ? "Clear all" : "Remove"}
          cancelLabel="Keep them"
          tone="danger"
          busy={busy}
          onConfirm={() => void runRemoval()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
