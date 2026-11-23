import Link from "next/link";
import { CheckCircle2, CircleAlert, Clock, ShieldAlert } from "lucide-react";
import type { SupplierOverviewDto } from "@/lib/supplier/profileService";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import styles from "./SupplierProfile.module.css";

export function SupplierProfileSide({
  verification,
  nextSteps,
  completion,
}: {
  verification: SupplierOverviewDto["verification"];
  nextSteps: SupplierOverviewDto["nextSteps"];
  completion: SupplierOverviewDto["completion"];
}) {
  return (
    <aside style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <section className={dash.card} aria-labelledby="side-checklist-title">
        <h2 id="side-checklist-title" className={dash.cardTitle}>
          Profile checklist
        </h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0", display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.875rem" }}>
          {completion.items.map((item) => (
            <li key={item.key} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {item.met ? <CheckCircle2 size={18} className={styles.verifyIconDone} aria-label="Complete" /> : <CircleAlert size={18} className={styles.verifyIconPending} aria-label="Incomplete" />}
              <Link prefetch={false} href={`/supplier/company?tab=${item.tab}`} style={{ color: "inherit" }}>{item.label}</Link>
            </li>
          ))}
        </ul>
        <p className={styles.muted} style={{ fontSize: "0.8125rem", margin: 0 }}>{completion.percent}% complete. Profile completeness does not mean verification.</p>
      </section>

      <section className={dash.card} aria-labelledby="side-verification-title">
        <h2 id="side-verification-title" className={dash.cardTitle}>
          Verification Status
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "8px 0" }}>
          <span className={dash.badgeWarn}>
            <ShieldAlert size={14} aria-hidden /> Unverified
          </span>
        </div>
        <p className={styles.muted} style={{ fontSize: "0.8125rem", lineHeight: 1.5 }}>
          {verification.company.note}
        </p>

        <hr style={{ margin: "12px 0", border: 0, borderTop: "1px solid var(--border, #dce8e5)" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.8125rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Email</span>
            <span className={verification.email.status === "VERIFIED" ? dash.badgeOk : dash.badgeWarn}>
              {verification.email.status === "VERIFIED" ? "Verified" : "Unverified"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Phone</span>
            <span className={verification.mobile.status === "VERIFIED" ? dash.badgeOk : dash.badgeWarn}>
              {verification.mobile.status === "VERIFIED" ? "Verified" : "Unverified"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Documents</span>
            <span className={verification.documents.total > 0 ? dash.badgeOk : dash.badgeWarn}>
              {verification.documents.total} Uploaded
            </span>
          </div>
        </div>

        <p className={dash.legendNote} style={{ marginTop: "12px" }}>
          <Link prefetch={false} href="/supplier/company?tab=verification" className={dash.viewAll}>
            View verification checklist
          </Link>
        </p>
      </section>

      <section className={dash.card} aria-labelledby="side-next-title">
        <h2 id="side-next-title" className={dash.cardTitle}>
          Next Actions
        </h2>
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: "10px" }}>
          {nextSteps.map((step) => (
            <li key={step.key} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "0.8125rem" }}>
              {step.status === "done" ? (
                <CheckCircle2 size={16} className={styles.verifyIconDone} aria-hidden />
              ) : step.status === "blocked" ? (
                <Clock size={16} className={styles.verifyIconPending} aria-hidden />
              ) : (
                <CircleAlert size={16} className={styles.verifyIconPending} aria-hidden />
              )}
              <div>
                <Link prefetch={false} href={`/supplier/company?tab=${step.tab}`} style={{ fontWeight: 600, color: "var(--primary, #04534f)" }}>
                  {step.label}
                </Link>
                {step.note && <p style={{ margin: "2px 0 0", color: "var(--text-secondary, #526563)", fontSize: "0.75rem" }}>{step.note}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
