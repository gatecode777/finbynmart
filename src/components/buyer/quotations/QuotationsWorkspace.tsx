"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileText, Hourglass, Package, Scale, Search, X, XCircle } from "lucide-react";
import { QUOTATION_SORTS, STATUS_TABS, COMPARE_MAX, COMPARE_MIN } from "@/lib/quotations/quotationRules";
import type { QuotationPage, QuotationRow } from "@/lib/quotations/service";
import dash from "../Dashboard.module.css";
import inq from "../inquiries/Inquiries.module.css";
import { QuotationStatusPill } from "./QuotationStatusPill";
import styles from "./Quotations.module.css";

export interface QuotationParams {
  q: string;
  status: string;
  sort: string;
  page: number;
}

const DEFAULTS: QuotationParams = { q: "", status: "all", sort: "received", page: 1 };
const KEYS = ["q", "status", "sort", "page"] as const;
const DEBOUNCE_MS = 300;

function toQuery(p: QuotationParams): URLSearchParams {
  const sp = new URLSearchParams();
  for (const key of KEYS) {
    const value = p[key];
    if (value !== "" && value !== DEFAULTS[key]) sp.set(key, String(value));
  }
  return sp;
}

function paramsFromUrl(): QuotationParams {
  const sp = new URLSearchParams(window.location.search);
  const page = Number(sp.get("page"));
  return { q: sp.get("q") ?? "", status: sp.get("status") ?? "all", sort: sp.get("sort") ?? "received", page: Number.isInteger(page) && page >= 1 ? page : 1 };
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

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

interface Props {
  initial: QuotationPage;
  initialParams: QuotationParams;
  renderedAt: number;
}

/**
 * The buyer's quotations. First page read on the server, every later change asks the buyer-scoped API again (answers overtaken by a
 * newer request are ignored) and is kept in the address. Ticking a row ONLY adds it to a comparison: it never accepts or changes a
 * quotation. Quotations cannot be created from this site yet (no supplier workflow), so an empty list is the normal state.
 */
export function QuotationsWorkspace({ initial, initialParams, renderedAt }: Props) {
  const [params, setParams] = useState(initialParams);
  const [search, setSearch] = useState(initialParams.q);
  const [data, setData] = useState(initial);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);
  const first = useRef(true);
  const latest = useRef(params);
  latest.current = params;

  const load = useCallback(async (p: QuotationParams) => {
    const mine = ++request.current;
    setLoading(true);
    setError(false);
    const timer = window.setTimeout(() => mine === request.current && setSlow(true), 250);
    const res = await fetch(`/api/buyer/quotations?${toQuery(p)}`, { cache: "no-store" }).catch(() => null);
    window.clearTimeout(timer);
    if (mine !== request.current) return;
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setLoading(false);
    setSlow(false);
    if (!body?.ok) {
      setError(true);
      return;
    }
    setData({ quotations: body.quotations, tabCounts: body.data.tabCounts, summary: body.data.summary, meta: body.meta });
    const qs = toQuery(p).toString();
    window.history.replaceState(window.history.state, "", qs ? `/buyer/quotations?${qs}` : "/buyer/quotations");
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void load(params);
  }, [params, load]);

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
    const refresh = () => void load(latest.current);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);

  const change = (patch: Partial<QuotationParams>) => setParams((p) => ({ ...p, page: 1, ...patch }));
  const toggle = (reference: string) => setPicked((cur) => (cur.includes(reference) ? cur.filter((r) => r !== reference) : cur.length >= COMPARE_MAX ? cur : [...cur, reference]));
  const { meta, summary, tabCounts } = data;
  const firstRow = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const lastRow = Math.min(meta.page * meta.limit, meta.total);
  const filtered = params.q !== "" || params.status !== "all";
  const compareHref = `/buyer/quotations/compare?refs=${picked.join(",")}`;

  const cards = [
    { label: "Total Quotations", value: summary.total, icon: FileText, tone: dash.toneMint },
    { label: "Active Quotations", value: summary.active, icon: Clock, tone: dash.toneCream },
    { label: "Expiring Soon", value: summary.expiringSoon, icon: Hourglass, tone: dash.toneCream },
    { label: "Accepted", value: summary.accepted, icon: CheckCircle2, tone: dash.toneMint },
    { label: "Rejected", value: summary.rejected, icon: XCircle, tone: dash.toneBlue },
  ];

  const unit = (r: QuotationRow) => `${r.quantity.toLocaleString("en-IN")}${r.unit ? ` ${r.unit}` : ""}`;
  const thumb = (r: QuotationRow) => (
    <span className={inq.thumb} aria-hidden>
      {r.product.imageSrc ? <Image src={r.product.imageSrc} alt="" width={56} height={56} unoptimized={r.product.imageRemote} /> : <Package size={24} />}
    </span>
  );
  const select = (r: QuotationRow) => <input type="checkbox" className={styles.check} checked={picked.includes(r.reference)} onChange={() => toggle(r.reference)} aria-label={`Select ${r.reference} for comparison`} disabled={!picked.includes(r.reference) && picked.length >= COMPARE_MAX} />;
  const totalCell = (r: QuotationRow) => (r.total ? <span className={styles.total}>{r.total.text}{!r.total.taxSpecified && <span className={styles.small}>before tax</span>}</span> : "Not available");

  return (
    <>
      <ul className={clsx(dash.kpiGrid, styles.kpis)} aria-label="Quotation summary">
        {cards.map((c) => (
          <li key={c.label} className={`${dash.kpiCard} ${c.tone}`}>
            <span className={dash.kpiIcon}><c.icon size={24} aria-hidden /></span>
            <div className={dash.kpiBody}>
              <h2 className={dash.kpiLabel}>{c.label}</h2>
              <p className={dash.kpiValue}>{c.value.toLocaleString("en-IN")}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className={inq.tabs} role="group" aria-label="Filter quotations by status">
        {STATUS_TABS.map((t) => (
          <button key={t.value} type="button" className={clsx(inq.tab, params.status === t.value && inq.tabActive)} aria-pressed={params.status === t.value} onClick={() => change({ status: t.value })}>
            {t.label} ({tabCounts[t.value].toLocaleString("en-IN")})
          </button>
        ))}
      </div>

      <div className={inq.toolbar}>
        <div className={inq.search} role="search">
          <Search className={inq.searchIcon} size={18} aria-hidden />
          <label htmlFor="quotation-search" className="visually-hidden">Search your quotations</label>
          <input id="quotation-search" type="search" className={inq.searchInput} placeholder="Search by quotation no., inquiry ref., product or supplier..." value={search} maxLength={60} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
          {search && (
            <button type="button" className={inq.searchClear} aria-label="Clear search" onClick={() => { setSearch(""); setParams((p) => ({ ...p, q: "", page: 1 })); }}>
              <X size={18} aria-hidden />
            </button>
          )}
        </div>
        <label className="visually-hidden" htmlFor="quotation-sort">Sort quotations</label>
        <select id="quotation-sort" className={inq.select} value={params.sort} onChange={(e) => change({ sort: e.target.value })}>
          {QUOTATION_SORTS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
        </select>
      </div>

      <div className={inq.results} aria-busy={loading} aria-live="polite">
        {error ? (
          <div className={inq.emptyBox} role="alert">
            <h2 className={inq.emptyTitle}>Your quotations could not be loaded</h2>
            <p className={inq.emptyText}>Nothing was changed. Check your connection and try again.</p>
            <button type="button" className={inq.btn} onClick={() => void load(params)}>Try again</button>
          </div>
        ) : loading && slow ? (
          <div aria-label="Loading your quotations">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={inq.skeletonRow} />)}</div>
        ) : data.quotations.length === 0 ? (
          summary.total === 0 ? (
            <div className={inq.emptyBox}>
              <h2 className={inq.emptyTitle}>No Quotations Yet</h2>
              <p className={inq.emptyText}>Quotations from suppliers will appear here once a supplier sends one for your inquiry. Suppliers cannot send quotations through Finbyn Mart yet, so none can arrive at the moment.</p>
              <Link href="/buyer/inquiries" className={inq.cta}>View My Inquiries</Link>
            </div>
          ) : (
            <div className={inq.emptyBox}>
              <h2 className={inq.emptyTitle}>{params.q ? "No matching quotations" : "No quotations in this group"}</h2>
              <p className={inq.emptyText}>{params.q ? "Nothing you received matches that search." : "Choose another group."}</p>
              <button type="button" className={inq.btn} onClick={() => { setSearch(""); setParams({ ...DEFAULTS }); }}>Clear filters</button>
            </div>
          )
        ) : (
          <>
            <div className={inq.tableWrap}>
              <table className={inq.table}>
                <caption>Your quotations</caption>
                <thead>
                  <tr>
                    <th scope="col" className={styles.selectCell}><span className="visually-hidden">Select for comparison</span></th>
                    <th scope="col">Quotation No.</th>
                    <th scope="col">Product / Requirement</th>
                    <th scope="col">Supplier</th>
                    <th scope="col">Quantity</th>
                    <th scope="col">Unit Price</th>
                    <th scope="col">Total Amount</th>
                    <th scope="col">Valid Till</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.quotations.map((r) => (
                    <tr key={r.reference}>
                      <td>{select(r)}</td>
                      <td><span className={inq.refCell}><Link href={r.detailHref} className={inq.reference}>{r.reference}</Link><span className={inq.refType}>{r.inquiryReference} · V{r.version}</span></span></td>
                      <td><span className={inq.productCell}>{thumb(r)}<span className={inq.productName}>{r.product.url ? <Link href={r.product.url}>{r.productName}</Link> : r.productName}</span></span></td>
                      <td><span className={inq.supplierCell}><span className={inq.initials} aria-hidden>{r.supplier.initials}</span><span className={inq.supplierName}>{r.supplier.url ? <Link href={r.supplier.url}>{r.supplier.name}</Link> : r.supplier.name}</span></span></td>
                      <td className={inq.nowrap}>{unit(r)}</td>
                      <td className={inq.nowrap}>{r.unitPrice}</td>
                      <td className={inq.nowrap}>{totalCell(r)}</td>
                      <td><time dateTime={r.validUntil}>{when(r.validUntil)}</time></td>
                      <td><QuotationStatusPill status={r.status} label={r.statusLabel} /></td>
                      <td><Link href={r.detailHref} className={inq.btn} aria-label={`View details of ${r.reference}`}>View Details <ArrowRight size={16} aria-hidden /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className={inq.cards} aria-label="Your quotations">
              {data.quotations.map((r) => (
                <li key={r.reference} className={inq.card}>
                  <div className={inq.cardTop}>
                    <span className={inq.refCell}><Link href={r.detailHref} className={inq.reference}>{r.reference}</Link><span className={inq.refType}>{r.inquiryReference} · V{r.version}</span></span>
                    <QuotationStatusPill status={r.status} label={r.statusLabel} />
                  </div>
                  <span className={inq.productCell}>{thumb(r)}<span className={inq.productName}>{r.productName}</span></span>
                  <dl className={inq.facts}>
                    <div><dt>Supplier</dt><dd>{r.supplier.name}</dd></div>
                    <div><dt>Quantity</dt><dd>{unit(r)}</dd></div>
                    <div><dt>Unit Price</dt><dd>{r.unitPrice}</dd></div>
                    <div><dt>Total Amount</dt><dd>{totalCell(r)}</dd></div>
                    <div><dt>Valid Till</dt><dd><time dateTime={r.validUntil}>{when(r.validUntil)}</time></dd></div>
                    <div><dt>Compare</dt><dd>{select(r)}</dd></div>
                  </dl>
                  <div className={inq.cardActions}>
                    <Link href={r.detailHref} className={`${inq.btn} ${inq.btnPrimary}`}>View Details <ArrowRight size={16} aria-hidden /></Link>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {picked.length > 0 && (
        <div className={styles.selectBar} role="status">
          <p>{picked.length} selected for comparison (choose {COMPARE_MIN} to {COMPARE_MAX} from the same inquiry). Selecting does not accept or change a quotation.</p>
          {picked.length >= COMPARE_MIN ? (
            <Link href={compareHref} className={`${inq.btn} ${inq.btnPrimary}`}><Scale size={16} aria-hidden /> Compare Selected ({picked.length})</Link>
          ) : null}
          <button type="button" className={inq.btn} onClick={() => setPicked([])}>Clear selection</button>
        </div>
      )}

      {!error && meta.total > 0 && (
        <nav className={inq.pager} aria-label="Quotation pages">
          <p className={inq.muted} aria-live="polite">Showing {firstRow.toLocaleString("en-IN")} - {lastRow.toLocaleString("en-IN")} of {meta.total.toLocaleString("en-IN")} quotations</p>
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
      {filtered && meta.total > 0 && <p className="visually-hidden" aria-live="polite">{meta.total} quotations match your filters.</p>}
    </>
  );
}
