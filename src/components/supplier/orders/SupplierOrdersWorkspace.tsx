"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Dropdown } from "@/components/ui/Dropdown";
import { ChevronLeft, ChevronRight, Clock, Download, Info, Layers, PackageCheck, PackageOpen, Search, Package, X, type LucideIcon } from "lucide-react";
import { FilterDrawer } from "@/components/ui/FilterDrawer";
import { AMOUNT_SORTS, DATE_BASES, EXACT_STATUS_KEYS, ORDER_TABS, SORTS, STATUS_LABEL, SUMMARY_CARDS } from "@/lib/supplier/orderRules";
import type { SupplierOrderPage, SupplierOrderRow } from "@/lib/supplier/orderService";
import dash from "../dashboard/SupplierDashboard.module.css";
import q from "../quotations/SupplierQuotations.module.css";
import { OrderStatusBadge } from "./OrderStatusBadge";
import styles from "./SupplierOrders.module.css";

export interface OrderParams {
  q: string;
  status: string;
  sort: string;
  range: string;
  startDate: string;
  endDate: string;
  dateBasis: string;
  currency: string;
  page: number;
}

const DEFAULTS: OrderParams = { q: "", status: "all", sort: "newest", range: "", startDate: "", endDate: "", dateBasis: "placed", currency: "", page: 1 };
const KEYS = Object.keys(DEFAULTS) as (keyof OrderParams)[];
const DEBOUNCE_MS = 300;
const RANGES = [
  { value: "", label: "Any time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "this-month", label: "This month" },
  { value: "previous-month", label: "Previous month" },
  { value: "custom", label: "Custom range" },
];
const CARD_ICONS: Record<(typeof SUMMARY_CARDS)[number]["key"], LucideIcon> = { all: Package, awaiting: Clock, in_progress: Layers, ready: PackageCheck };

function toQuery(p: OrderParams): URLSearchParams {
  const sp = new URLSearchParams();
  for (const key of KEYS) {
    const value = p[key];
    if (value === "" || value === DEFAULTS[key]) continue;
    // a custom range's dates and the date basis only mean something with a range
    if ((key === "startDate" || key === "endDate") && p.range !== "custom") continue;
    if (key === "dateBasis" && !p.range) continue;
    sp.set(key, String(value));
  }
  return sp;
}

function paramsFromUrl(): OrderParams {
  const sp = new URLSearchParams(window.location.search);
  const page = Number(sp.get("page"));
  const out = { ...DEFAULTS } as Record<string, string | number>;
  for (const key of KEYS) if (key !== "page") out[key] = sp.get(key) ?? (DEFAULTS[key] as string);
  out.page = Number.isInteger(page) && page >= 1 ? page : 1;
  return out as unknown as OrderParams;
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
  initial: SupplierOrderPage;
  initialParams: OrderParams;
  renderedAt: number;
}

/**
 * The supplier's orders. The first page is read on the server; every later change (status, search, filter, sort, page) asks the company-scoped API again,
 * cancels and ignores answers overtaken by a newer request, and is kept in the address (so a detail page's Back button returns to the same list). The numbers,
 * statuses and amounts are only ever the server's. Nothing here creates, confirms, cancels or updates an order: no workflow for that exists, so the page says so.
 */
export function SupplierOrdersWorkspace({ initial, initialParams, renderedAt }: Props) {
  const [params, setParams] = useState(initialParams);
  const [search, setSearch] = useState(initialParams.q);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [sortHint, setSortHint] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const first = useRef(true);
  const latest = useRef(params);
  latest.current = params;

  const load = useCallback(async (p: OrderParams) => {
    const mine = ++request.current;
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setLoading(true);
    setError(false);
    const timer = window.setTimeout(() => mine === request.current && setSlow(true), 250);
    const res = await fetch(`/api/supplier/orders?${toQuery(p)}`, { cache: "no-store", signal: ctl.signal }).catch(() => null);
    window.clearTimeout(timer);
    if (mine !== request.current) return;
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (mine !== request.current) return;
    setLoading(false);
    setSlow(false);
    if (!body?.ok) {
      setError(true);
      return;
    }
    setData({ orders: body.orders, counts: body.data.counts, currencies: body.data.currencies, capabilities: body.data.capabilities, noSellers: body.data.noSellers, meta: body.meta });
    const qs = toQuery(p).toString();
    window.history.replaceState(window.history.state, "", qs ? `/supplier/orders?${qs}` : "/supplier/orders");
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void load(params);
  }, [params, load]);

  // coming back to the page (back button, a stale server render): read the address again, so what is shown always matches it
  useEffect(() => {
    const fromUrl = paramsFromUrl();
    const same = KEYS.every((k) => fromUrl[k] === initialParams[k]);
    const stale = Math.abs(Date.now() - renderedAt) > 15_000;
    if (same && !stale) return;
    setSearch(fromUrl.q);
    if (same) void load(fromUrl);
    else setParams(fromUrl);
  }, [initialParams, renderedAt, load]);

  // search is sent 300 ms after the last keystroke, from page 1
  useEffect(() => {
    if (search === latest.current.q) return;
    const timer = window.setTimeout(() => setParams((p) => ({ ...p, q: search, page: 1 })), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => () => controller.current?.abort(), []);

  const change = (patch: Partial<OrderParams>) => {
    setSortHint(null);
    setParams((p) => {
      const next = { ...p, page: 1, ...patch };
      // an amount sort has no meaning without one currency: clearing the currency returns to the default order
      if (AMOUNT_SORTS.includes(next.sort as never) && !next.currency) next.sort = "newest";
      return next;
    });
  };
  const { meta, counts } = data;
  const firstRow = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const lastRow = Math.min(meta.page * meta.limit, meta.total);
  const activeFilters = [params.status !== "all", params.range, params.currency, params.sort !== "newest"].filter(Boolean).length;
  const filtered = params.q !== "" || activeFilters > 0;
  const customInvalid = params.range === "custom" && (!params.startDate || !params.endDate);

  const reset = () => {
    setSearch("");
    setSortHint(null);
    setParams({ ...DEFAULTS });
  };

  function chooseSort(value: string) {
    if (AMOUNT_SORTS.includes(value as never) && !params.currency) {
      if (data.currencies.length === 1) return change({ sort: value, currency: data.currencies[0] });
      setSortHint("Choose a currency first: amounts in different currencies are not ranked together.");
      return;
    }
    change({ sort: value });
  }

  async function exportCsv() {
    setExporting(true);
    setNotice(null);
    const filters: Record<string, string> = {};
    for (const [key, value] of toQuery(params).entries()) if (key !== "page") filters[key] = value;
    const res = await fetch("/api/supplier/orders/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(filters) }).catch(() => null);
    setExporting(false);
    if (!res?.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      setNotice({ tone: "error", text: body?.message ?? "We could not prepare your export. Nothing was downloaded." });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "finbyn-mart-supplier-orders.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    const rows = Number(res.headers.get("X-Export-Rows") ?? 0);
    setNotice({ tone: "ok", text: `Exported ${rows.toLocaleString("en-IN")} order${rows === 1 ? "" : "s"}${res.headers.get("X-Export-Truncated") === "true" ? " (the file is limited to 5,000 rows: narrow the filters to export the rest)" : ""}.` });
  }

  const rowActions = (r: SupplierOrderRow) => (
    <span className={q.rowActions}>
      <Link href={r.detailHref} className={clsx(dash.btn, styles.viewBtn)} aria-label={`View order ${r.reference}`}>View</Link>
    </span>
  );

  return (
    <>
      <div className={clsx(dash.header, styles.noPrint)}>
        <div>
          <h1 className={dash.title}>Orders</h1>
          <p className={dash.welcome}>Manage confirmed orders and fulfilment.</p>
        </div>
        <div className={q.headerActions}>
          {data.capabilities.canExport && (
            <button type="button" className={dash.btn} onClick={exportCsv} disabled={exporting || data.noSellers} aria-busy={exporting}>
              <Download size={18} aria-hidden /> {exporting ? "Preparing..." : "Export"}
            </button>
          )}
        </div>
      </div>

      <ul className={styles.metrics} aria-label="Order summary: orders under your search and date filters, one count per order">
        {SUMMARY_CARDS.map((c) => {
          const Icon = CARD_ICONS[c.key];
          const active = params.status === c.key;
          return (
            <li key={c.key}>
              <button type="button" className={clsx(styles.metric, active && styles.metricActive)} aria-pressed={active} onClick={() => change({ status: c.key })}>
                <span className={styles.metricIcon}><Icon size={22} aria-hidden /></span>
                <span>
                  <span className={styles.metricLabel}>{c.label}</span>
                  <span className={styles.metricValue}>{counts[c.key].toLocaleString("en-IN")}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className={clsx(q.tabs, styles.chipsWrap)} role="group" aria-label="Filter orders by status">
        {ORDER_TABS.map((t) => (
          <button key={t.value} type="button" className={clsx(q.tab, params.status === t.value && q.tabActive)} aria-pressed={params.status === t.value} onClick={() => change({ status: t.value })}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={clsx(q.toolbar, styles.toolbarStack)}>
        <div className={q.search} role="search">
          <Search className={q.searchIcon} size={18} aria-hidden />
          <label htmlFor="so-search" className="visually-hidden">Search your orders</label>
          <input id="so-search" type="search" className={q.searchInput} placeholder="Search by order, quotation, inquiry or product..." value={search} maxLength={60} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
          {search && (
            <button type="button" className={q.iconBtn} aria-label="Clear search" onClick={() => { setSearch(""); setParams((p) => ({ ...p, q: "", page: 1 })); }}>
              <X size={18} aria-hidden />
            </button>
          )}
        </div>
        <FilterDrawer breakpoint="md" label="Filters" activeCount={activeFilters}>
          <div className={q.filterPanel} role="group" aria-label="Order filters" style={{ marginTop: 0, border: 0, padding: 0, background: "transparent" }}>
            <div className={q.field}>
              <label className={q.fieldLabel} htmlFor="so-status">Status</label>
              <Dropdown id="so-status" value={params.status} onChange={(v) => change({ status: v })} options={[...ORDER_TABS.map((x) => ({ value: x.value, label: x.label, group: "Status groups" })), ...EXACT_STATUS_KEYS.map((k) => ({ value: k, label: STATUS_LABEL[k.toUpperCase() as keyof typeof STATUS_LABEL], group: "Exact status" }))]} />
            </div>
            <div className={q.field}>
              <label className={q.fieldLabel} htmlFor="so-range">Date</label>
              <Dropdown id="so-range" value={params.range} onChange={(v) => change({ range: v, ...(v === "custom" ? {} : { startDate: "", endDate: "" }) })} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
            </div>
            {params.range !== "" && (
              <div className={q.field}>
                <label className={q.fieldLabel} htmlFor="so-basis">Date applies to</label>
                <Dropdown id="so-basis" value={params.dateBasis} onChange={(v) => change({ dateBasis: v })} options={DATE_BASES.map((b) => ({ value: b.value, label: b.label }))} />
              </div>
            )}
            {params.range === "custom" && (
              <>
                <div className={q.field}>
                  <label className={q.fieldLabel} htmlFor="so-start">From</label>
                  <input id="so-start" type="date" className={q.input} value={params.startDate} onChange={(e) => change({ startDate: e.target.value })} />
                </div>
                <div className={q.field}>
                  <label className={q.fieldLabel} htmlFor="so-end">To</label>
                  <input id="so-end" type="date" className={q.input} value={params.endDate} onChange={(e) => change({ endDate: e.target.value })} />
                </div>
                {customInvalid && <p className={q.fieldError} role="status">Choose both dates to apply the custom range.</p>}
              </>
            )}
            <div className={q.field}>
              <label className={q.fieldLabel} htmlFor="so-currency">Currency</label>
              <Dropdown id="so-currency" value={params.currency} onChange={(v) => change({ currency: v })} options={[{ value: "", label: "All currencies" }, ...data.currencies.map((c) => ({ value: c, label: c }))]} />
            </div>
            <div className={q.field}>
              <label className={q.fieldLabel} htmlFor="so-sort">Sort by</label>
              <Dropdown id="so-sort" value={params.sort} onChange={(v) => chooseSort(v)} describedBy={sortHint ? "so-sort-hint" : undefined} options={SORTS.map((o) => ({ value: o.value, label: o.label }))} />
              {sortHint && <p id="so-sort-hint" className={q.fieldError} role="status">{sortHint}</p>}
            </div>
            <div className={q.filterActions}>
              <button type="button" className={q.textBtn} onClick={reset} disabled={!filtered}>Clear filters</button>
            </div>
          </div>
        </FilterDrawer>
      </div>

      {notice && <p className={clsx(q.status, notice.tone === "error" && q.statusError)} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</p>}

      <div className={clsx(q.results, styles.refTable)} aria-busy={loading} aria-live="polite">
        {error ? (
          <div className={q.stateBox} role="alert">
            <h2 className={q.stateTitle}>Your orders could not be loaded</h2>
            <p className={q.stateText}>Nothing was changed. Check your connection and try again.</p>
            <button type="button" className={dash.btn} onClick={() => void load(params)}>Try again</button>
          </div>
        ) : loading && slow ? (
          <div aria-label="Loading your orders">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={q.skeletonRow} />)}</div>
        ) : data.noSellers ? (
          <div className={q.stateBox}>
            <h2 className={q.stateTitle}>No seller is linked to your company yet</h2>
            <p className={q.stateText}>Orders are listed for the sellers your company owns on Finbyn Mart. None is linked yet (the platform links them; a company cannot claim one itself), so there is nothing to show. No sample orders are shown.</p>
          </div>
        ) : meta.total === 0 ? (
          filtered ? (
            <div className={q.stateBox}>
              <h2 className={q.stateTitle}>No matching orders</h2>
              <p className={q.stateText}>No order matches your search and filters.</p>
              <button type="button" className={dash.btn} onClick={reset}>Clear search and filters</button>
            </div>
          ) : (
            <div className={q.stateBox}>
              <h2 className={q.stateTitle}>No orders yet</h2>
              <p className={q.stateText}>{data.capabilities.create.reason} A new account has none, and no sample orders are shown.</p>
              <Link href="/supplier/quotations" className={dash.btn}><PackageOpen size={18} aria-hidden /> View quotations</Link>
            </div>
          )
        ) : (
          <>
            <p className={q.summaryLine}>Showing {firstRow.toLocaleString("en-IN")}-{lastRow.toLocaleString("en-IN")} of {meta.total.toLocaleString("en-IN")} order{meta.total === 1 ? "" : "s"}</p>
            <div className={q.tableWrap}>
              <table className={q.table}>
                <caption>Your orders</caption>
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Buyer &amp; product</th>
                    <th scope="col" className={q.right}>Amount</th>
                    <th scope="col">Fulfilment</th>
                    <th scope="col">Payment</th>
                    <th scope="col">Updated</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((r) => (
                    <tr key={r.reference}>
                      <th scope="row" style={{ textTransform: "none", letterSpacing: 0, background: "transparent", whiteSpace: "normal" }}>
                        <Link href={r.detailHref} className={clsx(q.ref, q.link)}>{r.reference}</Link>
                        <span className={q.small}>Placed {r.placedLabel}</span>
                      </th>
                      <td className={styles.buyerCell}>
                        {r.buyer}
                        <span className={q.small}>{r.itemText}</span>
                        <span className={q.small}>{r.quantityText}</span>
                      </td>
                      <td className={q.right}><span className={q.amount}>{r.amount.text}</span></td>
                      <td><OrderStatusBadge group={r.statusGroup} label={r.statusLabel} /><span className={clsx(q.small, styles.fulfil)}>{r.fulfilment}</span></td>
                      <td><span className={styles.payment}>{r.payment.label}</span></td>
                      <td>{r.updatedLabel}</td>
                      <td>{rowActions(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className={q.cardList} aria-label="Your orders">
              {data.orders.map((r) => (
                <li key={r.reference} className={q.card}>
                  <div className={q.cardTop}>
                    <div>
                      <Link href={r.detailHref} className={clsx(q.ref, q.link)}>{r.reference}</Link>
                      <span className={q.small}>Placed {r.placedLabel}</span>
                    </div>
                    <OrderStatusBadge group={r.statusGroup} label={r.statusLabel} />
                  </div>
                  <dl className={q.facts}>
                    <div><dt>Buyer</dt><dd className={styles.buyerCell}>{r.buyer}</dd></div>
                    <div><dt>Product</dt><dd className={styles.buyerCell}>{r.itemText} ({r.quantityText})</dd></div>
                    <div><dt>Amount</dt><dd>{r.amount.text}</dd></div>
                    <div><dt>Fulfilment</dt><dd>{r.fulfilment}</dd></div>
                    <div><dt>Payment</dt><dd>{r.payment.label}</dd></div>
                    <div><dt>Updated</dt><dd>{r.updatedLabel}</dd></div>
                  </dl>
                  {rowActions(r)}
                </li>
              ))}
            </ul>
            {meta.totalPages > 1 && (
              <nav className={q.pager} aria-label="Order pages">
                <ul className={q.pages}>
                  <li><button type="button" className={q.pageBtn} aria-label="Previous page" disabled={meta.page <= 1} onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))}><ChevronLeft size={18} aria-hidden /></button></li>
                  {pageNumbers(meta.page, meta.totalPages).map((n, i) => (
                    <li key={`${n}-${i}`}>
                      {n === "gap" ? <span aria-hidden>…</span> : <button type="button" className={q.pageBtn} aria-current={n === meta.page ? "page" : undefined} aria-label={`Page ${n}`} onClick={() => setParams((p) => ({ ...p, page: n }))}>{n}</button>}
                    </li>
                  ))}
                  <li><button type="button" className={q.pageBtn} aria-label="Next page" disabled={meta.page >= meta.totalPages} onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))}><ChevronRight size={18} aria-hidden /></button></li>
                </ul>
              </nav>
            )}
          </>
        )}
      </div>

      <p className={clsx(q.reason, styles.noPrint, styles.infoBanner)}>
        <Info size={16} aria-hidden /> Counts are orders under your search, date and currency filters; Ready to Dispatch is counted separately from In Progress. Orders appear after the approved order-confirmation workflow. Payment status is unavailable because no payment ledger is connected. Search covers order, quotation and inquiry references and product names (buyer names are not searchable).
      </p>
    </>
  );
}

