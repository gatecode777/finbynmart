"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { flashToast } from "@/components/ui/Toast";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import styles from "./SupplierProfile.module.css";
import type { SupplierVerificationView } from "@/lib/verification/service";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/**
 * The supplier's view of its OWN company-evidence review: what the platform's policy requires, which of it is uploaded, the actual status of the latest submission and the safe reason of
 * a decision. Submitting is the only action; the server decides everything else. Uploading a file, a complete profile and e-mail or phone confirmation are not verification and are never
 * described as such here. Success is reported only after the server recorded the submission.
 */
export function SupplierCompanyReviewCard({ review }: { review: SupplierVerificationView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef<string | null>(null);

  async function submit() {
    setBusy(true);
    setError("");
    key.current ??= crypto.randomUUID();
    const res = await fetch("/api/supplier/company/verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: key.current }) }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && json?.ok) {
      key.current = null;
      flashToast("success", String(json.message ?? "Submitted."));
      router.refresh();
      return;
    }
    setError(json?.message ?? (res ? "Your submission could not be saved." : "Network error. Nothing was submitted. Check your connection and try again."));
    flashToast("error", "Not submitted.");
    if (res && res.status !== 503) key.current = null;
  }

  const p = review.policy;
  const l = review.latest;
  return (
    <section className={dash.card} aria-labelledby="company-review-title" style={{ marginBottom: "1rem" }}>
      <h2 id="company-review-title" className={dash.cardTitle}><ClipboardCheck size={20} aria-hidden /> Company evidence review</h2>
      <p className={dash.legendNote}>Finbyn Mart reviews the business evidence you submit against its published policy. This is a platform review of your evidence, not government registration or product-quality certification.</p>

      <p role="status"><strong>{review.effective.label}.</strong> {review.effective.note}</p>
      {l && (
        <p>
          Latest submission <strong>{l.reference}</strong> (revision {l.revision}) · {l.label} · submitted {when(l.submittedAt)}{l.decidedAt ? ` · decided ${when(l.decidedAt)}` : ""}.
          {l.reasonLabel && <> Reason: {l.reasonLabel}.</>} {l.supplierMessage}
        </p>
      )}

      {p.state !== "CONFIGURED" ? (
        <p role="note" className={dash.legendNote}>{p.message}</p>
      ) : (
        <>
          <h3 className={styles.verifyItemTitle}>Required evidence (policy {p.version})</h3>
          <ul style={{ margin: ".25rem 0 .75rem", paddingLeft: "1.25rem" }}>
            {p.required.map((r) => <li key={r.type}>{r.label}: {r.uploaded ? "uploaded" : "not uploaded yet"}</li>)}
          </ul>
          {p.optional.length > 0 && <p className={dash.legendNote}>Optional: {p.optional.map((o) => `${o.label} (${o.uploaded ? "uploaded" : "not uploaded"})`).join(", ")}.</p>}
          {!p.applies && <p role="note">The policy does not apply to your business type ({p.businessType || "not set"}).</p>}
        </>
      )}
      {review.blockers.length > 0 && p.state === "CONFIGURED" && <p role="note" className={dash.legendNote}>{review.blockers[0]}</p>}
      {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
      <button type="button" className={styles.btnPrimary} onClick={() => void submit()} disabled={busy || !review.canSubmit}>{busy ? "Submitting…" : l && l.state !== "APPROVED" ? "Submit again for review" : "Submit for review"}</button>
      <p className={dash.legendNote}>Upload documents on the KYC Documents tab first. A document you remove after submitting stays on file for the review.</p>
    </section>
  );
}
