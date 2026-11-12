"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CheckCircle2, Clock, FileText, Trash2, UploadCloud, XCircle } from "lucide-react";
import { SUPPLIER_DOCUMENT_TYPES } from "@/lib/supplier/profileRules";
import type { SupplierDocumentDto } from "@/lib/supplier/profileService";
import auth from "@/components/auth/Auth.module.css";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import styles from "./SupplierProfile.module.css";

export function SupplierDocumentsPanel({
  documents,
  storageConfigured,
}: {
  documents: SupplierDocumentDto[];
  storageConfigured: boolean;
}) {
  const router = useRouter();
  const [docType, setDocType] = useState(SUPPLIER_DOCUMENT_TYPES[0].value);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!selectedFile || busy) return;
    setBanner(null);
    setBusy(true);

    const formData = new FormData();
    formData.append("type", docType);
    formData.append("file", selectedFile);

    const res = await fetch("/api/supplier/company/documents", {
      method: "POST",
      body: formData,
    }).catch(() => null);

    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);

    if (res?.ok && data.ok) {
      setSelectedFile(null);
      setBanner({ ok: true, text: "Document uploaded successfully and queued for review." });
      router.refresh();
      return;
    }

    setBanner({
      ok: false,
      text: res ? data.message ?? "Upload failed." : "Network error. Please try again.",
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to remove this document?")) return;
    const res = await fetch(`/api/supplier/company/documents/${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      router.refresh();
    } else {
      alert("Failed to delete document.");
    }
  }

  const statusBadge = (status: SupplierDocumentDto["status"]) => {
    switch (status) {
      case "VERIFIED":
        return <span className={dash.badgeOk}><CheckCircle2 size={13} aria-hidden /> Verified</span>;
      case "REJECTED":
        return <span className={dash.badgeError}><XCircle size={13} aria-hidden /> Rejected</span>;
      case "PENDING":
      default:
        return <span className={dash.badgeWarn}><Clock size={13} aria-hidden /> In Review</span>;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section className={dash.card} aria-labelledby="upload-doc-title">
        <h2 id="upload-doc-title" className={dash.cardTitle}>
          <UploadCloud size={20} aria-hidden /> Upload Verification Document
        </h2>
        <p className={dash.legendNote}>
          Upload business proof documents to verify your supplier account and increase buyer trust.
        </p>

        {banner && (
          <p className={clsx(styles.banner, banner.ok ? styles.bannerOk : styles.bannerError)} role={banner.ok ? "status" : "alert"}>
            {banner.text}
          </p>
        )}

        {!storageConfigured && (
          <div className={dash.accessNote} role="alert" style={{ marginBottom: "1rem" }}>
            <p className={dash.welcome}>Document storage is operating in local development mode.</p>
          </div>
        )}

        <form onSubmit={handleUpload} aria-label="Upload document form">
          <div className={styles.formGrid}>
            <div className={auth.field}>
              <label htmlFor="doc-type" className={auth.label}>
                Document Type <span aria-hidden>*</span>
              </label>
              <select
                id="doc-type"
                className={auth.control}
                value={docType}
                onChange={(e) => setDocType(e.target.value as typeof docType)}
              >
                {SUPPLIER_DOCUMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={auth.field}>
              <label htmlFor="doc-file" className={auth.label}>
                Select File (PDF, PNG, JPG up to 10MB) <span aria-hidden>*</span>
              </label>
              <input
                id="doc-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={onFileChange}
                className={auth.control}
                required
              />
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={!selectedFile || busy}
            >
              <UploadCloud size={16} aria-hidden /> {busy ? "Uploading..." : "Upload Document"}
            </button>
          </div>
        </form>
      </section>

      <section className={dash.card} aria-labelledby="submitted-docs-title">
        <h2 id="submitted-docs-title" className={dash.cardTitle}>
          <FileText size={20} aria-hidden /> Submitted Documents ({documents.length})
        </h2>

        {documents.length === 0 ? (
          <p className={styles.muted} style={{ padding: "1rem 0" }}>
            No documents have been uploaded yet. Upload your GST or business certificate above.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className={styles.docsTable}>
              <thead>
                <tr>
                  <th>Document Type</th>
                  <th>File Name</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td style={{ fontWeight: 600 }}>{doc.label}</td>
                    <td>{doc.originalFilename}</td>
                    <td>{(doc.fileSize / 1024).toFixed(1)} KB</td>
                    <td>{statusBadge(doc.status)}</td>
                    <td>{new Date(doc.submittedAt).toLocaleDateString("en-IN")}</td>
                    <td>
                      {doc.status !== "VERIFIED" ? (
                        <button
                          type="button"
                          className={styles.btnDanger}
                          onClick={() => handleDelete(doc.id)}
                          aria-label={`Remove ${doc.label}`}
                        >
                          <Trash2 size={13} aria-hidden /> Remove
                        </button>
                      ) : (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Locked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
