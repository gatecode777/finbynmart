import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { Activity, ChevronDown, FileText, GitCompare, History, Package, Paperclip } from "lucide-react";
import { CompareVersions } from "@/components/supplier/quotations/CompareVersions";
import { DetailActions } from "@/components/supplier/quotations/DetailActions";
import { SupplierStatusBadge } from "@/components/supplier/quotations/SupplierStatusBadge";
import { VersionHistory } from "@/components/supplier/quotations/VersionHistory";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import styles from "@/components/supplier/quotations/SupplierQuotations.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { withPagePerf } from "@/lib/perf/instrument";
import { getSupplierQuotationDetail } from "@/lib/supplier/quotationService";
import { getQuotationActivity } from "@/lib/supplier/quotationVersions";

export const metadata: Metadata = { title: "Quotation Details | Supplier Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const NOT_PROVIDED = "Not provided";

/**
 * /supplier/quotations/<reference>[?version=n] : one quotation of the session's company, at ONE version. Without ?version the current offer is shown (the highest
 * version that is current: an unsubmitted revision draft is never presented as the current offer). A version number is validated (a whole number) and looked up
 * inside the company's own quotation: an unknown, malformed or another supplier's reference or version is the same real 404 and nothing is read before the company
 * check. A submitted version is shown from its own stored data (its snapshot), never from today's catalogue, tax configuration or company profile. Read only: the
 * actions are Edit Draft, Create Revision (a new draft version), Continue the revision draft, Withdraw and Print; there is deliberately no loading.tsx above this page.
 */
async function SupplierQuotationDetailPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ reference }, raw] = await Promise.all([params, searchParams]);
  const { context } = await requireSupplierPage(`/supplier/quotations/${encodeURIComponent(reference)}`);
  const versionText = one(raw.version);
  const version = versionText === undefined ? undefined : /^\d{1,6}$/.test(versionText) ? Number(versionText) : NaN;
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) notFound();
  const d = await getSupplierQuotationDetail(context, reference, version);
  if (!d) notFound();
  const activity = await getQuotationActivity(context, reference);
  const q = d.quotation;
  const isDraft = q.status === "DRAFT";
  const line = d.line;

  return (
    <div className={dash.page}>
      <p className={`${dash.breadcrumb} ${styles.noPrint}`}>
        <Link href="/">Home</Link> / Supplier Portal / <Link href="/supplier/quotations">Quotations</Link> / {q.reference}
      </p>
      <div className={dash.header}>
        <div>
          <h1 className={dash.title}>Quotation Details</h1>
          <p className={dash.welcome} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)" }}>
            <strong>{q.reference}</strong>
            <SupplierStatusBadge status={q.status} label={q.statusLabel} />
            <span className={clsx(styles.tag, styles.tagTeal)}>Version {q.version}</span>
            {isDraft ? <span className={clsx(styles.tag, styles.tagGold)}>Draft: not submitted</span> : q.isCurrent ? <span className={styles.tag}>Current offer</span> : <span className={styles.tag}>Historical version</span>}
            {d.pointers.acceptedVersion === q.version && <span className={clsx(styles.tag, styles.tagTeal)}>Accepted version</span>}
          </p>
        </div>
        <DetailActions reference={q.reference} statusLabel={q.statusLabel} version={q.version} isDraft={isDraft} canWithdraw={d.capabilities.withdraw && q.isCurrent} editHref={d.capabilities.editHref} createRevision={d.capabilities.createRevision} pdfReason={d.capabilities.reasons.downloadPdf} />
      </div>

      {one(raw.submitted) === "1" && !isDraft && q.isCurrent && (
        <p className={styles.status} role="status">Quotation {q.reference} (version {q.version}) was submitted. The buyer can now see it on their Quotations page.</p>
      )}
      {d.historical.isHistorical && (
        <p className={styles.banner} role="note">
          This is {d.historical.message} {d.historical.currentHref && <Link href={d.historical.currentHref} className={styles.link}>Open the current offer</Link>}
        </p>
      )}
      {isDraft && (
        <p className={styles.banner} role="note">
          {q.revisionOf ? `This is a revision draft (version ${q.version}, copied from version ${q.revisionOf}${q.revisionReason ? `; reason: ${q.revisionReason}` : ""}). ` : "This is a draft. "}
          The buyer cannot see it{q.revisionOf && d.pointers.currentVersion ? `: they still see version ${d.pointers.currentVersion}, the current offer` : ""}. Its amounts are provisional until it is submitted.
        </p>
      )}
      {!isDraft && q.isCurrent && d.pointers.revisionDraft && (
        <p className={clsx(styles.banner, styles.bannerInfo)} role="note">
          A revision draft (version {d.pointers.revisionDraft.version}) exists but is not submitted: this version is still the current offer the buyer sees. <Link href={d.pointers.revisionDraft.editHref} className={styles.link}>Continue the draft</Link>
        </p>
      )}
      {d.pendingRevision && (
        <p className={styles.status} role="status">
          The buyer asked for a revision ({d.pendingRevision.reason}){d.pendingRevision.message ? `: "${d.pendingRevision.message}"` : ""}. {d.pendingRevision.atLabel}. Use Create Revision to prepare a new version.
        </p>
      )}

      <div className={styles.detailGrid}>
        <div className={styles.stack}>
          <section className={dash.card} aria-labelledby="sq-context">
            <h2 id="sq-context" className={dash.cardTitle}><FileText size={20} aria-hidden /> Buyer &amp; inquiry context</h2>
            <dl className={styles.defs}>
              <div><dt>Buyer / company</dt><dd>{d.buyer.name}</dd></div>
              <div><dt>Supplier (as quoted)</dt><dd>{q.supplierName}</dd></div>
              <div>
                <dt>Inquiry</dt>
                <dd>{d.inquiry ? <Link href={d.inquiry.href} className={styles.link}>{d.inquiry.reference}</Link> : NOT_PROVIDED}</dd>
              </div>
              <div><dt>Inquiry status</dt><dd>{d.inquiry?.statusLabel ?? NOT_PROVIDED}</dd></div>
              <div><dt>Category</dt><dd>{d.inquiry?.category ?? NOT_PROVIDED}</dd></div>
              <div><dt>Buyer asked for</dt><dd>{d.inquiry ? `${d.inquiry.quantity.toLocaleString("en-IN")}${d.inquiry.unit ? ` ${d.inquiry.unit}` : ""}` : NOT_PROVIDED}</dd></div>
              <div><dt>Delivery location (the buyer&apos;s)</dt><dd>{d.inquiry?.deliveryLocation ?? NOT_PROVIDED}</dd></div>
              <div><dt>Inquiry received</dt><dd>{d.inquiry?.requestedLabel ?? NOT_PROVIDED}</dd></div>
            </dl>
            <p className={dash.muted}>The buyer&apos;s original requirement is on the inquiry; the quoted items below are your offer. Contact details are not shared here.</p>
          </section>

          <section className={dash.card} aria-labelledby="sq-items">
            <h2 id="sq-items" className={dash.cardTitle}><Package size={20} aria-hidden /> Quoted items</h2>
            <p className={dash.muted} style={{ marginTop: 0 }}>{isDraft ? "Draft content as saved so far." : `Pricing snapshot stored with version ${q.version}.`} Names, specifications and prices below are what was quoted, not today&apos;s listing.</p>
            <div className={styles.itemCard}>
              <span className={styles.thumbBox} aria-hidden>{line.product.imageSrc ? <Image src={line.product.imageSrc} alt="" width={72} height={72} unoptimized={line.product.imageRemote} /> : <Package size={28} />}</span>
              <div>
                <p style={{ margin: 0, fontWeight: 700, overflowWrap: "anywhere" }}>{line.name}</p>
                {line.description && <p className={dash.muted}>{line.description}</p>}
                {line.specs.length > 0 && <p className={dash.muted}>{line.specs.map((s) => `${s.label}: ${s.value}`).join(" · ")}</p>}
                {line.features.length > 0 && <p className={dash.muted}>{line.features.join(" · ")}</p>}
                <dl className={styles.defs} style={{ marginTop: "var(--space-3)" }}>
                  <div><dt>Quantity</dt><dd>{line.quantityText}</dd></div>
                  <div><dt>Unit price</dt><dd>{line.unitPriceText}</dd></div>
                  <div><dt>Minimum order</dt><dd>{line.moqText ?? NOT_PROVIDED}</dd></div>
                  <div><dt>Discount</dt><dd>{line.discountText ?? "None"}</dd></div>
                  <div><dt>Tax</dt><dd>{line.taxText ?? "As stored: no tax stated"}</dd></div>
                  <div><dt>Line amount (after discount)</dt><dd>{line.amountText ?? "Not available"}</dd></div>
                  <div><dt>Currency</dt><dd>{line.currency}</dd></div>
                  <div><dt>Line reference</dt><dd>{line.id}</dd></div>
                </dl>
                {line.product.url && <p className={dash.muted}><Link href={line.product.url} className={styles.link}>Current listing of this product</Link> (shown separately: it may differ from what was quoted)</p>}
              </div>
            </div>
          </section>

          <section className={dash.card} aria-labelledby="sq-terms">
            <h2 id="sq-terms" className={dash.cardTitle}>Commercial terms</h2>
            <dl className={styles.defs}>
              {d.commercialTerms.filter((t) => t.label !== "Remarks" && t.label !== "Offered Quantity").map((t) => (
                <div key={t.label}><dt>{t.label}</dt><dd>{t.value ?? NOT_PROVIDED}</dd></div>
              ))}
              <div><dt>Valid until</dt><dd>{q.validLabel} (ends 11:59 pm India time){q.daysLeft !== null ? `, ${q.daysLeft > 0 ? `${q.daysLeft} day${q.daysLeft === 1 ? "" : "s"} left` : "ends today"}` : ""}</dd></div>
              <div><dt>Created</dt><dd>{q.createdLabel}</dd></div>
              <div><dt>Submitted to buyer</dt><dd>{q.sentLabel ?? "Not submitted"}</dd></div>
            </dl>
          </section>

          <div className={styles.fields2}>
            <section className={dash.card} aria-labelledby="sq-notes">
              <h2 id="sq-notes" className={dash.cardTitle}>Notes</h2>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{d.notes ?? NOT_PROVIDED}</p>
            </section>
            <section className={dash.card} aria-labelledby="sq-att">
              <h2 id="sq-att" className={dash.cardTitle}><Paperclip size={20} aria-hidden /> Attachments</h2>
              <p className={dash.muted} style={{ margin: 0 }}>{d.attachments.reason}</p>
            </section>
          </div>

          <section className={dash.card} aria-label="Version history">
            <details open className={styles.details}>
              <summary><span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}><History size={20} aria-hidden /> Version history</span><ChevronDown size={18} aria-hidden /></summary>
              <VersionHistory reference={q.reference} selectedVersion={q.version} initial={d.versions} nextCursor={d.nextVersionCursor} total={d.pointers.totalVersions} />
            </details>
          </section>

          <section className={clsx(dash.card, styles.noPrint)} aria-label="Compare versions">
            <details open={d.pointers.totalVersions > 1} className={styles.details}>
              <summary><span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}><GitCompare size={20} aria-hidden /> Compare versions</span><ChevronDown size={18} aria-hidden /></summary>
              <CompareVersions reference={q.reference} versions={d.versions} />
            </details>
          </section>
        </div>

        <div className={styles.stack}>
          <section className={dash.card} aria-labelledby="sq-fin">
            <h2 id="sq-fin" className={dash.cardTitle}>Financial summary{isDraft ? " (provisional)" : ""}</h2>
            {d.priceBreakdown.error ? (
              <p className={styles.fieldError} role="alert">{d.priceBreakdown.error}</p>
            ) : (
              <dl className={styles.lines}>
                {d.priceBreakdown.rows.map((r) => (
                  <div key={r.label} className={`${styles.line} ${r.strong ? styles.lineStrong : ""}`}><dt>{r.label}</dt><dd>{isDraft && r.strong ? `${r.value} (provisional)` : r.value}</dd></div>
                ))}
              </dl>
            )}
            {d.financial.integrity.note && <p className={clsx(styles.banner, styles.bannerInfo)} role="note" style={{ marginTop: "var(--space-3)" }}>{d.financial.integrity.note}</p>}
            <p className={dash.muted}>
              {d.financial.source === "snapshot" ? "Stored amounts from the submission snapshot" : d.financial.source === "stored" ? "Worked out from this version's own stored fields" : "Amounts unavailable"}
              {d.financial.taxRule ? `. Tax treatment recorded: ${d.financial.taxRule.label} (${d.financial.taxRule.id}, version ${d.financial.taxRule.version})` : ""}
              {d.financial.policyVersion ? `. Calculation policy ${d.financial.policyVersion}` : ""}. Nothing is recalculated from today&apos;s catalogue, tax settings or rounding rules.
            </p>
          </section>

          <section className={dash.card} aria-label="Activity">
            <details open className={styles.details}>
              <summary><span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}><Activity size={20} aria-hidden /> Activity</span><ChevronDown size={18} aria-hidden /></summary>
              {activity && activity.items.length > 0 ? (
                <ul className={styles.timeline} aria-label="Quotation activity, newest first" style={{ marginTop: "var(--space-3)" }}>
                  {activity.items.map((a) => (
                    <li key={a.key}><strong>{a.title}</strong><span className={styles.small}>{a.atLabel}{a.detail ? ` · ${a.detail}` : ""}</span></li>
                  ))}
                </ul>
              ) : (
                <p className={dash.muted}>No activity recorded.</p>
              )}
              {activity?.truncated && <p className={dash.muted}>Showing the latest 50 events.</p>}
            </details>
          </section>

          {d.decision && (
            <section className={dash.card} aria-labelledby="sq-decision">
              <h2 id="sq-decision" className={dash.cardTitle}>Buyer decision</h2>
              <p><strong>{d.decision.type === "ACCEPTED" ? "Accepted" : "Rejected"}</strong> by the buyer · {d.decision.atLabel}</p>
              {d.decision.reason && <p className={dash.muted}>Reason: {d.decision.reason}</p>}
              {d.decision.type === "ACCEPTED" && <p className={dash.muted}>{d.order ? `Order ${d.order.reference} (${d.order.statusLabel})` : "No order is linked to this quotation yet. An accepted version cannot be revised or changed."}</p>}
            </section>
          )}

          <section className={clsx(dash.card, styles.noPrint)} aria-labelledby="sq-unavailable">
            <h2 id="sq-unavailable" className={dash.cardTitle}>Not available yet</h2>
            <ul className={styles.pendingList}>
              <li>{d.capabilities.reasons.downloadPdf}</li>
              <li>{d.capabilities.reasons.convertToOrder}</li>
              <li>{d.attachments.reason}</li>
            </ul>
          </section>
        </div>
      </div>

      <p className={styles.noPrint}><Link href="/supplier/quotations" className={styles.link}>Back to Quotations</Link></p>
    </div>
  );
}

export default withPagePerf("page supplier-quotation-detail", SupplierQuotationDetailPage);
