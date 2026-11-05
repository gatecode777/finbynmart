"use client";

import { FormEvent, useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { flashToast } from "@/components/ui/Toast";
import { CANCEL_REASON_MAX, CANCEL_REASON_MIN } from "@/lib/orders/orderRules";
import inq from "../inquiries/Inquiries.module.css";
import q from "../quotations/Quotations.module.css";

export interface CancelTarget {
  reference: string;
  supplierName: string;
  statusLabel: string;
}

interface Props {
  target: CancelTarget;
  onClose: () => void;
  /** Called after the server answered (saved, or "no longer possible"), so the list and the numbers are read again. */
  onDone: () => void;
}

/**
 * Asks the buyer to cancel an order. It explains what a request is (not a cancellation, not a refund, supplier not notified yet),
 * needs a reason and an explicit confirmation, and shows the request as saved only after the server did it.
 */
export function CancelRequestDialog({ target, onClose, onDone }: Props) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (reason.trim().length < CANCEL_REASON_MIN) return setFieldError(`Tell us why (at least ${CANCEL_REASON_MIN} characters).`);
    setBusy(true);
    setError("");
    setFieldError("");
    const res = await fetch(`/api/buyer/orders/${target.reference}/cancellation-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, confirm: true }) }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && body.ok) {
      flashToast("success", "Your cancellation request was saved. The order is not cancelled yet.");
      onDone();
      onClose();
      return;
    }
    if (body.fields?.reason) setFieldError(body.fields.reason);
    else setError(res ? (body.message ?? "The request could not be saved.") : "Could not reach the server. Nothing was changed.");
    if (res && (res.status === 409 || res.status === 404)) onDone();
  }

  return (
    <Modal title="Request cancellation?" onClose={onClose} role="alertdialog" busy={busy}>
      <form onSubmit={submit} noValidate>
        <p className={inq.dialogText}>
          Order <strong>{target.reference}</strong> from <strong>{target.supplierName}</strong> is <strong>{target.statusLabel}</strong>. This sends a <em>request</em>: the order is not cancelled until the supplier agrees, the supplier is not notified automatically yet, and nothing is refunded by this request. The order stays in your list and its history is kept.
        </p>
        <div className={q.fieldGroup}>
          <label htmlFor={`${id}-reason`} className={q.fieldLabel}>Reason</label>
          <textarea id={`${id}-reason`} className={q.textarea} value={reason} maxLength={CANCEL_REASON_MAX} onChange={(e) => setReason(e.target.value)} aria-invalid={Boolean(fieldError)} data-autofocus />
          {fieldError && <p className={q.formError} role="alert">{fieldError}</p>}
        </div>
        {error && <p className={q.formError} role="alert">{error}</p>}
        <div className={inq.dialogActions}>
          <button type="button" className={inq.btn} onClick={onClose} disabled={busy}>Keep order</button>
          <button type="submit" className={`${inq.btn} ${inq.btnDanger}`} disabled={busy}>{busy ? "Sending..." : "Send cancellation request"}</button>
        </div>
      </form>
    </Modal>
  );
}
