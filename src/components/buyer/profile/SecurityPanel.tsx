"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import type { SecurityDto } from "@/lib/buyer/profile";
import { ChangePasswordForm } from "../security/ChangePasswordForm";
import dash from "../Dashboard.module.css";
import styles from "./Profile.module.css";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "Not recorded");

/** A compact security summary (the full workspace is Account Security, Page 38) and the one shared change-password form. */
export function SecurityPanel({ security }: { security: SecurityDto }) {
  return (
    <section className={dash.card} aria-labelledby="security-title">
      <h2 id="security-title" className={dash.cardTitle}><Lock size={20} aria-hidden /> Security</h2>
      <ul className={dash.statusList}>
        <li className={dash.statusRow}><span>Account</span><span className={security.accountStatus === "ACTIVE" ? dash.badgeOk : dash.badgeWarn}>{security.accountStatus === "ACTIVE" ? "Active" : security.accountStatus}</span></li>
        <li className={dash.statusRow}><span>Email</span><span className={security.emailVerified ? dash.badgeOk : dash.badgeWarn}>{security.emailVerified ? "Confirmed" : "Not confirmed"}</span></li>
        <li className={dash.statusRow}><span>Mobile</span><span className={security.phoneVerified ? dash.badgeOk : dash.badgeWarn}>{security.phoneVerified ? "Confirmed" : "Not confirmed"}</span></li>
        <li className={dash.statusRow}><span>Last sign-in</span><span>{when(security.lastLoginAt)}</span></li>
        <li className={dash.statusRow}><span>Password last changed</span><span>{when(security.passwordChangedAt)}</span></li>
        <li className={dash.statusRow}><span>Signed-in devices</span><span>{security.sessions.activeCount === null ? "Not available" : security.sessions.activeCount}</span></li>
      </ul>
      <p className={dash.legendNote}>{security.sessions.reason} <Link prefetch={false} href="/buyer/security?tab=sessions" className={dash.viewAll}>Open Account Security</Link></p>

      <h3 className={`${styles.verifyTitle} ${styles.sectionGap}`}>Change Password</h3>
      <ChangePasswordForm />
    </section>
  );
}
