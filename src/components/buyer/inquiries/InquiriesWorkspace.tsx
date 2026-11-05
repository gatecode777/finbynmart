"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Filter, MessageSquareText, MessagesSquare, Search, X } from "lucide-react";
import { DATE_RANGES, REPLIES_CONNECTED, SORTS, STATUS_FILTERS, type InquirySummary, type StatusCounts } from "@/lib/inquiries/buyerListRules";
import { INQUIRY_TYPES } from "@/lib/inquiries/rules";
import type { BuyerInquiryPage, BuyerInquiryRow, InquiryFacets } from "@/lib/inquiries/buyerList";
import dash from "../Dashboard.module.css";
import { BuyerInquiryTable } from "./BuyerInquiryTable";
import { CancelInquiryDialog } from "./CancelInquiryDialog";
import { InquiryFiltersDialog, type FilterValues } from "./InquiryFiltersDialog";
import styles from "./Inquiries.module.css";

export interface Params {
  q: string;
  status: string;
  inquiryType: string;
  supplierId: string;
  categoryId: string;
  range: string;
  dateFrom: string;
  dateTo: string;
  sort: string;
  page: number;
}

const DEFAULTS: Params = { q: "", status: "all", inquiryType: "", supplierId: "", categoryId: "", range: "", dateFrom: "", dateTo: "", sort: "newest", page: 1 };
const KEYS = ["q", "status", "inquiryType", "supplierId", "categoryId", "range", "dateFrom", "dateTo", "sort", "page"] as const;
const DEBOUNCE_MS = 300;

function toQuery(p: Params): URLSearchParams {
  const sp = new URLSearchParams();
  for (const key of KEYS) {
    const value = p[key];
    if (value !== "" && value !== DEFAULTS[key]) sp.set(key, String(value));
  }
  return sp;
}

interface SummaryState {
  summary: InquirySummary;
  statusCounts: StatusCounts;
}

interface Props {
  initial: BuyerInquiryPage;
  initialParams: Params;
  initialSummary: SummaryState | null;
  initialFacets: InquiryFacets | null;
  /** Today in India (YYYY-MM-DD), the latest allowed date of a custom range. */
  today: string;
  /** When the server built this page (ms). An old value means the page was restored from the browser's back/forward cache, so it is read again. */
  renderedAt: number;
}

/** The choices in the address bar (what the buyer sees), read as the same Params the server page builds from it. */
function paramsFromUrl(): Params {
  const sp = new URLSearchParams(window.location.search);
  const page = Number(sp.get("page"));
  const out: Params = { ...DEFAULTS };
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

/**
 * The buyer's My Inquiries workspace. The first list, the summary and the filter choices are read on the server and passed in; every
 * change (tab, search, filters, sort, page, cancel) asks the buyer-scoped API again, ignores answers that were overtaken by a newer
 * request, and keeps the choices in the address so a reload or a shared link restores them. Nothing is shown as cancelled until the
 * server did it.
 */
export function InquiriesWorkspace({ initial, initialParams, initialSummary, initialFacets, today, renderedAt }: Props) {
  const [params, setParams] = useState<Params>(initialParams);
  const [search, setSearch] = useState(initialParams.q);
  const [data, setData] = useState(initial);
  const [summary, setSummary] = useState<SummaryState | null>(initialSummary);
  const [summaryFailed, setSummaryFailed] = useState(initialSummary === null);
  const [facets, setFacets] = useState<InquiryFacets | null>(initialFacets);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cancelRow, setCancelRow] = useState<BuyerInquiryRow | null>(null);
  const request = useRef(0);
  const first = useRef(true);
  const latest = useRef(params);
  latest.current = params;

  const load = useCallback(async (p: Params) => {
    const mine = ++request.current;
    setLoading(true);
    setError(false);
    const timer = window.setTimeout(() => mine === request.current && setSlow(true), 250);
    const res = await fetch(`/api/buyer/inquiries?${toQuery(p)}`, { cache: "no-store" }).catch(() => null);
    window.clearTimeout(timer);
    if (mine !== request.current) return; // a newer request replaced this one
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setLoading(false);
    setSlow(false);
    if (!body?.ok) {
      setError(true);
      return;
    }
    setData({ inquiries: body.inquiries, statusCounts: body.data.statusCounts, meta: body.meta });
    const qs = toQuery(p).toString();
    // keep the router's own history state, so Back/Forward still work with the page
    window.history.replaceState(window.history.state, "", qs ? `/buyer/inquiries?${qs}` : "/buyer/inquiries");
  }, []);

  const loadSummary = useCallback(async () => {
    const res = await fetch("/api/buyer/inquiries/summary", { cache: "no-store" }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (!body?.ok) {
      setSummaryFailed(true);
      return;
    }
    setSummary({ summary: body.data.summary, statusCounts: body.data.statusCounts });
    setFacets(body.data.facets);
    setSummaryFailed(false);
  }, []);

  // a changed choice asks the server again (the first render already holds the server's answer)
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void load(params);
  }, [params, load]);

  // Coming back with Back/Forward the router can hand over the page it built earlier (old list, old filters) while the address says
  // something else. The address wins, and a page older than a few seconds is read again, so nothing stale is shown.
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

  // search is debounced, and always starts again from page 1
  useEffect(() => {
    if (search === latest.current.q) return;
    const timer = window.setTimeout(() => setParams((p) => ({ ...p, q: search, page: 1 })), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  // coming back to the tab: read again, so a status that changed meanwhile is not shown stale
  useEffect(() => {
    const refresh = () => {
      void load(latest.current);
      void loadSummary();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load, loadSummary]);

  // a link to #ref-<reference> (from the confirmation page) scrolls to that inquiry
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#ref-")) return;
    const reference = hash.slice(5);
    const target = [document.getElementById(`ref-${reference}`), document.getElementById(`card-${reference}`)].find((el) => el && el.getClientRects().length > 0);
    target?.scrollIntoView({ block: "center" });
  }, []);

  const change = (patch: Partial<Params>) => setParams((p) => ({ ...p, page: 1, ...patch }));
  const filterValues: FilterValues = { inquiryType: params.inquiryType, supplierId: params.supplierId, categoryId: params.categoryId, range: params.range, dateFrom: params.dateFrom, dateTo: params.dateTo };
  const activeFilters = [params.inquiryType, params.supplierId, params.categoryId, params.range].filter(Boolean).length;
  const anyFilter = activeFilters > 0 || params.q !== "" || params.status !== "all";
  const clearAdvanced = { inquiryType: "", supplierId: "", categoryId: "", range: "", dateFrom: "", dateTo: "" };

  const chips: { key: string; label: string; clear: Partial<Params> }[] = [];
  if (params.inquiryType) chips.push({ key: "type", label: INQUIRY_TYPES.find((t) => t.value === params.inquiryType)?.label ?? params.inquiryType, clear: { inquiryType: "" } });
  if (params.supplierId) chips.push({ key: "supplier", label: facets?.suppliers.find((s) => s.id === params.supplierId)?.name ?? params.supplierId, clear: { supplierId: "" } });
  if (params.categoryId) chips.push({ key: "category", label: facets?.categories.find((c) => c.id === params.categoryId)?.name ?? params.categoryId, clear: { categoryId: "" } });
  if (params.range) chips.push({ key: "range", label: params.range === "custom" ? `${params.dateFrom} to ${params.dateTo}` : (DATE_RANGES.find((r) => r.value === params.range)?.label ?? params.range), clear: { range: "", dateFrom: "", dateTo: "" } });

  const { meta } = data;
  const firstRow = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const lastRow = Math.min(meta.page * meta.limit, meta.total);
  const s = summary?.summary;

  return (
    <>
      {summaryFailed || !s ? (
        <div className={dash.card} role="alert">
          <p className={dash.welcome}>The key figures could not be loaded. The list below still works.</p>
          <button type="button" className={styles.btn} onClick={() => void loadSummary()}>Try again</button>
        </div>
      ) : (
        <ul className={dash.kpiGrid} aria-label="Inquiry summary">
          <li className={`${dash.kpiCard} ${dash.toneMint}`}>
            <span className={dash.kpiIcon}><MessageSquareText size={24} aria-hidden /></span>
            <div className={dash.kpiBody}>
              <h2 className={dash.kpiLabel}>Total Inquiries</h2>
              <p className={dash.kpiValue}>{s.total.toLocaleString("en-IN")}</p>
              <p className={styles.cardNote}>All your inquiries, including cancelled and rejected.</p>
            </div>
          </li>
          <li className={`${dash.kpiCard} ${dash.toneCream}`}>
            <span className={dash.kpiIcon}><Clock size={24} aria-hidden /></span>
            <div className={dash.kpiBody}>
              <h2 className={dash.kpiLabel}>Awaiting Response</h2>
              <p className={dash.kpiValue}>{s.awaitingResponse.toLocaleString("en-IN")}</p>
              <p className={styles.cardNote}>Open, with no supplier reply recorded.</p>
            </div>
          </li>
          <li className={`${dash.kpiCard} ${dash.toneBlue}`}>
            <span className={dash.kpiIcon}><MessagesSquare size={24} aria-hidden /></span>
            <div className={dash.kpiBody}>
              <h2 className={dash.kpiLabel}>Replied / Quoted</h2>
              <p className={dash.kpiValue}>{s.repliedOrQuoted.toLocaleString("en-IN")}</p>
              <p className={styles.cardNote}>{REPLIES_CONNECTED ? "Supplier replies and quotations." : "Supplier replies and quotations are not connected yet."}</p>
            </div>
          </li>
          <li className={`${dash.kpiCard} ${dash.toneMint}`}>
            <span className={dash.kpiIcon}><CheckCircle2 size={24} aria-hidden /></span>
            <div className={dash.kpiBody}>
              <h2 className={dash.kpiLabel}>Closed</h2>
              <p className={dash.kpiValue}>{s.closed.toLocaleString("en-IN")}</p>
              <p className={styles.cardNote}>Inquiries marked closed.</p>
            </div>
          </li>
        </ul>
      )}

      <div className={styles.tabs} role="group" aria-label="Filter inquiries by status">
        {STATUS_FILTERS.map((f) => (
          <button key={f.value} type="button" className={clsx(styles.tab, params.status === f.value && styles.tabActive)} aria-pressed={params.status === f.value} onClick={() => change({ status: f.value })}>
            {f.label} ({data.statusCounts[f.value].toLocaleString("en-IN")})
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.search} role="search">
          <Search className={styles.searchIcon} size={18} aria-hidden />
          <label htmlFor="inquiry-search" className="visually-hidden">Search your inquiries</label>
          <input id="inquiry-search" type="search" className={styles.searchInput} placeholder="Search by inquiry reference, product or supplier..." value={search} maxLength={60} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
          {search && (
            <button type="button" className={styles.searchClear} aria-label="Clear search" onClick={() => { setSearch(""); setParams((p) => ({ ...p, q: "", page: 1 })); }}>
              <X size={18} aria-hidden />
            </button>
          )}
        </div>
        <button type="button" className={styles.btn} onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
          <Filter size={18} aria-hidden /> Filters {activeFilters > 0 && <span className={styles.badgeCount} aria-label={`${activeFilters} active`}>{activeFilters}</span>}
        </button>
        <label className="visually-hidden" htmlFor="inquiry-sort">Sort inquiries</label>
        <select id="inquiry-sort" className={styles.select} value={params.sort} onChange={(e) => change({ sort: e.target.value })}>
          {SORTS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
        </select>
      </div>

      {chips.length > 0 && (
        <ul className={styles.chips} aria-label="Active filters">
          {chips.map((c) => (
            <li key={c.key} className={styles.chip}>
              {c.label}
              <button type="button" className={styles.chipRemove} aria-label={`Remove filter ${c.label}`} onClick={() => change(c.clear)}><X size={14} aria-hidden /></button>
            </li>
          ))}
          <li><button type="button" className={styles.linkButton} onClick={() => change(clearAdvanced)}>Clear all filters</button></li>
        </ul>
      )}

      <div className={styles.results} aria-busy={loading} aria-live="polite">
        {error ? (
          <div className={styles.emptyBox} role="alert">
            <h2 className={styles.emptyTitle}>Your inquiries could not be loaded</h2>
            <p className={styles.emptyText}>Nothing was changed. Check your connection and try again.</p>
            <button type="button" className={styles.btn} onClick={() => void load(params)}>Try again</button>
          </div>
        ) : loading && slow ? (
          <div aria-label="Loading your inquiries">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={styles.skeletonRow} />)}</div>
        ) : data.inquiries.length === 0 ? (
          !anyFilter ? (
            <div className={styles.emptyBox}>
              <h2 className={styles.emptyTitle}>No Inquiries Yet</h2>
              <p className={styles.emptyText}>Start exploring products and contact suppliers to receive quotations for your business requirements.</p>
              <Link href="/products" className={styles.cta}>Explore Products</Link>
            </div>
          ) : (
            <div className={styles.emptyBox}>
              <h2 className={styles.emptyTitle}>{params.q ? "No matching inquiries" : "No inquiries match these filters"}</h2>
              <p className={styles.emptyText}>{params.q ? "Nothing you sent matches that search with the filters you chose." : "Try another status or remove a filter."}</p>
              <button type="button" className={styles.btn} onClick={() => { setSearch(""); setParams({ ...DEFAULTS }); }}>Clear filters</button>
            </div>
          )
        ) : (
          <BuyerInquiryTable rows={data.inquiries} onCancel={setCancelRow} />
        )}
      </div>

      {!error && meta.total > 0 && (
        <nav className={styles.pager} aria-label="Inquiry pages">
          <p className={styles.muted} aria-live="polite">Showing {firstRow.toLocaleString("en-IN")} - {lastRow.toLocaleString("en-IN")} of {meta.total.toLocaleString("en-IN")} inquiries</p>
          {meta.totalPages > 1 && (
            <ul className={styles.pages}>
              <li><button type="button" className={styles.pageButton} aria-label="Previous page" onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))} disabled={meta.page <= 1 || loading}><ChevronLeft size={16} aria-hidden /></button></li>
              {pageNumbers(meta.page, meta.totalPages).map((n, i) => n === "gap" ? (
                <li key={`g${i}`} aria-hidden className={styles.gap}>...</li>
              ) : (
                <li key={n}><button type="button" className={clsx(styles.pageButton, n === meta.page && styles.pageCurrent)} aria-current={n === meta.page ? "page" : undefined} aria-label={`Page ${n}`} onClick={() => setParams((p) => ({ ...p, page: n }))} disabled={loading}>{n}</button></li>
              ))}
              <li><button type="button" className={styles.pageButton} aria-label="Next page" onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))} disabled={meta.page >= meta.totalPages || loading}><ChevronRight size={16} aria-hidden /></button></li>
            </ul>
          )}
        </nav>
      )}

      {filtersOpen && (
        <InquiryFiltersDialog
          values={filterValues}
          facets={facets}
          today={today}
          onClose={() => setFiltersOpen(false)}
          onClear={() => { change(clearAdvanced); setFiltersOpen(false); }}
          onApply={(v) => { change({ inquiryType: v.inquiryType, supplierId: v.supplierId, categoryId: v.categoryId, range: v.range, dateFrom: v.dateFrom, dateTo: v.dateTo }); setFiltersOpen(false); }}
        />
      )}
      {cancelRow && <CancelInquiryDialog target={{ key: cancelRow.reference ?? cancelRow.id, reference: cancelRow.reference, supplierName: cancelRow.supplier.name }} onClose={() => setCancelRow(null)} onDone={() => { void load(latest.current); void loadSummary(); }} />}
    </>
  );
}
