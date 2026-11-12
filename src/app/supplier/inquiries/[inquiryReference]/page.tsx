import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { Building2, ChevronDown, FileText, Paperclip, Plus, Activity as ActivityIcon, PencilLine } from "lucide-react";
import { ExpandableText } from "@/components/supplier/inquiries/ExpandableText";
import { ResponsePanel } from "@/components/supplier/inquiries/ResponsePanel";
import styles from "@/components/supplier/inquiries/InquiryDetail.module.css";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { SupplierStatusBadge } from "@/components/supplier/quotations/SupplierStatusBadge";
import { requireSupplierPage } from "@/lib/auth/guards";
import { withPagePerf } from "@/lib/perf/instrument";
import { RESPONSES_PAGE_SIZE } from "@/lib/supplier/inquiryRules";
import { retryPendingNotices } from "@/lib/supplier/outbox";
import { getActivity, getInquiryDetail, getRelatedQuotations, getResponses } from "@/lib/supplier/inquiryService";

export const metadata: Metadata = { title: "Inquiry Details | Supplier Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NOT_PROVIDED = "Not provided";

/**
 * /supplier/inquiries/<reference> : one inquiry addressed to the company's own sellers. The layout already proved a supplier with an active company; the
 * inquiry is looked up inside that company's sellers, so an unknown, malformed or another seller's reference is the same real 404 and nothing is read for it.
 * Everything shown is a persisted record (the buyer's requirement as written, real messages, real status changes, real quotations); opening the page creates
 * and changes nothing. There is deliberately no loading.tsx above this page (it can 404).
 */
async function SupplierInquiryPage({ params }: { params: Promise<{ inquiryReference: string }> }) {
  const { inquiryReference } = await params;
  const reference = inquiryReference.trim().toUpperCase();
  const { context } = await requireSupplierPage(`/supplier/inquiries/${encodeURIComponent(reference)}`);
  const detail = await getInquiryDetail(context, reference);
  if (!detail) notFound();
  // a notice that was not delivered right after an action is picked up here, in parallel with the reads
  const [responses, activity, quotations] = await Promise.all([getResponses(context, reference, { limit: RESPONSES_PAGE_SIZE, cursor: null }), getActivity(context, reference), getRelatedQuotations(context, reference), retryPendingNotices(context).catch(() => 0)]).then((r) => [r[0], r[1], r[2]] as const);
  const req = detail.requirement;
  const quote = detail.capabilities.quotation;

  return (
    <div className={dash.page}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / Supplier Portal / Inquiries &amp; Leads / {detail.reference}
      </p>
      <div className={dash.header}>
        <div>
          <h1 className={dash.title}>Inquiry Details</h1>
          <div className={styles.titleRow}>
            <strong>{detail.reference}</strong>
            <span className={clsx(dash.badge, detail.awaitingResponse ? dash.badgePending : dash.badgeInfo)}>{detail.statusLabel}</span>
            <span className={styles.metaText}>Received {detail.receivedLabel}</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          {quote.href ? (
            <Link href={quote.href} className={clsx(dash.btn, quote.kind !== "view" && styles.primary)}>
              {quote.kind === "continue" ? <PencilLine size={18} aria-hidden /> : quote.kind === "view" ? <FileText size={18} aria-hidden /> : <Plus size={18} aria-hidden />} {quote.label}
            </Link>
          ) : (
            <button type="button" className={clsx(dash.btn, styles.btnOff)} disabled aria-describedby="quote-off">
              <Plus size={18} aria-hidden /> Create Quotation
            </button>
          )}
        </div>
      </div>
      {quote.reason && <p id="quote-off" className={styles.note}>{quote.reason}</p>}

      <div className={styles.layout}>
        <div className={styles.stack}>
          <section className={dash.card} aria-labelledby="req-title">
            <h2 id="req-title" className={dash.cardTitle}><FileText size={20} aria-hidden /> Original Requirement</h2>
            <p style={{ margin: 0, fontWeight: 700 }}>{req.title}</p>
            {req.description ? <ExpandableText text={req.description} /> : <p className={styles.description}>{NOT_PROVIDED}</p>}
            <dl className={styles.facts}>
              <div><dt>Inquiry type</dt><dd>{detail.typeLabel}</dd></div>
              <div><dt>Category</dt><dd>{req.category ?? NOT_PROVIDED}</dd></div>
              <div><dt>Requested quantity</dt><dd>{req.quantity.toLocaleString("en-IN")}{req.unit ? ` ${req.unit}` : ""}</dd></div>
              <div><dt>Delivery location</dt><dd>{req.deliveryLocation ?? NOT_PROVIDED}</dd></div>
            </dl>
            {req.specifications.length > 0 && (
              <>
                <h3 className={styles.subtitle}>Product specifications</h3>
                <p className={dash.muted}>From the listing the buyer asked about{req.productUrl ? <> (<Link href={req.productUrl} className={styles.linkBtn}>open the listing</Link>)</> : null}; not typed by the buyer.</p>
                <dl className={styles.specs}>
                  {req.specifications.map((s, i) => <div key={`${s.label}-${i}`} className={styles.spec}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}
                </dl>
              </>
            )}
            <p className={styles.note}>{detail.notCaptured}</p>
          </section>

          <section className={dash.card} aria-labelledby="att-title">
            <h2 id="att-title" className={dash.cardTitle}><Paperclip size={20} aria-hidden /> Buyer Attachments</h2>
            <p className={styles.note}>{detail.attachments.reason}</p>
          </section>

          <ResponsePanel reference={detail.reference} buyerName={detail.buyer.name} canRespond={detail.capabilities.respond} initial={{ items: responses?.items ?? [], nextCursor: responses?.nextCursor ?? null }} />
        </div>

        <div className={styles.stack}>
          <section className={dash.card} aria-label="Buyer information">
            <details open>
              <summary className={styles.buyerSummary}><span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}><Building2 size={20} aria-hidden /> Buyer Information</span><ChevronDown size={18} aria-hidden /></summary>
              <dl className={styles.facts} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                <div><dt>Company</dt><dd>{detail.buyer.name}</dd></div>
                <div><dt>Account</dt><dd>{detail.buyer.kind}</dd></div>
              </dl>
              <p className={styles.note}>Contact details, addresses and verification are not shared on inquiries. Use the response form to reach the buyer. No verification badge or rating is shown because none exists.</p>
            </details>
          </section>

          <section className={dash.card} aria-labelledby="act-title">
            <h2 id="act-title" className={dash.cardTitle}><ActivityIcon size={20} aria-hidden /> Inquiry Activity</h2>
            {activity && activity.items.length > 0 ? (
              <ol className={styles.timeline} aria-label="Inquiry activity, newest first">
                {activity.items.map((a) => (
                  <li key={a.key}><strong>{a.title}</strong><span className={styles.when}>{a.atLabel}{a.detail ? ` · ${a.detail}` : ""}</span></li>
                ))}
              </ol>
            ) : (
              <p className={styles.note}>No activity recorded.</p>
            )}
            {activity?.truncated && <p className={styles.metaText}>Showing the latest 50 events.</p>}
          </section>

          <section className={dash.card} aria-labelledby="rq-title">
            <h2 id="rq-title" className={dash.cardTitle}><FileText size={20} aria-hidden /> Related Quotations</h2>
            {quotations && quotations.length > 0 ? (
              <ul className={styles.related}>
                {quotations.map((q) => (
                  <li key={q.reference} className={styles.relatedItem}>
                    <Link href={q.detailHref} className={styles.linkBtn}>{q.reference}</Link>
                    <span><SupplierStatusBadge status={q.status} label={q.statusLabel} /></span>
                    <span className={styles.metaText}>{q.total ? `${q.total.text}${q.total.taxSpecified ? "" : " (before tax)"}` : "Not priced yet"} · valid until {q.validLabel}</span>
                    {q.editHref && <Link href={q.editHref} className={styles.linkBtn}>Continue draft</Link>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.note}>No quotation has been created for this inquiry. Opening this page does not create one.</p>
            )}
          </section>
        </div>
      </div>

      <p className={styles.footerLinks}>
        <Link href="/supplier/dashboard" className={styles.linkBtn}>Back to Dashboard</Link>
        <span className={styles.metaText}> · The inquiries list page is not built yet, so this returns to your dashboard.</span>
      </p>
    </div>
  );
}

export default withPagePerf("page supplier-inquiry-detail", SupplierInquiryPage);
