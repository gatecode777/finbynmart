import Link from "next/link";
import { CheckCircle2, CircleAlert, Mail, Phone, UserRound } from "lucide-react";
import type { Overview } from "@/lib/buyer/profile";
import { initialsOf } from "../format";
import dash from "../Dashboard.module.css";
import styles from "./Profile.module.css";

const Badge = ({ ok, yes, no }: { ok: boolean; yes: string; no: string }) => (
  <span className={ok ? dash.badgeOk : dash.badgeWarn}>
    {ok ? <CheckCircle2 size={14} aria-hidden /> : <CircleAlert size={14} aria-hidden />} {ok ? yes : no}
  </span>
);

/** The buyer's own summary and completion. Badges follow the stored verification flags: a filled-in field is never "verified". */
export function ProfileHeader({ overview }: { overview: Overview }) {
  const { profile, completion } = overview;
  const missing = completion.items.filter((item) => !item.met);
  return (
    <div className={styles.summary}>
      <section className={dash.card} aria-label="Your details">
        <div className={styles.identity}>
          <span className={styles.avatarLarge} aria-hidden>
            {initialsOf(profile.name)}
          </span>
          <div className={styles.identityText}>
            <h2 className={styles.name}>{profile.name}</h2>
            {profile.designation && <p className={styles.muted}>{profile.designation}</p>}
            {profile.companyName && <p className={styles.muted}>{profile.companyName}</p>}
            <span className={styles.chip}>
              <UserRound size={14} aria-hidden /> Buyer Account
            </span>
          </div>
        </div>
        <ul className={`${styles.contactList} ${styles.contactSpaced}`}>
          <li>
            <Mail size={16} aria-hidden /> <span>{profile.email}</span> <Badge ok={profile.emailVerified} yes="Confirmed" no="Not confirmed" />
          </li>
          <li>
            <Phone size={16} aria-hidden /> <span>{profile.primaryPhone.display ?? "No mobile number"}</span> {profile.primaryPhone.display && <Badge ok={profile.phoneVerified} yes="Confirmed" no="Not confirmed" />}
          </li>
        </ul>
      </section>
      <section className={dash.card} aria-labelledby="completion-title">
        <div className={styles.completionHead}>
          <h2 id="completion-title" className={`${dash.cardTitle} ${styles.noMargin}`}>
            Profile Completion
          </h2>
          <strong>{completion.percent}%</strong>
        </div>
        <div className={styles.progressTrack} role="progressbar" aria-valuenow={completion.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion">
          <div className={styles.progressBar} style={{ width: `${completion.percent}%` }} />
        </div>
        {missing.length === 0 ? (
          <p className={styles.muted}>Everything that counts toward completion is done.</p>
        ) : (
          <>
            <p className={styles.muted}>Still to do:</p>
            <ul className={styles.missing}>
              {missing.map((item) => (
                <li key={item.key}>
                  <Link href={`/buyer/profile?tab=${item.tab}`}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className={dash.legendNote}>Completion counts only what is really done. Business verification is separate and not part of it.</p>
      </section>
    </div>
  );
}
