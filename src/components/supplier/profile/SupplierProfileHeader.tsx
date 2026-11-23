import Link from "next/link";
import { CheckCircle2, CircleAlert, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import type { SupplierOverviewDto } from "@/lib/supplier/profileService";
import { initialsOf } from "@/components/buyer/format";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import styles from "./SupplierProfile.module.css";

const Badge = ({ ok, yes, no }: { ok: boolean; yes: string; no: string }) => (
  <span className={ok ? dash.badgeOk : dash.badgeWarn}>
    {ok ? <CheckCircle2 size={13} aria-hidden /> : <CircleAlert size={13} aria-hidden />} {ok ? yes : no}
  </span>
);

export function SupplierProfileHeader({ overview }: { overview: SupplierOverviewDto }) {
  const { profile, company, completion } = overview;
  const missing = completion.items.filter((item) => !item.met);

  return (
    <div className={styles.summary}>
      <section className={dash.card} aria-label="Company identity">
        <div className={styles.identity}>
          <span className={styles.avatarLarge} aria-hidden>
            {initialsOf(company.businessName || profile.name)}
          </span>
          <div className={styles.identityText}>
            <h2 className={styles.name}>{company.businessName || "Your Company Name"}</h2>
            <p className={styles.muted}>
              Contact Person: <strong>{profile.name}</strong>
              {profile.designation ? ` (${profile.designation})` : ""}
            </p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
              <span className={styles.chip}>Supplier Account</span>
              <span className={styles.chip} style={{ background: "#fef3c7", color: "#92400e" }}>
                <ShieldCheck size={14} aria-hidden /> Verification: Unverified
              </span>
              {company.city && (
                <span className={styles.chip} style={{ background: "#f1f5f9", color: "#334155" }}>
                  <MapPin size={13} aria-hidden /> {company.city}
                </span>
              )}
            </div>
          </div>
        </div>

        <ul className={styles.contactList}>
          <li>
            <Mail size={15} aria-hidden /> <span>{profile.email}</span>
            <Badge ok={profile.emailVerified} yes="Confirmed" no="Not confirmed" />
          </li>
          <li>
            <Phone size={15} aria-hidden /> <span>{profile.phone ?? "No mobile number registered"}</span>
            {profile.phone && <Badge ok={profile.phoneVerified} yes="Confirmed" no="Not confirmed" />}
          </li>
        </ul>
      </section>

      <section className={dash.card} aria-labelledby="completion-title">
        <div className={styles.completionHead}>
          <h2 id="completion-title" className={dash.cardTitle} style={{ margin: 0 }}>
            Profile Completion
          </h2>
          <span className={styles.completionPercent}>{completion.percent}%</span>
        </div>
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-valuenow={completion.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Profile completion progress"
        >
          <div className={styles.progressBar} style={{ width: `${completion.percent}%` }} />
        </div>
        {missing.length === 0 ? (
          <p className={styles.muted}>Great job! All profile items are completed.</p>
        ) : (
          <>
            <p className={styles.muted}>Recommended next actions:</p>
            <ul className={styles.missing}>
              {missing.slice(0, 3).map((item) => (
                <li key={item.key}>
                  <Link prefetch={false} href={`/supplier/company?tab=${item.tab}`}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className={dash.legendNote}>
          Complete your business profile to build trust with buyers and accelerate verification.
        </p>
      </section>
    </div>
  );
}
