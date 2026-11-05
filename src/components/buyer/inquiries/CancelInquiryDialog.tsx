"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { flashToast } from "@/components/ui/Toast";
import styles from "./Inquiries.module.css";

/** Who is being cancelled: the reference (or the id of an old record without one) addresses it; the server re-checks that it is the buyer's own. */
export interface CancelTarget {
  key: string;
  reference: string | null;
  supplierName: string;
}

interface Props {
  target: CancelTarget;
  onClose: () => void;
  /** Called after the server confirmed the cancellation (or said it can no longer be cancelled), so the list and the numbers are read again. */
  onDone: () => void;
}

/** Confirmation before cancelling. The inquiry is only shown as cancelled after the server did it; it is never deleted and its history stays. */
export function CancelInquiryDialog({ target, onClose, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/buyer/inquiries/${target.key}/cancel`, { method: "PATCH" }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && body.ok) {
      flashToast("success", "Your inquiry was cancelled.");
      onDone();
      onClose();
      return;
    }
    setError(res ? (body.message ?? "The inquiry could not be cancelled.") : "Could not reach the server. Nothing was changed.");
    if (res && (res.status === 409 || res.status === 404)) onDone();
  }

  return (
    <Modal title="Cancel this inquiry?" onClose={onClose} role="alertdialog" busy={busy}>
      <p className={styles.dialogText}>
        Inquiry <strong>{target.reference ?? "this inquiry"}</strong> to <strong>{target.supplierName}</strong> will be cancelled. It stays in your list as Cancelled and its history is kept. This cannot be undone.
      </p>
      {error && <p className={styles.fieldError} role="alert">{error}</p>}
      <div className={styles.dialogActions}>
        <button type="button" className={styles.btn} onClick={onClose} disabled={busy} data-autofocus>Keep inquiry</button>
        <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={confirm} disabled={busy}>{busy ? "Cancelling..." : "Yes, cancel inquiry"}</button>
      </div>
    </Modal>
  );
}
