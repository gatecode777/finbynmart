"use client";

import { FormEvent, useId, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { REOPEN_REASON_MAX, REOPEN_REASON_MIN } from "@/lib/support/conversationRules";
import inq from "../inquiries/Inquiries.module.css";
import styles from "./Support.module.css";
import t from "./TicketDetails.module.css";

/** Asks for the reason, sends it, and closes only when the server confirmed the ticket was reopened. Escape and the backdrop do nothing while it is sending. */
export function ReopenTicketModal({ reference, onClose, onDone }: { reference: string; onClose: () => void; onDone: (message: string) => void }) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const text = reason.trim();
    if (text.length < REOPEN_REASON_MIN) {
      setError(text.length === 0 ? "Tell us why you are reopening this ticket." : `Write at least ${REOPEN_REASON_MIN} characters.`);
      area.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/buyer/support/tickets/${reference}/reopen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: text }) });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) {
        onDone(body.message ?? "Your ticket was reopened.");
        return;
      }
      setError(body?.fields?.reason ?? body?.message ?? "The ticket could not be reopened. Nothing was changed.");
    } catch {
      setError("Could not reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Reopen this ticket" onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate>
        <p className={styles.panelIntro}>Your reason is added to the conversation and the ticket goes back to Reopened. Earlier messages are kept.</p>
        <label htmlFor={`${id}-reason`} className={styles.label}>Reason for reopening <span className={styles.required} aria-hidden>*</span><span className="visually-hidden"> (required)</span></label>
        <textarea id={`${id}-reason`} ref={area} className={`${styles.textarea} ${t.reopenReason}`} value={reason} maxLength={REOPEN_REASON_MAX} onChange={(e) => setReason(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : undefined} disabled={busy} data-autofocus />
        <p className={styles.counter}>{reason.length} / {REOPEN_REASON_MAX}</p>
        {error && <p className={styles.error} id={`${id}-err`} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button type="submit" className={`${inq.btn} ${inq.btnPrimary}`} disabled={busy}><RotateCcw size={16} aria-hidden /> {busy ? "Reopening..." : "Reopen Ticket"}</button>
          <button type="button" className={inq.btn} onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
