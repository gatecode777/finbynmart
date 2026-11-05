"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, Filter, Package, ReceiptText, Search, Truck, TriangleAlert, X } from "lucide-react";
import { flashToast } from "@/components/ui/Toast";
import { AMOUNT_SORTS, DATE_RANGES, SORTS, STATUS_LABEL, STATUS_TABS, ORDER_STATUSES, type OrderSummary, type TabCounts } from "@/lib/orders/orderRules";
import type { OrderFacets, OrderPage, OrderRow } from "@/lib/orders/service";
import dash from "../Dashboard.module.css";
import inq from "../inquiries/Inquiries.module.css";
import { BuyerOrderTable } from "./BuyerOrderTable";
import { CancelRequestDialog } from "./CancelRequestDialog";
import { OrderFiltersDialog } from "./OrderFiltersDialog";
import styles from "./Orders.module.css";

export interface OrderParams {
  q: string;
  status: string;
  supplierId: string;
  currency: string;
  range: string;
  dateFrom: string;
  dateTo: string;
  sort: string;
  page: number;
}

const DEFAULTS: OrderParams = { q: "", status: "all", supplierId: "", currency: "", range: "", dateFrom: "", dateTo: "", sort: "newest", page: 1 };
const KEYS = ["q", "status", "supplierId", "currency", "range", "dateFrom", "dateTo", "sort", "page"] as const;
const DEBOUNCE_MS = 300;

function toQuery(p: OrderParams): URLSearchParams {
  const sp = new URLSearchParams();
  for (const key of KEYS) {
    const value = p[key];
    if (value !== "" && value !== DEFAULTS[key]) sp.set(key, String(value));
  }
  return sp;
}

function paramsFromUrl(): OrderParams {
  const sp = new URLSearchParams(window.location.search);
  const page = Number(sp.get("page"));
  const out: OrderParams = { ...DEFAULTS };
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
  summary: OrderSummary;
  tabCounts: TabCounts;
}

interface Props {
  initial: OrderPage;
  initialParams: OrderParams;
  initialSummary: SummaryState | null;
  initialFacets: OrderFacets | null;
  today: string;
  /** When the server built this page (ms). An old value means it was restored from the browser's cache, so it is read again. */
  renderedAt: number;
}

/**
 * The buyer's Orders workspace. The first list, the numbers and the filter choices are read on the server; every change (tab, search,
 * filters, sort, page, cancellation request, export) asks the buyer-scoped API again, ignores answers overtaken by a newer request,
 * and keeps the choices in the address. Payments, invoices, shipment tracking and returns have no module: the payment overview says
 * so, and no figure for them is shown. Nothing is shown as done until the server did it.
 */
export function OrdersWorkspace({ initial, initialParams, initialSummary, initialFacets, today, renderedAt }: Props) {
  const [params, setParams] = useState(initialParams);
  const [search, setSearch] = useState(initialParams.q);
  const [data, setData] = useState(initial);
  const [summary, setSummary] = useState<SummaryState | null>(initialSummary);
  const [summaryFailed, setSummaryFailed] = useState(initialSummary === null);
  const [facets, setFacets] = useState<OrderFacets | null>(initialFacets);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cancelRow, setCancelRow] = useState<OrderRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const request = useRef(0);
  const first = useRef(true);
  const latest = useRef(params);
  latest.current = params;

  const load = useCallback(async (p: OrderParams) => {
    const mine = ++request.current;
    setLoading(true);
    setError(false);
    const timer = window.setTimeout(() => mine === request.current && setSlow(true), 250);
    const res = await fetch(`/api/buyer/orders?${toQuery(p)}`, { cache: "no-store" }).catch(() => null);
    window.clearTimeout(timer);
    if (mine !== request.current) return;
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setLoading(false);
    setSlow(false);
    if (!body?.ok) {
      setError(true);
      return;
    }
    setData({ orders: body.orders, tabCounts: body.data.tabCounts, meta: body.meta });
    const qs = toQuery(p).toString();
    window.history.replaceState(window.history.state, "", qs ? `/buyer/orders?${qs}` : "/buyer/orders");
  }, []);

  const loadSummary = useCallback(async () => {
    const res = await fetch("/api/buyer/orders/summary", { cache: "no-store" }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (!body?.ok) {
      setSummaryFailed(true);
      return;
    }
    setSummary({ summary: body.data.summary, tabCounts: body.data.tabCounts });
    setFacets(body.data.facets);
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
    const refresh = () => {
      void load(latest.current);
      void loadSummary();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load, loadSummary]);

  const change = (patch: Partial<OrderParams>) => setParams((p) => ({ ...p, page: 1, ...patch }));
  const oneCurrency = facets && facets.currencies.length === 1 ? facets.currencies[0].id : "";
  const changeSort = (sort: string) => change(AMOUNT_SORTS.includes(sort as (typeof AMOUNT_SORTS)[number]) && !params.currency && oneCurrency ? { sort, currency: oneCurrency } : { sort });
  const amountSortsOk = Boolean(params.currency || oneCurrency);

  const isTab = STATUS_TABS.some((t) => t.value === params.status);
  const activeFilters = [params.supplierId, params.currency, params.range, !isTab ? params.status : ""].filter(Boolean).length;
  const anyFilter = activeFilters > 0 || params.q !== "" || params.status !== "all";
  const clearAdvanced = { supplierId: "", currency: "", range: "", dateFrom: "", dateTo: "", status: isTab ? params.status : "all" };

  const chips: { key: string; label: string; clear: Partial<OrderParams> }[] = [];
  if (!isTab) chips.push({ key: "status", label: STATUS_LABEL[ORDER_STATUSES.find((s) => s.toLowerCase() === params.status) ?? "PENDING_CONFIRMATION"], clear: { status: "all" } });
  if (params.supplierId) chips.push({ key: "supplier", label: facets?.suppliers.find((s) => s.id === params.supplierId)?.name ?? params.supplierId, clear: { supplierId: "" } });
  if (params.currency) chips.push({ key: "currency", label: params.currency, clear: { currency: "" } });
  if (params.range) chips.push({ key: "range", label: params.range === "custom" ? `${params.dateFrom} to ${params.dateTo}` : (DATE_RANGES.find((r) => r.value === params.range)?.label ?? params.range), clear: { range: "", dateFrom: "", dateTo: "" } });

  async function exportOrders() {
    if (exporting) return;
    setExporting(true);
    const { page: _page, ...filters } = Object.fromEntries(toQuery(latest.current));
    void _page;
    const res = await fetch("/api/buyer/orders/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(filters) }).catch(() => null);
    if (!res?.ok) {
      setExporting(false);
      flashToast("error", res ? "The export could not be prepared. Nothing was downloaded." : "Could not reach the server. Nothing was downloaded.");
      return;
    }
    const blob = await res.blob();
    const rows = Number(res.headers.get("X-Export-Rows") ?? "0");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "finbyn-mart-orders.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setExporting(false);
    flashToast("success", `Exported ${rows.toLocaleString("en-IN")} ${rows === 1 ? "order" : "orders"}${res.headers.get("X-Export-Truncated") === "true" ? " (the first 5,000: narrow the filters for the rest)" : ""}.`);
  }

  const { meta } = data;
  const firstRow = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const lastRow = Math.min(meta.page * meta.limit, meta.total);
  const s = summary?.summary;
  const cards = s
    ? [
        { label: "Total Orders", value: s.totalOrders, icon: Package, tone: dash.toneMint, note: "All your orders, including cancelled and returned." },
        { label: "Processing", value: s.processing, icon: Clock, tone: dash.toneCream, note: "Confirmed, processing or ready to dispatch." },
        { label: "In Transit", value: s.inTransit, icon: Truck, tone: dash.toneBlue, note: "Dispatched, in transit or out for delivery." },
        { label: "Delivered", value: s.delivered, icon: CheckCircle2, tone: dash.toneMint, note: "Marked delivered." },
        { label: "Returns / Issues", value: s.activeIssues, icon: TriangleAlert, tone: dash.toneBlue, note: "On hold, or a cancellation or return is open." },
      ]
    : [];

  return (
    <>
      {summaryFailed || !s ? (
        <div className={dash.card} role="alert">
          <p className={dash.welcome}>The key figures could not be loaded. The list below still works.</p>
          <button type="button" className={inq.btn} onClick={() => void loadSummary()}>Try again</button>
        </div>
      ) : (
        <ul className={dash.kpiGrid} aria-label="Order summary">
          {cards.map((c) => (
            <li key={c.label} className={`${dash.kpiCard} ${c.tone}`}>
              <span className={dash.kpiIcon}><c.icon size={24} aria-hidden /></span>
              <div className={dash.kpiBody}>
                <h2 className={dash.kpiLabel}>{c.label}</h2>
                <p className={dash.kpiValue}>{c.value.toLocaleString("en-IN")}</p>
                <p className={inq.cardNote}>{c.note}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className={styles.paymentBox} aria-labelledby="payment-overview-title">
        <span className={styles.paymentIcon} aria-hidden><ReceiptText size={24} /></span>
        <div>
          <h2 id="payment-overview-title" className={styles.paymentTitle}>Payment Overview: not available yet</h2>
          <p className={styles.paymentText}>Paid amount, pending payment, refunds and invoices need payment and invoice records, and none exist on Finbyn Mart yet. No amount is shown rather than a guess; your order amounts below are the totals agreed with each supplier.</p>
        </div>
      </section>

      <div className={inq.tabs} role="group" aria-label="Filter orders by status">
        {STATUS_TABS.map((t) => (
          <button key={t.value} type="button" className={clsx(inq.tab, params.status === t.value && inq.tabActive)} aria-pressed={params.status === t.value} onClick={() => change({ status: t.value })}>
            {t.label} ({data.tabCounts[t.value].toLocaleString("en-IN")})
          </button>
        ))}
      </div>

      <div className={inq.toolbar}>
        <div className={inq.search} role="search">
          <Search className={inq.searchIcon} size={18} aria-hidden />
          <label htmlFor="order-search" className="visually-hidden">Search your orders</label>
          <input id="order-search" type="search" className={inq.searchInput} placeholder="Search by order ref., product, supplier or quotation..." value={search} maxLength={60} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
          {search && (
            <button type="button" className={inq.searchClear} aria-label="Clear search" onClick={() => { setSearch(""); setParams((p) => ({ ...p, q: "", page: 1 })); }}>
              <X size={18} aria-hidden />
            </button>
          )}
        </div>
        <button type="button" className={inq.btn} onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
          <Filter size={18} aria-hidden /> Filters {activeFilters > 0 && <span className={inq.badgeCount} aria-label={`${activeFilters} active`}>{activeFilters}</span>}
        </button>
        <label className="visually-hidden" htmlFor="order-sort">Sort orders</label>
        <select id="order-sort" className={inq.select} value={params.sort} onChange={(e) => changeSort(e.target.value)}>
          {SORTS.map((o) => <option key={o.value} value={o.value} disabled={AMOUNT_SORTS.includes(o.value) && !amountSortsOk}>Sort: {o.label}{AMOUNT_SORTS.includes(o.value) && !amountSortsOk ? " (choose a currency first)" : ""}</option>)}
        </select>
        <button type="button" className={inq.btn} onClick={() => void exportOrders()} disabled={exporting || meta.total === 0}>
          <Download size={18} aria-hidden /> {exporting ? "Preparing..." : "Export Orders"}
        </button>
      </div>

      {chips.length > 0 && (
        <ul className={inq.chips} aria-label="Active filters">
          {chips.map((c) => (
            <li key={c.key} className={inq.chip}>
              {c.label}
              <button type="button" className={inq.chipRemove} aria-label={`Remove filter ${c.label}`} onClick={() => change(c.clear)}><X size={14} aria-hidden /></button>
            </li>
          ))}
          <li><button type="button" className={inq.linkButton} onClick={() => change(clearAdvanced)}>Clear all filters</button></li>
        </ul>
      )}

      <div className={inq.results} aria-busy={loading} aria-live="polite">
        {error ? (
          <div className={inq.emptyBox} role="alert">
            <h2 className={inq.emptyTitle}>Your orders could not be loaded</h2>
            <p className={inq.emptyText}>Nothing was changed. Check your connection and try again.</p>
            <button type="button" className={inq.btn} onClick={() => void load(params)}>Try again</button>
          </div>
        ) : loading && slow ? (
          <div aria-label="Loading your orders">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={inq.skeletonRow} />)}</div>
        ) : data.orders.length === 0 ? (
          !anyFilter ? (
            <div className={inq.emptyBox}>
              <h2 className={inq.emptyTitle}>No Orders Yet</h2>
              <p className={inq.emptyText}>Your confirmed purchases will appear here. Explore products and connect with suppliers for your business requirements.</p>
              <Link href="/products" className={inq.cta}>Browse Products</Link>
            </div>
          ) : (
            <div className={inq.emptyBox}>
              <h2 className={inq.emptyTitle}>{params.q ? "No matching orders" : "No orders match these filters"}</h2>
              <p className={inq.emptyText}>{params.q ? "Nothing you ordered matches that search with the filters you chose." : "Try another status or remove a filter."}</p>
              <button type="button" className={inq.btn} onClick={() => { setSearch(""); setParams({ ...DEFAULTS }); }}>Clear filters</button>
            </div>
          )
        ) : (
          <BuyerOrderTable rows={data.orders} onCancel={setCancelRow} />
        )}
      </div>

      {!error && meta.total > 0 && (
        <nav className={inq.pager} aria-label="Order pages">
          <p className={inq.muted} aria-live="polite">Showing {firstRow.toLocaleString("en-IN")} - {lastRow.toLocaleString("en-IN")} of {meta.total.toLocaleString("en-IN")} orders</p>
          {meta.totalPages > 1 && (
            <ul className={inq.pages}>
              <li><button type="button" className={inq.pageButton} aria-label="Previous page" onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))} disabled={meta.page <= 1 || loading}><ChevronLeft size={16} aria-hidden /></button></li>
              {pageNumbers(meta.page, meta.totalPages).map((n, i) => n === "gap" ? (
                <li key={`g${i}`} aria-hidden className={inq.gap}>...</li>
              ) : (
                <li key={n}><button type="button" className={clsx(inq.pageButton, n === meta.page && inq.pageCurrent)} aria-current={n === meta.page ? "page" : undefined} aria-label={`Page ${n}`} onClick={() => setParams((p) => ({ ...p, page: n }))} disabled={loading}>{n}</button></li>
              ))}
              <li><button type="button" className={inq.pageButton} aria-label="Next page" onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))} disabled={meta.page >= meta.totalPages || loading}><ChevronRight size={16} aria-hidden /></button></li>
            </ul>
          )}
        </nav>
      )}

      {filtersOpen && (
        <OrderFiltersDialog
          values={{ status: params.status, supplierId: params.supplierId, currency: params.currency, range: params.range, dateFrom: params.dateFrom, dateTo: params.dateTo }}
          facets={facets}
          today={today}
          onClose={() => setFiltersOpen(false)}
          onClear={() => { change(clearAdvanced); setFiltersOpen(false); }}
          onApply={(v) => { change({ status: v.status, supplierId: v.supplierId, currency: v.currency, range: v.range, dateFrom: v.dateFrom, dateTo: v.dateTo }); setFiltersOpen(false); }}
        />
      )}
      {cancelRow && <CancelRequestDialog target={{ reference: cancelRow.reference, supplierName: cancelRow.supplier.name, statusLabel: cancelRow.statusLabel }} onClose={() => setCancelRow(null)} onDone={() => { void load(latest.current); void loadSummary(); }} />}
    </>
  );
}
