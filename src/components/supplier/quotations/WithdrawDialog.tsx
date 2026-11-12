"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import dash from "../dashboard/SupplierDashboard.module.css";
import styles from "./SupplierQuotations.module.css";
import { WITHDRAW_REASON_MAX } from "@/lib/supplier/quotationRules";

interface Props {
  reference: string;
  statusLabel: string;
  /** The version the page shows: sent with the request so a newer offer is never withdrawn by mistake. */
  expectedVersion?: number;
  open: boolean;
  onClose: () => void;
  /** Called with the server's real answer after a successful withdrawal. */
  onWithdrawn: (message: string, buyerNotified: boolean) => void;
}

/**
 * Confirmation before a withdrawal: names the quotation and its current status, explains the effect, takes an optional reason and asks for an explicit
 * confirmation. A native modal dialog (focus is trapped, Escape closes it, focus returns to the button that opened it). The result is the server's:
 * a refusal (the buyer accepted a moment ago, the validity ended) is shown as it is and nothing is assumed.
 */
export function WithdrawDialog({ reference, statusLabel, expectedVersion, open, onClose, onWithdrawn }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setReason("");
      setError(null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/supplier/quotations/${encodeURIComponent(reference)}/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true, reason: reason.trim() || undefined, expectedVersion }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res || !body?.ok) {
      setError(body?.message ?? "We could not reach the server. Nothing was changed.");
      return;
    }
    onWithdrawn(body.message as string, Boolean(body.data?.buyerNotified));
  }

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onClose={onClose} onCancel={(e) => busy && e.preventDefault()}>
      <h2 id={titleId} className={styles.dialogTitle}>Withdraw quotation {reference}?</h2>
      <p className={styles.stateText}>
        Current status: <strong>{statusLabel}</strong>. The buyer will no longer be able to accept this quotation. It is not deleted: it stays in your history as Withdrawn, and this cannot be undone.
      </p>
      <div className={styles.field} style={{ marginTop: "var(--space-3)" }}>
        <label className={styles.fieldLabel} htmlFor={`${titleId}-reason`}>Reason (optional, shown to the buyer)</label>
        <textarea id={`${titleId}-reason`} className={styles.textarea} value={reason} maxLength={WITHDRAW_REASON_MAX} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error && <p className={clsx(styles.status, styles.statusError)} role="alert" style={{ marginTop: "var(--space-3)" }}>{error}</p>}
      <div className={styles.dialogActions}>
        <button type="button" className={dash.btn} onClick={onClose} disabled={busy}>Keep quotation</button>
        <button type="button" className={clsx(dash.btn, styles.dangerBtn)} onClick={submit} disabled={busy} aria-busy={busy}>{busy ? "Withdrawing..." : "Withdraw quotation"}</button>
      </div>
    </dialog>
  );
}
