"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Boxes, Building2, Clock, FileText, Hourglass, MessageSquareText, Package, PackagePlus, Star } from "lucide-react";
import { RANGE_PRESETS } from "@/lib/buyer/dateRange";
import type { DashboardData, Metric, Section } from "@/lib/supplier/dashboardService";
import s from "./SupplierDashboard.module.css";
import { PerformanceChart } from "./PerformanceChart";

interface Props {
  initial: DashboardData;
  range: { key: string; label: string; startDate: string; endDate: string; today: string };
}

const number = (n: number) => n.toLocaleString("en-IN");
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "S";

/** A section that failed to load says so and the others still render; nothing is replaced by a made-up number. */
function Loaded<T>({ section, children }: { section: Section<T>; children: (data: T) => ReactNode }) {
  if (section.status === "error") return <p className={s.errorBox} role="alert">{section.message} Reload the page to try again.</p>;
  return <>{children(section.data)}</>;
}

function change(metric: Metric): string | null {
  if (metric.scope !== "period" || metric.changePercent === null || metric.previous === null) return null;
  if (metric.changePercent === 0) return `No change from the previous period (${number(metric.previous)})`;
  return `${Math.abs(metric.changePercent)}% ${metric.changePercent > 0 ? "more" : "fewer"} than the previous period (${number(metric.previous)})`;
}

/**
 * The supplier dashboard (Page 39). Every figure comes from the server, scoped to the company the session's account owns; this component only shows it.
 * The period selector navigates (the server recomputes the numbers for that period); "now" figures (pending responses, active quotations) ignore the
 * period and say so. Anything with no data behind it (response time, product approval, notifications, supplier replies, adding products) is shown as
 * unavailable with the reason, never as a zero, a sample or a button that does nothing.
 */
export function SupplierDashboard({ initial, range }: Props) {
  const router = useRouter();
  const [custom, setCustom] = useState(range.key === "custom");
  const [start, setStart] = useState(range.startDate);
  const [end, setEnd] = useState(range.endDate);
  const [customError, setCustomError] = useState<string | null>(null);
  const { company, capabilities } = initial;
  const query = range.key === "custom" ? `range=custom&startDate=${range.startDate}&endDate=${range.endDate}` : `range=${range.key}`;

  const choose = (value: string) => {
    if (value === "custom") {
      setCustom(true);
      return;
    }
    setCustom(false);
    setCustomError(null);
    router.push(`/supplier/dashboard?range=${value}`);
  };
  const applyCustom = () => {
    if (!start || !end) return setCustomError("Choose both dates.");
    if (start > end) return setCustomError("The start date must not be after the end date.");
    if (end > range.today) return setCustomError("The end date cannot be in the future.");
    setCustomError(null);
    router.push(`/supplier/dashboard?range=custom&startDate=${start}&endDate=${end}`);
  };

  return (
    <>
      <section className={s.card} aria-labelledby="company-title">
        <div className={s.identity}>
          <span className={s.avatar} aria-hidden>{initialsOf(company.name)}</span>
          <div>
            <h2 id="company-title" className={s.companyName}>{company.name}</h2>
            <div className={s.chips}>
              <span className={s.chip}><Building2 size={14} aria-hidden /> {company.verification}</span>
              {company.city && <span className={s.chip}>{company.city}</span>}
              <span className={s.chip}>{company.linkedSellers === 0 ? "No seller linked" : `${company.linkedSellers} linked seller${company.linkedSellers === 1 ? "" : "s"}`}</span>
            </div>
          </div>
        </div>
        {company.linkedSellers === 0 ? (
          <p className={s.note}>No catalogue seller is linked to your company yet. The platform links sellers (a company cannot claim one itself), so inquiries, quotations, orders and products show genuine zeros until then. Nothing here is sample data.</p>
        ) : (
          <p className={s.muted}>Showing activity for: {company.sellerNames.join(", ")}{company.linkedSellers > company.sellerNames.length ? ` and ${company.linkedSellers - company.sellerNames.length} more` : ""}.</p>
        )}
      </section>

      <div className={s.controls}>
        <label htmlFor="sd-range" className={s.muted} style={{ margin: 0 }}>Period</label>
        <select id="sd-range" className={s.select} value={custom ? "custom" : range.key} onChange={(e) => choose(e.target.value)}>
          {RANGE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {custom && (
          <form className={s.customForm} onSubmit={(e) => { e.preventDefault(); applyCustom(); }}>
            <label className="visually-hidden" htmlFor="sd-start">From</label>
            <input id="sd-start" type="date" className={s.dateInput} value={start} max={range.today} onChange={(e) => setStart(e.target.value)} />
            <label className="visually-hidden" htmlFor="sd-end">To</label>
            <input id="sd-end" type="date" className={s.dateInput} value={end} max={range.today} onChange={(e) => setEnd(e.target.value)} />
            <button type="submit" className={s.btn}>Apply</button>
            {customError && <span role="alert" className={s.muted}>{customError}</span>}
          </form>
        )}
        <span className={s.muted} style={{ margin: 0 }}>{range.label}: {range.startDate} to {range.endDate} (India time)</span>
      </div>

      <Loaded section={initial.summary}>
        {(m) => {
          const cards = [
            { label: "Total Inquiries", metric: m.totalInquiries, icon: MessageSquareText, cream: false, note: "Received in the selected period", extra: null as ReactNode },
            { label: "Pending Responses", metric: m.pendingResponses, icon: Hourglass, cream: true, note: "Right now, not period bound", extra: capabilities.responsesAvailable ? null : "Replying to inquiries is not available yet." },
            { label: "Active Quotations", metric: m.activeQuotations, icon: FileText, cream: false, note: "Right now: sent, valid, awaiting the buyer", extra: <Link href="/supplier/quotations?status=submitted" className={s.ref}>View quotations</Link> },
            { label: "Confirmed Orders", metric: m.confirmedOrders, icon: Package, cream: true, note: "Placed in the selected period, not cancelled", extra: null },
          ];
          return (
            <ul className={s.kpis} aria-label="Business summary">
              {cards.map((c) => {
                const delta = change(c.metric);
                return (
                  <li key={c.label} className={clsx(s.kpi, c.cream && s.kpiCream)}>
                    <span className={s.kpiIcon}><c.icon size={22} aria-hidden /></span>
                    <div>
                      <h2 className={s.kpiLabel}>{c.label}</h2>
                      <p className={s.kpiValue}>{number(c.metric.value)}</p>
                      <p className={s.kpiNote}>{c.note}</p>
                      {delta && <p className={s.kpiNote}>{delta}</p>}
                      {c.extra && <p className={s.kpiNote}>{c.extra}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          );
        }}
      </Loaded>

      <div className={s.grid}>
        <div className={s.stack}>
          <PerformanceChart query={query} />

          <section className={s.card} aria-labelledby="recent-title">
            <h2 id="recent-title" className={s.cardTitle}><MessageSquareText size={20} aria-hidden /> Recent Inquiries</h2>
            <Loaded section={initial.recentInquiries}>
              {(rows) =>
                rows.length === 0 ? (
                  <p className={s.note}>{company.linkedSellers === 0 ? "No inquiries: no seller is linked to your company yet." : "No inquiry has been addressed to your sellers yet."}</p>
                ) : (
                  <>
                    <div className={s.tableWrap}>
                      <table className={s.table}>
                        <caption>Your latest inquiries</caption>
                        <thead>
                          <tr><th scope="col">Inquiry</th><th scope="col">Buyer</th><th scope="col">Product</th><th scope="col">Quantity</th><th scope="col">Received</th><th scope="col">Status</th></tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.reference}>
                              <th scope="row" style={{ background: "transparent" }}><Link href={`/supplier/inquiries/${r.reference}`} className={s.ref}>{r.reference}</Link></th>
                              <td>{r.buyer}</td>
                              <td>{r.product}{r.category ? <span className={s.muted} style={{ display: "block", margin: 0 }}>{r.category}</span> : null}</td>
                              <td>{r.quantity ?? "Not stated"}</td>
                              <td>{r.receivedLabel}</td>
                              <td><span className={clsx(s.badge, r.pending ? s.badgePending : s.badgeInfo)}>{r.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ul className={s.cards} aria-label="Your latest inquiries">
                      {rows.map((r) => (
                        <li key={r.reference} className={s.rowCard}>
                          <div className={s.rowTop}>
                            <p className={s.ref}><Link href={`/supplier/inquiries/${r.reference}`} className={s.ref}>{r.reference}</Link></p>
                            <span className={clsx(s.badge, r.pending ? s.badgePending : s.badgeInfo)}>{r.status}</span>
                          </div>
                          <p className={s.muted} style={{ margin: 0 }}>{r.buyer} · {r.receivedLabel}</p>
                          <p className={s.productName}>{r.product}{r.quantity ? ` (${r.quantity})` : ""}</p>
                        </li>
                      ))}
                    </ul>
                    <p className={s.muted}>Open an inquiry to read it and respond. Buyers are shown by business name only. The full inquiries list page is not built yet.</p>
                  </>
                )
              }
            </Loaded>
          </section>
        </div>

        <div className={s.stack}>
          <section className={s.card} aria-labelledby="snapshot-title">
            <h2 id="snapshot-title" className={s.cardTitle}><Building2 size={20} aria-hidden /> Business Snapshot</h2>
            <Loaded section={initial.snapshot}>
              {(snap) => (
                <>
                  <dl className={s.snapshot}>
                    <div>
                      <dt><Boxes size={14} aria-hidden /> Catalogue products</dt>
                      <dd>{number(snap.products.active)}<small>Products of your linked sellers in the catalogue. {snap.products.pendingApproval.reason}</small></dd>
                    </div>
                    <div>
                      <dt><Star size={14} aria-hidden /> Rating</dt>
                      <dd>{snap.rating ? `${snap.rating.average} / 5` : "No reviews yet"}<small>{snap.rating ? `${number(snap.rating.count)} approved review${snap.rating.count === 1 ? "" : "s"}` : "Only approved buyer reviews count."}</small></dd>
                    </div>
                    <div>
                      <dt><Clock size={14} aria-hidden /> Average response time</dt>
                      <dd>Not available<small>{snap.averageResponseTime.reason}</small></dd>
                    </div>
                    <div>
                      <dt>Profile completion</dt>
                      <dd>{snap.profile.percent}%<small>Of the details this site can capture today.</small></dd>
                    </div>
                  </dl>
                  <div className={s.progressRow}>
                    <progress className={s.progress} value={snap.profile.percent} max={100} aria-label="Profile completion" />
                  </div>
                  {snap.profile.missing.length > 0 && (
                    <ul className={s.missing} aria-label="Missing profile details">
                      {snap.profile.missing.map((m) => <li key={m.key}>{m.label}: {m.hint}</li>)}
                    </ul>
                  )}
                  <p className={s.muted}>A complete profile is not verification: company verification does not exist yet.</p>
                </>
              )}
            </Loaded>
          </section>

          <section className={s.card} aria-labelledby="top-title">
            <h2 id="top-title" className={s.cardTitle}><Package size={20} aria-hidden /> Top Products by Inquiries</h2>
            <Loaded section={initial.topProducts}>
              {(rows) =>
                rows.length === 0 ? (
                  <p className={s.note}>No inquiry in this period named one of your products.</p>
                ) : (
                  <ul className={s.products}>
                    {rows.map((p) => (
                      <li key={p.key} className={s.product}>
                        <span className={s.thumb} aria-hidden>{p.image ? <Image src={p.image.src} alt="" width={56} height={56} unoptimized={p.image.remote} /> : <Package size={22} />}</span>
                        <div>
                          <p className={s.productName}><Link href={p.href}>{p.name}</Link></p>
                          <p className={s.muted} style={{ margin: 0 }}>{p.sku} · {p.price}</p>
                        </div>
                        <span className={s.count} aria-label={`${p.inquiries} inquiries`}>{number(p.inquiries)}</span>
                      </li>
                    ))}
                  </ul>
                )
              }
            </Loaded>
          </section>
        </div>
      </div>

      <section className={s.card} aria-labelledby="actions-title">
        <h2 id="actions-title" className={s.cardTitle}>Quick actions</h2>
        <ul className={s.actions}>
          <li className={s.action}>
            <PackagePlus size={22} aria-hidden />
            <div><p className={s.actionTitle}>Add product</p><p className={s.actionText}>{capabilities.productManagement ? "Available." : "Supplier product management is not built yet."}</p></div>
          </li>
          <li className={s.action}>
            <MessageSquareText size={22} aria-hidden />
            <div><p className={s.actionTitle}>Reply to inquiries</p><p className={s.actionText}>{capabilities.responsesAvailable ? "Available." : "Supplier replies are not built yet, so no reply can be sent from here."}</p></div>
          </li>
          <li className={s.action}>
            <FileText size={22} aria-hidden />
            <div>
              <p className={s.actionTitle}>Create quotation</p>
              <p className={s.actionText}>{capabilities.quotationCreation ? <Link href="/supplier/quotations/create" className={s.ref}>Start a quotation for a buyer inquiry</Link> : "Quotation creation is not built yet. You can review and withdraw existing quotations."}</p>
            </div>
          </li>
        </ul>
        <p className={s.muted}>Notifications: {initial.notifications.reason}</p>
      </section>
    </>
  );
}
