"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Ban, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, FileEdit, FileText, Filter, Hourglass, Plus, Search, Send, X, XCircle } from "lucide-react";
import { DATE_BASES, SUPPLIER_SORTS, SUPPLIER_TABS, VALIDITY_FILTERS } from "@/lib/supplier/quotationRules";
import type { SupplierQuotationPage, SupplierQuotationRow } from "@/lib/supplier/quotationService";
import dash from "../dashboard/SupplierDashboard.module.css";
import { SupplierStatusBadge } from "./SupplierStatusBadge";
import { WithdrawDialog } from "./WithdrawDialog";
import styles from "./SupplierQuotations.module.css";

export interface QuotationParams {
  q: string;
  status: string;
  sort: string;
  range: string;
  startDate: string;
  endDate: string;
  dateBasis: string;
  validity: string;
  currency: string;
  page: number;
}

const DEFAULTS: QuotationParams = { q: "", status: "all", sort: "newest", range: "", startDate: "", endDate: "", dateBasis: "created", validity: "", currency: "", page: 1 };
const KEYS = Object.keys(DEFAULTS) as (keyof QuotationParams)[];
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

function toQuery(p: QuotationParams): URLSearchParams {
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

function paramsFromUrl(): QuotationParams {
  const sp = new URLSearchParams(window.location.search);
  const page = Number(sp.get("page"));
  const out = { ...DEFAULTS } as Record<string, string | number>;
  for (const key of KEYS) if (key !== "page") out[key] = sp.get(key) ?? (DEFAULTS[key] as string);
  out.page = Number.isInteger(page) && page >= 1 ? page : 1;
  return out as unknown as QuotationParams;
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

const CARDS = [
  { key: "total", tab: "all", label: "Total Quotations", icon: FileText, cream: false },
  { key: "drafts", tab: "drafts", label: "Drafts", icon: FileEdit, cream: true },
  { key: "submitted", tab: "submitted", label: "Submitted", icon: Send, cream: false },
  { key: "accepted", tab: "accepted", label: "Accepted", icon: CheckCircle2, cream: false },
  { key: "rejected", tab: "rejected", label: "Rejected", icon: XCircle, cream: true },
  { key: "expired", tab: "expired", label: "Expired", icon: Clock, cream: true },
] as const;

interface Props {
  initial: SupplierQuotationPage;
  initialParams: QuotationParams;
  renderedAt: number;
}

/**
 * The supplier's quotations. The first page is read on the server; every later change (tab, search, filter, sort, page) asks the company-scoped API
 * again, ignores answers overtaken by a newer request, and is kept in the address. The numbers, statuses and amounts are only ever the server's.
 * Creating, editing and revising a quotation are NOT offered because no workflow for them exists: the button says so instead of pretending.
 */
export function SupplierQuotationsWorkspace({ initial, initialParams, renderedAt }: Props) {
  const [params, setParams] = useState(initialParams);
  const [search, setSearch] = useState(initialParams.q);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(() => Boolean(initialParams.range || initialParams.validity || initialParams.currency));
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [withdrawing, setWithdrawing] = useState<SupplierQuotationRow | null>(null);
  const request = useRef(0);
  const first = useRef(true);
  const latest = useRef(params);
  latest.current = params;

  const load = useCallback(async (p: QuotationParams) => {
    const mine = ++request.current;
    setLoading(true);
    setError(false);
    const timer = window.setTimeout(() => mine === request.current && setSlow(true), 250);
    const res = await fetch(`/api/supplier/quotations?${toQuery(p)}`, { cache: "no-store" }).catch(() => null);
    window.clearTimeout(timer);
    if (mine !== request.current) return;
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setLoading(false);
    setSlow(false);
    if (!body?.ok) {
      setError(true);
      return;
    }
    setData({ quotations: body.quotations, tabCounts: body.data.tabCounts, summary: body.data.summary, currencies: body.data.currencies, capabilities: body.data.capabilities, noSellers: body.data.noSellers, meta: body.meta });
    const qs = toQuery(p).toString();
    window.history.replaceState(window.history.state, "", qs ? `/supplier/quotations?${qs}` : "/supplier/quotations");
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

  useEffect(() => {
    if (search === latest.current.q) return;
    const timer = window.setTimeout(() => setParams((p) => ({ ...p, q: search, page: 1 })), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const change = (patch: Partial<QuotationParams>) => setParams((p) => ({ ...p, page: 1, ...patch }));
  const { meta, summary, tabCounts } = data;
  const firstRow = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const lastRow = Math.min(meta.page * meta.limit, meta.total);
  const activeFilters = [params.range, params.validity, params.currency].filter(Boolean).length;
  const filtered = params.q !== "" || params.status !== "all" || activeFilters > 0;
  const customInvalid = params.range === "custom" && (!params.startDate || !params.endDate);

  const reset = () => {
    setSearch("");
    setParams({ ...DEFAULTS });
  };

  async function exportCsv() {
    setExporting(true);
    setNotice(null);
    const { page: _p, ...filters } = toQueryObject(params);
    void _p;
    const res = await fetch("/api/supplier/quotations/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(filters) }).catch(() => null);
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
    a.download = "finbyn-mart-supplier-quotations.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    const rows = Number(res.headers.get("X-Export-Rows") ?? 0);
    setNotice({ tone: "ok", text: `Exported ${rows.toLocaleString("en-IN")} quotation${rows === 1 ? "" : "s"}${res.headers.get("X-Export-Truncated") === "true" ? " (the file is limited to 5,000 rows: narrow the filters to export the rest)" : ""}.` });
  }

  const totalCell = (r: SupplierQuotationRow) =>
    r.total ? (
      <span className={styles.amount}>
        {r.total.text}
        {!r.total.taxSpecified && <span className={styles.small}>before tax</span>}
      </span>
    ) : (
      "Not available"
    );
  const qty = (r: SupplierQuotationRow) => `${r.quantity.toLocaleString("en-IN")}${r.unit ? ` ${r.unit}` : ""}`;
  const validity = (r: SupplierQuotationRow) => (
    <>
      {r.validLabel}
      {r.daysLeft !== null && <span className={styles.small}>{r.daysLeft > 0 ? `${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"} left` : "Ends today"}</span>}
    </>
  );
  const rowActions = (r: SupplierQuotationRow) => (
    <span className={styles.rowActions}>
      <Link prefetch={false} href={r.detailHref} className={dash.btn} aria-label={`View quotation ${r.reference}`}>View</Link>
      {r.editHref && <Link prefetch={false} href={r.editHref} className={dash.btn} aria-label={`Continue draft ${r.reference}`}>Continue draft</Link>}
      {r.actions.withdraw && (
        <button type="button" className={dash.btn} onClick={() => setWithdrawing(r)} aria-label={`Withdraw quotation ${r.reference}`}>
          <Ban size={16} aria-hidden /> Withdraw
        </button>
      )}
    </span>
  );

  return (
    <>
      <div className={clsx(dash.header, styles.noPrint)}>
        <div>
          <h1 className={dash.title}>Quotations</h1>
          <p className={dash.welcome}>Create, manage and track your quotations for buyer inquiries.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={dash.btn} onClick={exportCsv} disabled={exporting || data.noSellers} aria-busy={exporting}>
            <Download size={18} aria-hidden /> {exporting ? "Preparing..." : "Export"}
          </button>
          {data.capabilities.canCreate ? (
            <Link prefetch={false} href="/supplier/quotations/create" className={clsx(dash.btn, styles.primaryBtn)}>
              <Plus size={18} aria-hidden /> Create Quotation
            </Link>
          ) : (
            <button type="button" className={clsx(dash.btn, styles.btnDisabled)} disabled aria-describedby="create-unavailable">
              <Plus size={18} aria-hidden /> Create Quotation
            </button>
          )}
        </div>
      </div>
      {data.capabilities.createReason && <p id="create-unavailable" className={styles.reason}>{data.capabilities.createReason}</p>}

      <ul className={clsx(dash.kpis, styles.kpis)} aria-label="Quotation summary (all time, one count per quotation)">
        {CARDS.map((c) => (
          <li key={c.key}>
            <button type="button" className={clsx(styles.kpiButton, c.cream && styles.kpiCream, params.status === c.tab && styles.kpiActive)} aria-pressed={params.status === c.tab} onClick={() => change({ status: c.tab })}>
              <span className={dash.kpiIcon}><c.icon size={22} aria-hidden /></span>
              <span className={styles.kpiBody}>
                <span className={dash.kpiLabel}>{c.label}</span>
                <span className={dash.kpiValue} style={{ display: "block" }}>{summary[c.key].toLocaleString("en-IN")}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.tabs} role="group" aria-label="Filter quotations by status">
        {SUPPLIER_TABS.map((t) => (
          <button key={t.value} type="button" className={clsx(styles.tab, params.status === t.value && styles.tabActive)} aria-pressed={params.status === t.value} onClick={() => change({ status: t.value })}>
            {t.label} ({tabCounts[t.value].toLocaleString("en-IN")})
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.search} role="search">
          <Search className={styles.searchIcon} size={18} aria-hidden />
          <label htmlFor="sq-search" className="visually-hidden">Search your quotations</label>
          <input id="sq-search" type="search" className={styles.searchInput} placeholder="Search by quotation ref., inquiry ref. or product..." value={search} maxLength={60} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
          {search && (
            <button type="button" className={styles.iconBtn} aria-label="Clear search" onClick={() => { setSearch(""); setParams((p) => ({ ...p, q: "", page: 1 })); }}>
              <X size={18} aria-hidden />
            </button>
          )}
        </div>
        <button type="button" className={dash.btn} aria-expanded={filtersOpen} aria-controls="sq-filters" onClick={() => setFiltersOpen((o) => !o)}>
          <Filter size={18} aria-hidden /> Filters {activeFilters > 0 && <span className={styles.count}>{activeFilters}</span>}
        </button>
        <div className={styles.field}>
          <label className="visually-hidden" htmlFor="sq-sort">Sort quotations</label>
          <select id="sq-sort" className={styles.input} value={params.sort} onChange={(e) => change({ sort: e.target.value })}>
            {SUPPLIER_SORTS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
          </select>
        </div>
      </div>

      {filtersOpen && (
        <div id="sq-filters" className={styles.filterPanel} role="group" aria-label="Quotation filters">
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="sq-range">Date</label>
            <select id="sq-range" className={styles.input} value={params.range} onChange={(e) => change({ range: e.target.value, ...(e.target.value === "custom" ? {} : { startDate: "", endDate: "" }) })}>
              {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          {params.range !== "" && (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="sq-basis">Date applies to</label>
              <select id="sq-basis" className={styles.input} value={params.dateBasis} onChange={(e) => change({ dateBasis: e.target.value })}>
                {DATE_BASES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
          )}
          {params.range === "custom" && (
            <>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="sq-start">From</label>
                <input id="sq-start" type="date" className={styles.input} value={params.startDate} onChange={(e) => change({ startDate: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="sq-end">To</label>
                <input id="sq-end" type="date" className={styles.input} value={params.endDate} onChange={(e) => change({ endDate: e.target.value })} />
              </div>
              {customInvalid && <p className={styles.fieldError} role="status">Choose both dates to apply the custom range.</p>}
            </>
          )}
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="sq-validity">Validity</label>
            <select id="sq-validity" className={styles.input} value={params.validity} onChange={(e) => change({ validity: e.target.value })}>
              <option value="">Any validity</option>
              {VALIDITY_FILTERS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="sq-currency">Currency</label>
            <select id="sq-currency" className={styles.input} value={params.currency} onChange={(e) => change({ currency: e.target.value })}>
              <option value="">All currencies</option>
              {data.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className={styles.filterActions}>
            <button type="button" className={styles.textBtn} onClick={reset} disabled={!filtered}>Clear all filters</button>
          </div>
        </div>
      )}

      {notice && <p className={clsx(styles.status, notice.tone === "error" && styles.statusError)} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</p>}

      <div className={styles.results} aria-busy={loading} aria-live="polite">
        {error ? (
          <div className={styles.stateBox} role="alert">
            <h2 className={styles.stateTitle}>Your quotations could not be loaded</h2>
            <p className={styles.stateText}>Nothing was changed. Check your connection and try again.</p>
            <button type="button" className={dash.btn} onClick={() => void load(params)}>Try again</button>
          </div>
        ) : loading && slow ? (
          <div aria-label="Loading your quotations">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={styles.skeletonRow} />)}</div>
        ) : data.noSellers ? (
          <div className={styles.stateBox}>
            <h2 className={styles.stateTitle}>No seller is linked to your company yet</h2>
            <p className={styles.stateText}>Quotations are listed for the sellers your company owns on Finbyn Mart. None is linked yet (the platform links them; a company cannot claim one itself), so there is nothing to show. No sample quotations are shown.</p>
          </div>
        ) : meta.total === 0 ? (
          filtered ? (
            <div className={styles.stateBox}>
              <h2 className={styles.stateTitle}>No matching quotations</h2>
              <p className={styles.stateText}>No quotation matches your search and filters.</p>
              <button type="button" className={dash.btn} onClick={reset}>Clear search and filters</button>
            </div>
          ) : (
            <div className={styles.stateBox}>
              <h2 className={styles.stateTitle}>No Quotations Yet</h2>
              <p className={styles.stateText}>Create a quotation for an eligible buyer inquiry to share your commercial offer.</p>
              <Link prefetch={false} href="/supplier/quotations/create" className={clsx(dash.btn, styles.primaryBtn)}>Create Quotation</Link>
            </div>
          )
        ) : (
          <>
            <p className={styles.summaryLine}>Showing {firstRow.toLocaleString("en-IN")}-{lastRow.toLocaleString("en-IN")} of {meta.total.toLocaleString("en-IN")} quotation{meta.total === 1 ? "" : "s"}</p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption>Your quotations</caption>
                <thead>
                  <tr>
                    <th scope="col">Quotation Ref.</th>
                    <th scope="col">Inquiry Ref.</th>
                    <th scope="col">Buyer / Company</th>
                    <th scope="col">Requirement / Product</th>
                    <th scope="col" className={styles.right}>Quoted Amount</th>
                    <th scope="col">Validity</th>
                    <th scope="col">Status</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.quotations.map((r) => (
                    <tr key={`${r.reference}-${r.version}`}>
                      <th scope="row" style={{ textTransform: "none", letterSpacing: 0, background: "transparent", whiteSpace: "normal" }}>
                        <Link prefetch={false} href={r.detailHref} className={clsx(styles.ref, styles.link)}>{r.reference}</Link>
                        <span className={styles.small}>Version {r.version} · {r.createdLabel}</span>
                      </th>
                      <td><Link prefetch={false} href={`/supplier/inquiries/${r.inquiryReference}`} className={styles.link}>{r.inquiryReference}</Link></td>
                      <td>{r.buyer}</td>
                      <td>{r.productName}<span className={styles.small}>{qty(r)}</span></td>
                      <td className={styles.right}>{totalCell(r)}</td>
                      <td>{validity(r)}</td>
                      <td><SupplierStatusBadge status={r.status} label={r.statusLabel} /></td>
                      <td>{rowActions(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className={styles.cardList} aria-label="Your quotations">
              {data.quotations.map((r) => (
                <li key={`${r.reference}-${r.version}`} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div>
                      <Link prefetch={false} href={r.detailHref} className={clsx(styles.ref, styles.link)}>{r.reference}</Link>
                      <span className={styles.small}>Version {r.version} · {r.createdLabel}</span>
                    </div>
                    <SupplierStatusBadge status={r.status} label={r.statusLabel} />
                  </div>
                  <dl className={styles.facts}>
                    <div><dt>Inquiry</dt><dd><Link prefetch={false} href={`/supplier/inquiries/${r.inquiryReference}`} className={styles.link}>{r.inquiryReference}</Link></dd></div>
                    <div><dt>Buyer</dt><dd>{r.buyer}</dd></div>
                    <div><dt>Product</dt><dd>{r.productName} ({qty(r)})</dd></div>
                    <div><dt>Quoted amount</dt><dd>{totalCell(r)}</dd></div>
                    <div><dt>Valid until</dt><dd>{validity(r)}</dd></div>
                  </dl>
                  {rowActions(r)}
                </li>
              ))}
            </ul>
            {meta.totalPages > 1 && (
              <nav className={styles.pager} aria-label="Quotation pages">
                <ul className={styles.pages}>
                  <li><button type="button" className={styles.pageBtn} aria-label="Previous page" disabled={meta.page <= 1} onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))}><ChevronLeft size={18} aria-hidden /></button></li>
                  {pageNumbers(meta.page, meta.totalPages).map((n, i) => (
                    <li key={`${n}-${i}`}>
                      {n === "gap" ? <span aria-hidden>…</span> : <button type="button" className={styles.pageBtn} aria-current={n === meta.page ? "page" : undefined} aria-label={`Page ${n}`} onClick={() => setParams((p) => ({ ...p, page: n }))}>{n}</button>}
                    </li>
                  ))}
                  <li><button type="button" className={styles.pageBtn} aria-label="Next page" disabled={meta.page >= meta.totalPages} onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))}><ChevronRight size={18} aria-hidden /></button></li>
                </ul>
              </nav>
            )}
          </>
        )}
      </div>

      <p className={clsx(styles.reason, styles.noPrint)}><Hourglass size={14} aria-hidden style={{ verticalAlign: "-2px" }} /> Counts at the top are all-time, one per quotation (revisions are not counted twice). Expiry follows each quotation&apos;s valid-until date at the time you open the page. Acceptance and rejection are recorded only from the buyer&apos;s own decision.</p>

      {withdrawing && (
        <WithdrawDialog
          reference={withdrawing.reference}
          statusLabel={withdrawing.statusLabel}
          open
          onClose={() => setWithdrawing(null)}
          onWithdrawn={(message, buyerNotified) => {
            setWithdrawing(null);
            setNotice({ tone: "ok", text: message });
            void buyerNotified;
            void load(latest.current);
          }}
        />
      )}
    </>
  );
}

function toQueryObject(p: QuotationParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of toQuery(p).entries()) out[key] = value;
  return out;
}
