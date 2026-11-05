"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, FileText, Filter, RefreshCw, Search, Ticket, X } from "lucide-react";
import { DATE_RANGES, RELATED_TYPES, SORTS, STATUS_LABEL, SUPPORT_CATEGORIES, TICKET_STATUSES } from "@/lib/support/ticketRules";
import type { SupportChannel } from "@/lib/support/channels";
import type { TicketPage, TicketSummary } from "@/lib/support/ticketService";
import dash from "../Dashboard.module.css";
import inq from "../inquiries/Inquiries.module.css";
import { BuyerSupportTicketTable } from "./BuyerSupportTicketTable";
import { RaiseSupportTicketForm, type SupportFormConfig } from "./RaiseSupportTicketForm";
import { SupportContactChannels } from "./SupportContactChannels";
import { SupportFAQAccordion, type FaqItem } from "./SupportFAQAccordion";
import { SupportTicketFilters, type TicketFilterValues } from "./SupportTicketFilters";
import styles from "./Support.module.css";

export interface TicketParams {
  q: string;
  status: string;
  categoryId: string;
  relatedEntityType: string;
  range: string;
  dateFrom: string;
  dateTo: string;
  sort: string;
  page: number;
}

const DEFAULTS: TicketParams = { q: "", status: "all", categoryId: "", relatedEntityType: "", range: "", dateFrom: "", dateTo: "", sort: "newest", page: 1 };
const KEYS = ["q", "status", "categoryId", "relatedEntityType", "range", "dateFrom", "dateTo", "sort", "page"] as const;
const DEBOUNCE_MS = 300;

function toQuery(p: TicketParams): URLSearchParams {
  const sp = new URLSearchParams();
  for (const key of KEYS) {
    const value = p[key];
    if (value !== "" && value !== DEFAULTS[key]) sp.set(key, String(value));
  }
  return sp;
}

function paramsFromUrl(): TicketParams {
  const sp = new URLSearchParams(window.location.search);
  const page = Number(sp.get("page"));
  const out: TicketParams = { ...DEFAULTS };
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

interface Props {
  initial: TicketPage;
  initialParams: TicketParams;
  initialSummary: TicketSummary | null;
  config: SupportFormConfig;
  faqs: FaqItem[];
  faqCategories: { value: string; label: string; count: number }[];
  channels: SupportChannel[];
  today: string;
  /** When the server built this page (ms). An old value means it was restored from the browser's cache, so it is read again. */
  renderedAt: number;
}

/**
 * The buyer's Help & Support page. The first list and the numbers are read on the server; the form, search, filters, sort and paging
 * go through the buyer-scoped API and keep the choices in the address. A ticket is shown only after the server saved it; the cards
 * count real stored tickets. No ticket, reply, agent or contact detail is ever made up.
 */
/** The list's search and filters, kept for this browser tab so a ticket page's "Back to All Tickets" returns to the same view. */
function remember(search: string) {
  try {
    sessionStorage.setItem("support-list-query", search);
  } catch {
    /* storage blocked: Back goes to the plain list */
  }
}

export function BuyerSupportPage({ initial, initialParams, initialSummary, config, faqs, faqCategories, channels, today, renderedAt }: Props) {
  const [params, setParams] = useState(initialParams);
  const [search, setSearch] = useState(initialParams.q);
  const [data, setData] = useState(initial);
  const [summary, setSummary] = useState<TicketSummary | null>(initialSummary);
  const [summaryFailed, setSummaryFailed] = useState(initialSummary === null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const request = useRef(0);
  const first = useRef(true);
  const latest = useRef(params);
  latest.current = params;

  const load = useCallback(async (p: TicketParams) => {
    const mine = ++request.current;
    setLoading(true);
    setError(false);
    const timer = window.setTimeout(() => mine === request.current && setSlow(true), 250);
    const res = await fetch(`/api/buyer/support/tickets?${toQuery(p)}`, { cache: "no-store" }).catch(() => null);
    window.clearTimeout(timer);
    if (mine !== request.current) return;
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setLoading(false);
    setSlow(false);
    if (!body?.ok) {
      setError(true);
      return;
    }
    setData({ tickets: body.tickets, meta: body.meta });
    const qs = toQuery(p).toString();
    window.history.replaceState(window.history.state, "", qs ? `/buyer/support?${qs}` : "/buyer/support");
    remember(qs ? `?${qs}` : "");
  }, []);

  const loadSummary = useCallback(async () => {
    const res = await fetch("/api/buyer/support/summary", { cache: "no-store" }).catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (!body?.ok) {
      setSummaryFailed(true);
      return;
    }
    setSummary(body.data.summary);
    setSummaryFailed(false);
  }, []);

  useEffect(() => {
    remember(window.location.search);
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

  const change = (patch: Partial<TicketParams>) => setParams((p) => ({ ...p, page: 1, ...patch }));
  const activeFilters = [params.status !== "all" ? params.status : "", params.categoryId, params.relatedEntityType, params.range].filter(Boolean).length;
  const anyFilter = activeFilters > 0 || params.q !== "";
  const clearAdvanced = { status: "all", categoryId: "", relatedEntityType: "", range: "", dateFrom: "", dateTo: "" };

  const chips: { key: string; label: string; clear: Partial<TicketParams> }[] = [];
  if (params.status !== "all") chips.push({ key: "status", label: STATUS_LABEL[TICKET_STATUSES.find((s) => s.toLowerCase() === params.status) ?? "OPEN"], clear: { status: "all" } });
  if (params.categoryId) chips.push({ key: "category", label: SUPPORT_CATEGORIES.find((c) => c.value === params.categoryId)?.label ?? params.categoryId, clear: { categoryId: "" } });
  if (params.relatedEntityType) chips.push({ key: "related", label: RELATED_TYPES.find((t) => t.value === params.relatedEntityType)?.label ?? params.relatedEntityType, clear: { relatedEntityType: "" } });
  if (params.range) chips.push({ key: "range", label: params.range === "custom" ? `${params.dateFrom} to ${params.dateTo}` : (DATE_RANGES.find((r) => r.value === params.range)?.label ?? params.range), clear: { range: "", dateFrom: "", dateTo: "" } });

  const onCreated = () => {
    // a ticket was saved: show it (newest first, first page) and re-count
    setSearch("");
    setParams({ ...DEFAULTS });
    void loadSummary();
  };

  const { meta } = data;
  const firstRow = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const lastRow = Math.min(meta.page * meta.limit, meta.total);
  const cards = summary
    ? [
        { label: "My Tickets", value: summary.total, icon: FileText, tone: dash.toneMint, note: "All support requests" },
        { label: "Open Tickets", value: summary.open, icon: Clock, tone: dash.toneCream, note: "Need attention" },
        { label: "In Progress", value: summary.inProgress, icon: RefreshCw, tone: dash.toneBlue, note: "Being worked on" },
        { label: "Resolved", value: summary.resolved, icon: CheckCircle2, tone: dash.toneMint, note: "Closed tickets" },
      ]
    : [];

  return (
    <>
      {summaryFailed || !summary ? (
        <div className={dash.card} role="alert">
          <p className={dash.welcome}>The ticket numbers could not be loaded. The rest of the page still works.</p>
          <button type="button" className={inq.btn} onClick={() => void loadSummary()}>Try again</button>
        </div>
      ) : (
        <ul className={clsx(dash.kpiGrid, styles.summaryGap)} aria-label="Support ticket summary">
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

      <div className={styles.layout}>
        <RaiseSupportTicketForm config={config} onCreated={onCreated} />

        <section className={clsx(styles.panel, styles.tickets)} aria-labelledby="my-tickets-title">
          <h2 id="my-tickets-title" className={styles.panelTitle}><Ticket size={22} aria-hidden /> My Support Tickets</h2>
          <div className={inq.toolbar}>
            <div className={inq.search} role="search">
              <Search className={inq.searchIcon} size={18} aria-hidden />
              <label htmlFor="ticket-search" className="visually-hidden">Search your tickets</label>
              <input id="ticket-search" type="search" className={inq.searchInput} placeholder="Search by ticket, subject or related reference..." value={search} maxLength={60} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
              {search && (
                <button type="button" className={inq.searchClear} aria-label="Clear search" onClick={() => { setSearch(""); setParams((p) => ({ ...p, q: "", page: 1 })); }}>
                  <X size={18} aria-hidden />
                </button>
              )}
            </div>
            <button type="button" className={inq.btn} onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
              <Filter size={18} aria-hidden /> Filters {activeFilters > 0 && <span className={inq.badgeCount} aria-label={`${activeFilters} active`}>{activeFilters}</span>}
            </button>
            <label className="visually-hidden" htmlFor="ticket-sort">Sort tickets</label>
            <select id="ticket-sort" className={inq.select} value={params.sort} onChange={(e) => change({ sort: e.target.value })}>
              {SORTS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
            </select>
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
                <h3 className={inq.emptyTitle}>Your tickets could not be loaded</h3>
                <p className={inq.emptyText}>Nothing was changed. Check your connection and try again.</p>
                <button type="button" className={inq.btn} onClick={() => void load(params)}>Try again</button>
              </div>
            ) : loading && slow ? (
              <div aria-label="Loading your tickets">{[0, 1, 2, 3].map((i) => <div key={i} className={inq.skeletonRow} />)}</div>
            ) : data.tickets.length === 0 ? (
              !anyFilter ? (
                <div className={inq.emptyBox}>
                  <h3 className={inq.emptyTitle}>No Support Tickets Yet</h3>
                  <p className={inq.emptyText}>When you raise a ticket it appears here with its reference and status. Use the form to tell us about an issue.</p>
                  <a href="#raise-ticket" className={inq.cta}>Raise a New Ticket</a>
                </div>
              ) : (
                <div className={inq.emptyBox}>
                  <h3 className={inq.emptyTitle}>{params.q ? "No matching tickets" : "No tickets match these filters"}</h3>
                  <p className={inq.emptyText}>{params.q ? "Nothing you raised matches that search with the filters you chose." : "Try another status or remove a filter."}</p>
                  <button type="button" className={inq.btn} onClick={() => { setSearch(""); setParams({ ...DEFAULTS }); }}>Clear filters</button>
                </div>
              )
            ) : (
              <BuyerSupportTicketTable rows={data.tickets} />
            )}
          </div>

          {!error && meta.total > 0 && (
            <nav className={inq.pager} aria-label="Ticket pages">
              <p className={inq.muted} aria-live="polite">Showing {firstRow.toLocaleString("en-IN")} - {lastRow.toLocaleString("en-IN")} of {meta.total.toLocaleString("en-IN")} tickets</p>
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
        </section>
      </div>

      <div className={styles.bottom}>
        <SupportFAQAccordion faqs={faqs} categories={faqCategories} />
        <SupportContactChannels channels={channels} />
      </div>

      {filtersOpen && (
        <SupportTicketFilters
          values={{ status: params.status, categoryId: params.categoryId, relatedEntityType: params.relatedEntityType, range: params.range, dateFrom: params.dateFrom, dateTo: params.dateTo } satisfies TicketFilterValues}
          today={today}
          onClose={() => setFiltersOpen(false)}
          onClear={() => { change(clearAdvanced); setFiltersOpen(false); }}
          onApply={(v) => { change(v); setFiltersOpen(false); }}
        />
      )}
    </>
  );
}
