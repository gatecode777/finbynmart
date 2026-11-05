"use client";

import { FormEvent, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, MessageSquareDiff, Printer, Scale, X } from "lucide-react";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { flashToast } from "@/components/ui/Toast";
import { MESSAGE_MAX, MESSAGE_MIN, REASON_MAX, REVISION_REASONS } from "@/lib/quotations/quotationRules";
import inq from "../inquiries/Inquiries.module.css";
import d from "../inquiries/detail/InquiryDetail.module.css";
import styles from "./Quotations.module.css";

interface Summary {
  reference: string;
  version: number;
  supplierName: string;
  quantityText: string;
  unitPrice: string;
  totalText: string | null;
  taxNote: string;
  validLabel: string;
}

interface Props {
  summary: Summary;
  can: { accept: boolean; reject: boolean; requestRevision: boolean };
  compareHref: string | null;
}

type Dialog = null | "accept" | "reject" | "revision";

async function post(path: string, payload: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null);
  const body = res ? await res.json().catch(() => ({})) : {};
  return { ok: Boolean(res?.ok && body.ok), body: body as { message?: string; fields?: Record<string, string> }, reached: Boolean(res) };
}

/**
 * Back, Compare, Print and the buyer's decisions on this version. Every decision asks first, names the exact version, and is shown as
 * done only after the server confirmed it (the server checks again that the version is still current, open and valid). Accepting
 * records the decision only: there is no order or payment module, and the dialog says so.
 */
export function QuotationActions({ summary, can, compareHref }: Props) {
  const router = useRouter();
  const id = useId();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [revReason, setRevReason] = useState("");
  const [message, setMessage] = useState("");
  const base = `/api/buyer/quotations/${summary.reference}`;

  const close = () => {
    if (busy) return;
    setDialog(null);
    setError("");
    setFields({});
  };

  async function run(path: string, payload: unknown) {
    setBusy(true);
    setError("");
    setFields({});
    const result = await post(path, payload);
    setBusy(false);
    if (result.ok) {
      flashToast("success", result.body.message ?? "Done.");
      setDialog(null);
      router.refresh();
      return;
    }
    setFields(result.body.fields ?? {});
    setError(result.reached ? (result.body.message ?? "That could not be done.") : "Could not reach the server. Nothing was changed.");
    if (result.reached && !result.body.fields) router.refresh();
  }

  function submitRevision(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!revReason) found.reason = "Choose a reason from the list.";
    if (message.trim().length < MESSAGE_MIN) found.message = `Describe the change you want (at least ${MESSAGE_MIN} characters).`;
    setFields(found);
    if (Object.keys(found).length > 0) return;
    void run(`${base}/revision-request`, { reason: revReason, message, version: summary.version });
  }

  return (
    <>
      <div className={`${d.headerActions} ${d.noPrint}`}>
        <Link href="/buyer/quotations" className={d.btn}><ArrowLeft size={18} aria-hidden /> Back to Quotations</Link>
        {compareHref && <Link href={compareHref} className={d.btn}><Scale size={18} aria-hidden /> Compare Quotations</Link>}
        <button type="button" className={d.btn} onClick={() => window.print()}><Printer size={18} aria-hidden /> Print / Save</button>
      </div>

      {(can.accept || can.reject || can.requestRevision) && (
        <div className={`${d.bar} ${d.noPrint}`} role="group" aria-label="Quotation decisions">
          {can.accept && <button type="button" className={`${d.btn} ${inq.btnPrimary}`} onClick={() => setDialog("accept")}><Check size={18} aria-hidden /> Accept Quotation</button>}
          {can.reject && <button type="button" className={`${d.btn} ${d.btnDanger}`} onClick={() => setDialog("reject")}><X size={18} aria-hidden /> Reject Quotation</button>}
          {can.requestRevision && <button type="button" className={d.btn} onClick={() => setDialog("revision")}><MessageSquareDiff size={18} aria-hidden /> Request Revision</button>}
        </div>
      )}

      {dialog === "accept" && (
        <ConfirmDialog
          title="Accept this quotation?"
          message={`Accept ${summary.reference} (version ${summary.version}) from ${summary.supplierName}: ${summary.quantityText} at ${summary.unitPrice}${summary.totalText ? `, total ${summary.totalText}${summary.taxNote}` : ""}, valid until ${summary.validLabel}. This records your decision only. Order processing is not available yet, and nothing is ordered, paid or sent to the supplier.${error ? ` ${error}` : ""}`}
          confirmLabel={busy ? "Accepting..." : "Yes, accept quotation"}
          cancelLabel="Not yet"
          busy={busy}
          onConfirm={() => void run(`${base}/accept`, { version: summary.version, confirm: true })}
          onCancel={close}
        />
      )}

      {dialog === "reject" && (
        <Modal title="Reject this quotation?" onClose={close} role="alertdialog" busy={busy}>
          <p className={inq.dialogText}>You are rejecting {summary.reference} (version {summary.version}) from {summary.supplierName}. Other quotations for the same inquiry are not affected. The quotation stays in your list as Rejected.</p>
          <div className={styles.fieldGroup}>
            <label htmlFor={`${id}-reason`} className={styles.fieldLabel}>Reason (optional)</label>
            <textarea id={`${id}-reason`} className={styles.textarea} value={reason} maxLength={REASON_MAX} onChange={(e) => setReason(e.target.value)} aria-invalid={Boolean(fields.reason)} />
            {fields.reason && <p className={styles.formError} role="alert">{fields.reason}</p>}
          </div>
          {error && <p className={styles.formError} role="alert">{error}</p>}
          <div className={inq.dialogActions}>
            <button type="button" className={inq.btn} onClick={close} disabled={busy} data-autofocus>Keep it</button>
            <button type="button" className={`${inq.btn} ${inq.btnDanger}`} disabled={busy} onClick={() => void run(`${base}/reject`, { version: summary.version, confirm: true, ...(reason.trim() ? { reason } : {}) })}>{busy ? "Rejecting..." : "Yes, reject quotation"}</button>
          </div>
        </Modal>
      )}

      {dialog === "revision" && (
        <Modal title="Request a revision" onClose={close} busy={busy}>
          <form onSubmit={submitRevision} className={inq.filterForm} noValidate>
            <ul className={styles.summaryList}>
              <li><strong>{summary.reference}</strong> version {summary.version}</li>
              <li>{summary.supplierName}</li>
              <li>{summary.quantityText} at {summary.unitPrice}</li>
            </ul>
            <div className={styles.fieldGroup}>
              <label htmlFor={`${id}-rr`} className={styles.fieldLabel}>Reason</label>
              <select id={`${id}-rr`} className={inq.select} value={revReason} onChange={(e) => setRevReason(e.target.value)} aria-invalid={Boolean(fields.reason)} data-autofocus>
                <option value="">Choose a reason</option>
                {REVISION_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {fields.reason && <p className={styles.formError} role="alert">{fields.reason}</p>}
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor={`${id}-rm`} className={styles.fieldLabel}>What should change?</label>
              <textarea id={`${id}-rm`} className={styles.textarea} value={message} maxLength={MESSAGE_MAX} onChange={(e) => setMessage(e.target.value)} aria-invalid={Boolean(fields.message)} />
              {fields.message && <p className={styles.formError} role="alert">{fields.message}</p>}
            </div>
            <p className={inq.fieldHint}>Your request is saved with this version. The supplier is not notified automatically yet, and the quotation itself is not changed.</p>
            {error && <p className={styles.formError} role="alert">{error}</p>}
            <div className={inq.dialogActions}>
              <button type="button" className={inq.btn} onClick={close} disabled={busy}>Cancel</button>
              <button type="submit" className={`${inq.btn} ${inq.btnPrimary}`} disabled={busy}>{busy ? "Saving..." : "Send request"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
