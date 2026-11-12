"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Ban, Download, GitBranchPlus, PencilLine, Printer } from "lucide-react";
import { REVISION_REASON_MAX, REVISION_REASON_MIN } from "@/lib/quotations/revisionRules";
import dash from "../dashboard/SupplierDashboard.module.css";
import { newIdempotencyKey } from "../idempotencyKey";
import styles from "./SupplierQuotations.module.css";
import { WithdrawDialog } from "./WithdrawDialog";

interface Props {
  reference: string;
  statusLabel: string;
  /** The version being shown: a withdrawal names it, so looking at an older version can never withdraw a newer offer. */
  version: number;
  isDraft: boolean;
  canWithdraw: boolean;
  editHref?: string | null;
  createRevision: { available: boolean; reason: string | null; continueHref: string | null };
  pdfReason: string;
}

/**
 * The actions of the quotation page. Every one is offered only when the server says it is allowed (and the server checks again): Print (the browser's own;
 * there is no generated PDF), Edit Draft, Create Revision (a dialog that asks for a reason and makes a NEW draft version: nothing is sent to the buyer),
 * Continue the revision draft, and Withdraw (with a confirmation). Download PDF is shown as unavailable with its reason, never as a button that does nothing.
 */
export function DetailActions({ reference, statusLabel, version, isDraft, canWithdraw, editHref, createRevision, pdfReason }: Props) {
  const router = useRouter();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pdfId = useId();
  return (
    <>
      <div className={clsx(styles.headerActions, styles.noPrint)}>
        <button type="button" className={dash.btn} disabled aria-describedby={pdfId}>
          <Download size={18} aria-hidden /> Download PDF
        </button>
        <button type="button" className={dash.btn} onClick={() => window.print()}>
          <Printer size={18} aria-hidden /> Print
        </button>
        {editHref && (
          <Link href={editHref} className={clsx(dash.btn, styles.primaryBtn)}>
            <PencilLine size={18} aria-hidden /> Edit Draft
          </Link>
        )}
        {!isDraft && createRevision.available && (
          <button type="button" className={clsx(dash.btn, styles.primaryBtn)} onClick={() => setRevisionOpen(true)}>
            <GitBranchPlus size={18} aria-hidden /> Create Revision
          </button>
        )}
        {!isDraft && !createRevision.available && createRevision.continueHref && (
          <Link href={createRevision.continueHref} className={clsx(dash.btn, styles.primaryBtn)}>
            <PencilLine size={18} aria-hidden /> Continue Revision Draft
          </Link>
        )}
        {canWithdraw && (
          <button type="button" className={dash.btn} onClick={() => setWithdrawOpen(true)}>
            <Ban size={18} aria-hidden /> Withdraw quotation
          </button>
        )}
      </div>
      <p id={pdfId} className={clsx(styles.reason, styles.noPrint)}>{pdfReason}</p>
      {!isDraft && !createRevision.available && !createRevision.continueHref && createRevision.reason && <p className={clsx(styles.reason, styles.noPrint)}>Create Revision is not available: {createRevision.reason}</p>}
      {notice && <p className={clsx(styles.status, styles.noPrint)} role="status">{notice}</p>}
      {withdrawOpen && (
        <WithdrawDialog
          reference={reference}
          statusLabel={statusLabel}
          expectedVersion={version}
          open
          onClose={() => setWithdrawOpen(false)}
          onWithdrawn={(message) => {
            setWithdrawOpen(false);
            setNotice(message);
            router.refresh();
          }}
        />
      )}
      {revisionOpen && <RevisionDialog reference={reference} version={version} onClose={() => setRevisionOpen(false)} />}
    </>
  );
}

/** Asks for the reason, then creates the revision DRAFT and opens it in the create-quotation editor. The key is kept for retries of the same reason, so a lost answer cannot create two drafts. */
function RevisionDialog({ reference, version, onClose }: { reference: string; version: number; onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<{ reason: string; key: string } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function create() {
    const text = reason.trim();
    if (text.length < REVISION_REASON_MIN) return setError(`Give a reason of at least ${REVISION_REASON_MIN} characters.`);
    if (!key.current || key.current.reason !== text) key.current = { reason: text, key: newIdempotencyKey() };
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/supplier/quotations/${encodeURIComponent(reference)}/revisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseVersion: version, reason: text, idempotencyKey: key.current.key }) });
      const body = await res.json().catch(() => null);
      if ((res.status === 201 || res.status === 200) && body?.ok) {
        router.push(body.data.editHref);
        return;
      }
      if (res.status === 409 && body?.code === "REVISION_EXISTS" && body.data?.editHref) {
        router.push(body.data.editHref);
        return;
      }
      setError(body?.fields?.reason ?? body?.message ?? "The revision was not created.");
    } catch {
      setError("We could not confirm the result (the connection was lost). Press the button again: retrying is safe and will not create a second draft.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onClose={onClose} onCancel={(e) => busy && e.preventDefault()}>
      <h2 id={titleId} className={styles.dialogTitle}>Create a revision of version {version}?</h2>
      <p className={styles.stateText}>This creates version {version + 1} as a <strong>draft</strong>, copied from version {version}. The buyer keeps seeing version {version} and is not told anything until you submit the revision. Version {version} is never changed. You will review the price, tax and terms again before submitting.</p>
      <div className={styles.field} style={{ marginTop: "var(--space-3)" }}>
        <label className={styles.fieldLabel} htmlFor={`${titleId}-reason`}>Reason for the revision ({REVISION_REASON_MIN}-{REVISION_REASON_MAX} characters)</label>
        <textarea id={`${titleId}-reason`} className={styles.textarea} value={reason} maxLength={REVISION_REASON_MAX} onChange={(e) => setReason(e.target.value)} disabled={busy} aria-invalid={error ? true : undefined} aria-describedby={error ? `${titleId}-err` : undefined} />
      </div>
      {error && <p id={`${titleId}-err`} className={clsx(styles.status, styles.statusError)} role="alert" style={{ marginTop: "var(--space-3)" }}>{error}</p>}
      <div className={styles.dialogActions}>
        <button type="button" className={dash.btn} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={clsx(dash.btn, styles.primaryBtn)} onClick={() => void create()} disabled={busy} aria-busy={busy}>{busy ? "Creating..." : "Create revision draft"}</button>
      </div>
    </dialog>
  );
}
