"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { LINE_SOURCE_LABEL, type LineSource } from "@/lib/quotations/quoteRules";
import type { InquiryView, PreviewView } from "@/lib/supplier/quoteService";
import dash from "../../dashboard/SupplierDashboard.module.css";
import quotes from "../SupplierQuotations.module.css";
import styles from "./QuoteBuilder.module.css";
import { showEntered, showMoney } from "./format";

interface Props {
  mode: "preview" | "review";
  preview: PreviewView;
  inquiry: InquiryView;
  currency: string;
  reference: string | null;
  open: boolean;
  onClose: () => void;
  submitting?: boolean;
  submitError?: string | null;
  /** Set when the server returned a different calculation than the one reviewed: the supplier must look again and confirm again. */
  changedNotice?: string | null;
  onSubmit?: () => void;
}

/**
 * Preview and final review. Both show only what the SERVER calculated and validated (never the browser's numbers); the preview submits nothing and tells
 * nobody, the review ends with an explicit confirmation. A native modal dialog: focus is trapped, Escape closes it (not while submitting), and focus returns
 * to the button that opened it.
 */
export function ReviewDialog({ mode, preview, inquiry, currency, reference, open, onClose, submitting, submitError, changedNotice, onSubmit }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setConfirmed(false);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (changedNotice) setConfirmed(false);
  }, [changedNotice]);

  const c = preview.calculation;
  const blockers = Object.values(preview.blocking);
  const line = preview.line;
  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onClose={onClose} onCancel={(e) => submitting && e.preventDefault()}>
      <h2 id={titleId} className={styles.dialogTitle}>{mode === "review" ? "Review & submit" : "Quotation preview"}</h2>
      <p className={styles.banner} role="note">
        <span className={styles.draftBadge}>Draft</span>
        {mode === "review" ? "Check the final offer. Submitting sends it to the buyer and it can no longer be edited." : "This is a preview of your draft. Nothing has been submitted and the buyer has not been told."}
      </p>
      {changedNotice && <p className={clsx(styles.banner, styles.bannerError)} role="alert" style={{ marginTop: "var(--space-3)" }}>{changedNotice}</p>}

      <dl className={styles.rows} style={{ marginTop: "var(--space-4)" }}>
        <div className={styles.row}><dt>To (buyer)</dt><dd>{inquiry.buyer}</dd></div>
        <div className={styles.row}><dt>Inquiry</dt><dd>{inquiry.reference}</dd></div>
        {reference && <div className={styles.row}><dt>Draft reference</dt><dd>{reference}</dd></div>}
        <div className={styles.row}><dt>Valid until</dt><dd>{preview.validUntilLabel ?? "Not set"}</dd></div>
      </dl>

      <h3 className={styles.label} style={{ margin: "var(--space-4) 0 var(--space-2)" }}>Item</h3>
      {line ? (
        <p className={quotes.small} style={{ marginTop: 0, color: "var(--text-primary)" }}>
          <strong>{line.name || "Unnamed item"}</strong> · {LINE_SOURCE_LABEL[line.source as LineSource]}<br />
          {line.quantity || "?"} {line.unit} × {showEntered(line.unitPrice, currency)}{line.moq ? ` · your MOQ ${line.moq} ${line.unit}` : ""}
        </p>
      ) : (
        <p className={quotes.small}>No item.</p>
      )}

      <h3 className={styles.label} style={{ margin: "var(--space-4) 0 var(--space-2)" }}>Amounts (calculated by the server)</h3>
      <dl className={styles.rows}>
        <div className={styles.row}><dt>Item subtotal</dt><dd>{showMoney(c.subtotal, currency)}</dd></div>
        <div className={styles.row}><dt>Discount</dt><dd>{c.discount && c.discount !== "0.00" ? `- ${showMoney(c.discount, currency)}` : showMoney("0.00", currency)}</dd></div>
        <div className={styles.row}><dt>Taxable amount</dt><dd>{showMoney(c.taxable, currency)}</dd></div>
        <div className={styles.row}><dt>{preview.taxRule ? `Tax: ${preview.taxRule.label} (v${preview.taxRule.version})` : "Tax"}</dt><dd>{c.tax !== null ? showMoney(c.tax, currency) : <span className={styles.pending}>Pending tax review</span>}</dd></div>
        <div className={styles.row}><dt>Freight</dt><dd>{showMoney(c.freight, currency)}</dd></div>
        <div className={styles.row}><dt>Other charges</dt><dd>{showMoney(c.otherCharges, currency)}</dd></div>
        <div className={clsx(styles.row, styles.totalRow)}><dt>Total</dt><dd>{c.total ? showMoney(c.total, currency) : <span className={styles.pending}>Pending tax review{c.provisional ? ` (before tax ${showMoney(c.provisional, currency)})` : ""}</span>}</dd></div>
      </dl>

      <h3 className={styles.label} style={{ margin: "var(--space-4) 0 var(--space-2)" }}>Terms</h3>
      <dl className={styles.rows}>
        {preview.terms.map((t) => (
          <div key={t.label} className={styles.row}><dt>{t.label}</dt><dd>{t.value ?? "Not provided"}</dd></div>
        ))}
        <div className={styles.row}><dt>Attachments</dt><dd>None (not available yet)</dd></div>
      </dl>

      {blockers.length > 0 && (
        <div className={clsx(styles.banner, styles.bannerError)} role="alert" style={{ marginTop: "var(--space-4)", display: "block" }}>
          <strong>This cannot be submitted yet:</strong>
          <ul className={styles.warnList}>{blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </div>
      )}
      {preview.stale && <p className={clsx(styles.banner, styles.bannerError)} role="alert" style={{ marginTop: "var(--space-3)" }}>This draft was changed elsewhere after you opened it. Close this, reload the draft and review it again.</p>}

      {mode === "review" && (
        <label className={styles.confirmRow}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={submitting || !preview.canSubmit} />
          <span>I confirm the amounts, validity and terms above and want to send this quotation to {inquiry.buyer}.</span>
        </label>
      )}
      {submitError && <p className={clsx(styles.banner, styles.bannerError)} role="alert" style={{ marginTop: "var(--space-3)" }}>{submitError}</p>}

      <div className={styles.dialogActions}>
        <button type="button" className={dash.btn} onClick={onClose} disabled={submitting}>{mode === "review" ? "Back to editing" : "Close preview"}</button>
        {mode === "review" && (
          <button type="button" className={clsx(dash.btn, quotes.primaryBtn)} onClick={onSubmit} disabled={!confirmed || !preview.canSubmit || preview.stale || submitting} aria-busy={submitting}>
            {submitting ? "Submitting..." : "Submit quotation"}
          </button>
        )}
      </div>
    </dialog>
  );
}
