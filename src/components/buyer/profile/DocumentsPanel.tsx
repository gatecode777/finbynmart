"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Eye, FileText, Trash2, Upload } from "lucide-react";
import { DOCUMENT_LIMITS, type DocumentStatus } from "@/lib/buyer/profileRules";
import type { DocumentDto } from "@/lib/buyer/profile";
import dash from "../Dashboard.module.css";
import styles from "./Profile.module.css";

const STATUS: Record<DocumentStatus, { label: string; tone: "ok" | "warn" | "muted" | "bad" }> = {
  NOT_SUBMITTED: { label: "Not submitted", tone: "muted" },
  PENDING: { label: "Pending review", tone: "warn" },
  VERIFIED: { label: "Verified", tone: "ok" },
  REJECTED: { label: "Rejected", tone: "bad" },
  EXPIRED: { label: "Expired", tone: "bad" },
  RESUBMISSION_REQUIRED: { label: "Resubmission required", tone: "bad" },
};

const toneClass = (tone: "ok" | "warn" | "muted" | "bad") => (tone === "ok" ? dash.badgeOk : tone === "warn" ? dash.badgeWarn : tone === "bad" ? styles.badgeBad : dash.badgeMuted);
const sizeText = (n: number | null) => (n === null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

interface Props {
  hasCompany: boolean;
  storageConfigured: boolean;
  documents: DocumentDto[];
}

/**
 * Company documents. The buyer can upload, replace, view and remove; the status is shown, never chosen. Files go to private
 * storage and are viewed through an authenticated route. Upload progress is real (XMLHttpRequest progress events). There is no
 * review process yet, so a submitted document stays "Pending review"; that is stated.
 */
export function DocumentsPanel({ hasCompany, storageConfigured, documents }: Props) {
  const router = useRouter();
  const [busyType, setBusyType] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<DocumentDto | null>(null);
  const files = useRef<Record<string, HTMLInputElement | null>>({});
  const expiry = useRef<Record<string, HTMLInputElement | null>>({});

  function upload(type: string) {
    const file = files.current[type]?.files?.[0];
    if (!file) return setMessage({ ok: false, text: "Choose a file first." });
    if (file.size > DOCUMENT_LIMITS.maxBytes) return setMessage({ ok: false, text: `That file is larger than ${DOCUMENT_LIMITS.maxBytes / 1024 / 1024} MB.` });
    const form = new FormData();
    form.set("documentType", type);
    form.set("file", file);
    const exp = expiry.current[type]?.value;
    if (exp) form.set("expiryDate", exp);
    setBusyType(type);
    setProgress(0);
    setMessage(null);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/buyer/company/documents");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => { setBusyType(null); setMessage({ ok: false, text: "The upload failed (no connection). Try again." }); };
    xhr.onload = () => {
      setBusyType(null);
      let data: { ok?: boolean; message?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      setMessage({ ok: xhr.status < 300 && data.ok === true, text: data.message ?? "The upload failed." });
      if (data.ok) {
        const input = files.current[type];
        if (input) input.value = "";
        router.refresh();
      }
    };
    xhr.send(form);
  }

  async function remove(doc: DocumentDto) {
    setConfirm(null);
    const res = await fetch(`/api/buyer/company/documents/${doc.id}`, { method: "DELETE" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setMessage({ ok: Boolean(res?.ok && data.ok), text: res ? (data.message ?? "Done.") : "Could not reach the server." });
    if (res?.ok) router.refresh();
  }

  if (!hasCompany) {
    return (
      <section className={dash.card} aria-labelledby="docs-title">
        <h2 id="docs-title" className={dash.cardTitle}><FileText size={20} aria-hidden /> Documents</h2>
        <p className={clsx(styles.banner, styles.bannerInfo)}>Add your company details first. Documents belong to your company.</p>
        <Link href="/buyer/profile?tab=company" className={styles.primaryButton}>Add Company Details</Link>
      </section>
    );
  }

  return (
    <section className={dash.card} aria-labelledby="docs-title">
      <h2 id="docs-title" className={dash.cardTitle}><FileText size={20} aria-hidden /> Documents</h2>
      <p className={styles.limits}>PDF, JPG or PNG, up to {DOCUMENT_LIMITS.maxBytes / 1024 / 1024} MB each. Documents are stored privately and only you can open them. No review process is available yet, so submitted documents stay &quot;Pending review&quot;.</p>
      {!storageConfigured && <p className={clsx(styles.banner, styles.bannerError)} role="alert">Document storage is not configured on this server, so uploads are unavailable.</p>}
      {message && <p className={clsx(styles.banner, message.ok ? styles.bannerOk : styles.bannerError)} role={message.ok ? "status" : "alert"}>{message.text}</p>}
      <ul className={styles.docList}>
        {documents.map((doc) => {
          const status = STATUS[doc.status];
          const uploading = busyType === doc.type;
          return (
            <li key={doc.type} className={styles.docRow}>
              <div>
                <p className={styles.docTitle}>{doc.label}</p>
                <p><span className={toneClass(status.tone)}>{status.label}</span></p>
                {doc.originalFilename && <p className={styles.docMeta}>{doc.originalFilename} · {sizeText(doc.fileSize)} · submitted {doc.submittedAt?.slice(0, 10)}{doc.expiryDate ? ` · expires ${doc.expiryDate}` : ""}</p>}
                {doc.rejectionReason && <p className={styles.reason}>Reason: {doc.rejectionReason}</p>}
                {storageConfigured && doc.status !== "VERIFIED" && (
                  <div className={styles.uploadControls}>
                    <label>
                      <span>{doc.id ? "Replace file" : "File"}</span>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" ref={(el) => { files.current[doc.type] = el; }} disabled={Boolean(busyType)} aria-label={`${doc.label}: choose a file`} />
                    </label>
                    <label>
                      <span>Expiry date (optional)</span>
                      <input type="date" ref={(el) => { expiry.current[doc.type] = el; }} disabled={Boolean(busyType)} aria-label={`${doc.label}: expiry date`} />
                    </label>
                    <button type="button" className={styles.secondaryButton} onClick={() => upload(doc.type)} disabled={Boolean(busyType)}>
                      <Upload size={16} aria-hidden /> {uploading ? "Uploading..." : doc.id ? "Replace" : "Upload"}
                    </button>
                  </div>
                )}
                {uploading && (
                  <div className={styles.progressWrap}>
                    <div className={styles.progressTrack} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${doc.label} upload progress`}>
                      <div className={styles.progressBar} style={{ width: `${progress}%` }} />
                    </div>
                    <span className={dash.legendNote}>{progress}%</span>
                  </div>
                )}
              </div>
              {doc.id && (
                <div className={styles.docActions}>
                  <a className={styles.secondaryButton} href={`/api/buyer/company/documents/${doc.id}`} target="_blank" rel="noopener noreferrer">
                    <Eye size={16} aria-hidden /> View<span className="visually-hidden"> {doc.label}</span>
                  </a>
                  {doc.status !== "VERIFIED" && (
                    <button type="button" className={styles.dangerButton} onClick={() => setConfirm(doc)} disabled={Boolean(busyType)}>
                      <Trash2 size={16} aria-hidden /> Remove<span className="visually-hidden"> {doc.label}</span>
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {confirm && (
        <div className={styles.dialogBackdrop} role="presentation" onKeyDown={(e) => e.key === "Escape" && setConfirm(null)}>
          <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text">
            <h3 id="confirm-title" className={dash.cardTitle}>Remove this document?</h3>
            <p id="confirm-text" className={dash.legendNote}>{confirm.label} ({confirm.originalFilename}) will be deleted from private storage. You can upload it again later.</p>
            <div className={styles.actions}>
              <button type="button" className={styles.dangerButton} onClick={() => remove(confirm)} autoFocus>Remove</button>
              <button type="button" className={styles.secondaryButton} onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
