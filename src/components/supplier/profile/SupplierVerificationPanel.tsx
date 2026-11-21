import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import type { SupplierOverviewDto } from "@/lib/supplier/profileService";
import type { SupplierVerificationView } from "@/lib/verification/service";
import { SupplierCompanyReviewCard } from "./SupplierCompanyReviewCard";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import styles from "./SupplierProfile.module.css";

export function SupplierVerificationPanel({
  verification,
  review,
}: {
  verification: SupplierOverviewDto["verification"];
  review: SupplierVerificationView | null;
}) {
  return (
    <>
      {review && <SupplierCompanyReviewCard review={review} />}
    <section className={dash.card} aria-labelledby="verification-panel-title">
      <h2 id="verification-panel-title" className={dash.cardTitle}>
        <ShieldCheck size={20} aria-hidden /> Account and document checklist
      </h2>
      <p className={dash.legendNote}>
        These are separate facts. E-mail, phone and uploaded files are not company verification: only the evidence review above can approve your company.
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
            {verification.documents.total > 0 ? `${verification.documents.total} Uploaded` : "None"}
          </span>
        </li>

        <li className={styles.verifyItem}>
          {review?.effective.kind === "REVIEWED" ? <CheckCircle2 size={24} className={styles.verifyIconDone} aria-hidden /> : <Clock size={24} className={styles.verifyIconPending} aria-hidden />}
          <div className={styles.verifyBody}>
            <h3 className={styles.verifyItemTitle}>Company evidence review</h3>
            <p className={styles.verifyItemText}>{review ? review.effective.note : "Company review status is unavailable right now."}</p>
          </div>
          <span className={review?.effective.kind === "REVIEWED" ? dash.badgeOk : dash.badgeWarn}>{review ? review.effective.label : "Unavailable"}</span>
        </li>
      </ul>
    </section>
    </>
  );
}
