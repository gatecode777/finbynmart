import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import type { SupplierOverviewDto } from "@/lib/supplier/profileService";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import styles from "./SupplierProfile.module.css";

export function SupplierVerificationPanel({
  verification,
}: {
  verification: SupplierOverviewDto["verification"];
}) {
  return (
    <section className={dash.card} aria-labelledby="verification-panel-title">
      <h2 id="verification-panel-title" className={dash.cardTitle}>
        <ShieldCheck size={20} aria-hidden /> Supplier Verification Checklist
      </h2>
      <p className={dash.legendNote}>
        Finbyn Mart verifies business sellers to ensure marketplace security and foster trust with B2B buyers.
      </p>

      <ul className={styles.verifyList}>
        <li className={styles.verifyItem}>
          {verification.email.status === "VERIFIED" ? (
            <CheckCircle2 size={24} className={styles.verifyIconDone} aria-hidden />
          ) : (
            <Clock size={24} className={styles.verifyIconPending} aria-hidden />
          )}
          <div className={styles.verifyBody}>
            <h3 className={styles.verifyItemTitle}>Primary Email Address</h3>
            <p className={styles.verifyItemText}>{verification.email.note}</p>
          </div>
          <span className={verification.email.status === "VERIFIED" ? dash.badgeOk : dash.badgeWarn}>
            {verification.email.status === "VERIFIED" ? "Verified" : "Pending"}
          </span>
        </li>

        <li className={styles.verifyItem}>
          {verification.mobile.status === "VERIFIED" ? (
            <CheckCircle2 size={24} className={styles.verifyIconDone} aria-hidden />
          ) : (
            <Clock size={24} className={styles.verifyIconPending} aria-hidden />
          )}
          <div className={styles.verifyBody}>
            <h3 className={styles.verifyItemTitle}>Primary Mobile Number</h3>
            <p className={styles.verifyItemText}>{verification.mobile.note}</p>
          </div>
          <span className={verification.mobile.status === "VERIFIED" ? dash.badgeOk : dash.badgeWarn}>
            {verification.mobile.status === "VERIFIED" ? "Verified" : "Pending"}
          </span>
        </li>

        <li className={styles.verifyItem}>
          {verification.documents.total > 0 ? (
            <CheckCircle2 size={24} className={styles.verifyIconDone} aria-hidden />
          ) : (
            <Clock size={24} className={styles.verifyIconPending} aria-hidden />
          )}
          <div className={styles.verifyBody}>
            <h3 className={styles.verifyItemTitle}>Business &amp; Tax Documents</h3>
            <p className={styles.verifyItemText}>{verification.documents.note}</p>
          </div>
          <span className={verification.documents.total > 0 ? dash.badgeOk : dash.badgeWarn}>
            {verification.documents.total > 0 ? `${verification.documents.total} Submitted` : "None"}
          </span>
        </li>

        <li className={styles.verifyItem}>
          <Clock size={24} className={styles.verifyIconPending} aria-hidden />
          <div className={styles.verifyBody}>
            <h3 className={styles.verifyItemTitle}>Finbyn Mart Official Trust Seal</h3>
            <p className={styles.verifyItemText}>
              Following document submission, your company profile is reviewed by our compliance team. Once verified,
              your listings will carry the verified badge.
            </p>
          </div>
          <span className={dash.badgeWarn}>In Review</span>
        </li>
      </ul>

      <div style={{ marginTop: "1.5rem", padding: "16px", background: "#f8faf9", borderRadius: "8px", border: "1px solid var(--border, #dce8e5)" }}>
        <h4 style={{ margin: "0 0 6px", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary, #183a38)" }}>
          How Verification Helps Your Business:
        </h4>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem", color: "var(--text-secondary, #526563)", lineHeight: 1.6 }}>
          <li>Verified Trust Badge displayed on all your product listings and supplier profile.</li>
          <li>Higher ranking in buyer search results and category recommendations.</li>
          <li>Direct quotation requests and inquiries from high-volume verified enterprise buyers.</li>
        </ul>
      </div>
    </section>
  );
}
