"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, Search, Ticket } from "lucide-react";
import { STATUS_LABEL, SUPPORT_CATEGORIES, TICKET_STATUSES } from "@/lib/support/ticketRules";
import type { SupportChannel } from "@/lib/support/channels";
import type { TicketPage, TicketSummary } from "@/lib/support/ticketService";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import inq from "@/components/buyer/inquiries/Inquiries.module.css";
import { SupportContactChannels } from "@/components/buyer/support/SupportContactChannels";
import { SupportFAQAccordion, type FaqItem } from "@/components/buyer/support/SupportFAQAccordion";
import { SupportTicketStatusBadge } from "@/components/buyer/support/SupportTicketStatusBadge";
import { RaiseSupportTicketForm, type SupportFormConfig } from "@/components/buyer/support/RaiseSupportTicketForm";
import styles from "@/components/buyer/support/Support.module.css";

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

const DEFAULTS: TicketParams = {
  q: "",
  status: "all",
  categoryId: "",
  relatedEntityType: "",
  range: "",
  dateFrom: "",
  dateTo: "",
  sort: "newest",
  page: 1,
};

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

export function SupplierSupportPage({
  initial,
  initialParams,
  initialSummary,
  config,
  faqs,
  faqCategories,
  channels,
}: {
  initial: TicketPage;
  initialParams: TicketParams;
  initialSummary: TicketSummary | null;
  config: SupportFormConfig;
  faqs: FaqItem[];
  faqCategories: { value: string; label: string; count: number }[];
  channels: SupportChannel[];
  today: string;
  renderedAt: number;
}) {
  const [params, setParams] = useState<TicketParams>(initialParams);
  const [data, setData] = useState<TicketPage>(initial);
  const [summary, setSummary] = useState<TicketSummary | null>(initialSummary);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  const fetchTickets = useCallback(async (p: TicketParams) => {
    setLoading(true);
    const res = await fetch(`/api/supplier/support/tickets?${toQuery(p)}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      const json = await res.json();
      if (json.ok) {
        setData({ tickets: json.tickets, meta: json.meta });
      }
    }
    setLoading(false);
  }, []);

  const refreshSummary = useCallback(async () => {
    const res = await fetch("/api/supplier/support/summary", { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      const json = await res.json();
      if (json.ok) setSummary(json.summary);
    }
  }, []);

  const onParamChange = (partial: Partial<TicketParams>) => {
    setParams((prev) => {
      const next = { ...prev, ...partial };
      if (!("page" in partial)) next.page = 1;
      fetchTickets(next);
      return next;
    });
  };

  const onSearchChange = (value: string) => {
    setParams((prev) => ({ ...prev, q: value, page: 1 }));
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchTickets({ ...params, q: value, page: 1 });
    }, DEBOUNCE_MS);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {summary && (
        <div className={inq.kpis} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div className={dash.card} style={{ textAlign: "center" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary, #526563)" }}>All Tickets</span>
            <strong style={{ display: "block", fontSize: "1.75rem", color: "var(--text-primary, #183a38)", marginTop: "4px" }}>
              {summary.total}
            </strong>
          </div>
          <div className={dash.card} style={{ textAlign: "center" }}>
            <span style={{ fontSize: "0.8125rem", color: "#d97706" }}>Open</span>
            <strong style={{ display: "block", fontSize: "1.75rem", color: "#d97706", marginTop: "4px" }}>
              {summary.open}
            </strong>
          </div>
          <div className={dash.card} style={{ textAlign: "center" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--primary, #04534f)" }}>In Progress</span>
            <strong style={{ display: "block", fontSize: "1.75rem", color: "var(--primary, #04534f)", marginTop: "4px" }}>
              {summary.inProgress}
            </strong>
          </div>
          <div className={dash.card} style={{ textAlign: "center" }}>
            <span style={{ fontSize: "0.8125rem", color: "#059669" }}>Resolved</span>
            <strong style={{ display: "block", fontSize: "1.75rem", color: "#059669", marginTop: "4px" }}>
              {summary.resolved}
            </strong>
          </div>
        </div>
      )}

      {/* Tickets List Section */}
      <section className={dash.card} aria-label="Support tickets table">
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "1rem" }}>
          <h2 className={dash.cardTitle} style={{ margin: 0 }}>
            <Ticket size={20} aria-hidden /> Your Support Tickets ({data.meta.total})
          </h2>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className={inq.btn}
              onClick={() => {
                fetchTickets(params);
                refreshSummary();
              }}
              aria-label="Refresh tickets"
            >
              <RefreshCw size={15} className={loading ? "spin" : undefined} aria-hidden /> Refresh
            </button>
          </div>
        </div>

        {/* Filter controls */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginBottom: "1rem" }}>
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: "200px" }}>
            <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} aria-hidden />
            <input
              type="search"
              placeholder="Search by ID or subject..."
              value={params.q}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 36px",
                border: "1px solid var(--border, #dce8e5)",
                borderRadius: "8px",
                fontSize: "0.875rem",
              }}
            />
          </div>

          <select
            value={params.status}
            onChange={(e) => onParamChange({ status: e.target.value })}
            style={{ padding: "8px 12px", border: "1px solid var(--border, #dce8e5)", borderRadius: "8px", fontSize: "0.875rem" }}
          >
            <option value="all">All Statuses</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>

          <select
            value={params.categoryId}
            onChange={(e) => onParamChange({ categoryId: e.target.value })}
            style={{ padding: "8px 12px", border: "1px solid var(--border, #dce8e5)", borderRadius: "8px", fontSize: "0.875rem" }}
          >
            <option value="">All Categories</option>
            {SUPPORT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tickets Table */}
        {data.tickets.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--text-secondary, #526563)" }}>
            <p>No support tickets match your current filters.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className={styles.ticketTable} style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8faf9", textAlign: "left", fontSize: "0.8125rem", color: "var(--text-secondary, #526563)" }}>
                  <th style={{ padding: "10px 14px" }}>Ticket ID</th>
                  <th style={{ padding: "10px 14px" }}>Subject</th>
                  <th style={{ padding: "10px 14px" }}>Category</th>
                  <th style={{ padding: "10px 14px" }}>Status</th>
                  <th style={{ padding: "10px 14px" }}>Last Update</th>
                  <th style={{ padding: "10px 14px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.tickets.map((t) => (
                  <tr key={t.reference} style={{ borderBottom: "1px solid var(--border, #dce8e5)", fontSize: "0.875rem" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <Link href={`/supplier/support/tickets/${t.reference}`} style={{ fontWeight: 600, color: "var(--primary, #04534f)" }}>
                        {t.reference}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 14px", fontWeight: 500 }}>{t.subject}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span className={styles.catTag}>{t.category.label}</span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <SupportTicketStatusBadge label={t.statusLabel} group={t.statusGroup} status={t.status} />
                    </td>
                    <td style={{ padding: "12px 14px", color: "var(--text-secondary, #526563)", fontSize: "0.8125rem" }}>
                      {new Date(t.updatedAt).toLocaleDateString("en-IN")}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <Link
                        href={`/supplier/support/tickets/${t.reference}`}
                        className={inq.btn}
                        style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Raise Ticket Form */}
      <div id="raise-ticket">
        <RaiseSupportTicketForm
          config={config}
          onCreated={() => {
            fetchTickets(params);
            refreshSummary();
          }}
        />
      </div>

      {/* FAQs */}
      <section className={dash.card} aria-label="Frequently Asked Questions">
        <h2 className={dash.cardTitle}>Frequently Asked Questions</h2>
        <p className={dash.legendNote}>Quick answers to common questions about orders, inquiries, quotations and supplier accounts.</p>
        <SupportFAQAccordion faqs={faqs} categories={faqCategories} />
      </section>

      {/* Contact Channels */}
      <section className={dash.card} aria-label="Support contact channels">
        <h2 className={dash.cardTitle}>Direct Support Channels</h2>
        <p className={dash.legendNote}>Reach our enterprise merchant support desk through any of the channels below.</p>
        <SupportContactChannels channels={channels} />
      </section>
    </div>
  );
}
