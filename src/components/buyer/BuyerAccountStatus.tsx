import { Building2, CheckCircle2, CircleAlert, ShieldCheck } from "lucide-react";
import type { AccountStatus, Section } from "@/lib/buyer/dashboard";
import { SectionError } from "./SectionError";
import styles from "./Dashboard.module.css";

const LABELS: Record<string, string> = { ACTIVE: "Active", PENDING_EMAIL_VERIFICATION: "Waiting for email confirmation", SUSPENDED: "Suspended" };

function Row({ label, ok, yes, no }: { label: string; ok: boolean; yes: string; no: string }) {
  return (
    <li className={styles.statusRow}>
      <span>{label}</span>
      <span className={ok ? styles.badgeOk : styles.badgeWarn}>
        {ok ? <CheckCircle2 size={14} aria-hidden /> : <CircleAlert size={14} aria-hidden />} {ok ? yes : no}
      </span>
    </li>
  );
}

/** Email and phone verification are not business verification: they are shown separately and never as "Verified company". */
export function BuyerAccountStatus({ section }: { section: Section<AccountStatus> }) {
  return (
    <section className={styles.card} aria-labelledby="acct-title">
      <h2 id="acct-title" className={styles.cardTitle}>
        <ShieldCheck size={20} aria-hidden /> Account Status
      </h2>
      {section.status === "error" ? (
        <SectionError name="Account status" />
      ) : (
        <>
          <p className={styles.accountLine}>
            <Building2 size={18} aria-hidden /> <strong>{section.data.companyName ?? "No company name added"}</strong>
          </p>
          <ul className={styles.statusList}>
            <li className={styles.statusRow}>
              <span>Account</span>
              <span className={section.data.accountStatus === "ACTIVE" ? styles.badgeOk : styles.badgeWarn}>{LABELS[section.data.accountStatus] ?? section.data.accountStatus}</span>
            </li>
            <Row label="Email" ok={section.data.emailVerified} yes="Confirmed" no="Not confirmed" />
            <Row label="Mobile" ok={section.data.phoneVerified} yes="Confirmed" no="Not confirmed" />
            <li className={styles.statusRow}>
              <span>Business</span>
              <span className={styles.badgeMuted}>Not available yet</span>
            </li>
          </ul>
          <p className={styles.legendNote}>{section.data.businessVerification.reason} Confirming an email or phone number is not business verification.</p>
        </>
      )}
    </section>
  );
}
