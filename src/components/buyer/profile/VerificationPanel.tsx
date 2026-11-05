"use client";

import { useState } from "react";
import clsx from "clsx";
import { Building2, CheckCircle2, CircleAlert, FileText, Mail, Phone, ShieldCheck } from "lucide-react";
import type { VerificationDto } from "@/lib/buyer/profile";
import dash from "../Dashboard.module.css";
import styles from "./Profile.module.css";

const Badge = ({ ok, yes, no }: { ok: boolean; yes: string; no: string }) => (
  <span className={ok ? dash.badgeOk : dash.badgeWarn}>
    {ok ? <CheckCircle2 size={14} aria-hidden /> : <CircleAlert size={14} aria-hidden />} {ok ? yes : no}
  </span>
);

/**
 * The four verification systems kept apart. This panel only reports; the one action is asking for a new email confirmation
 * link, and it says plainly when email sending or mobile verification is unavailable (nothing is claimed as sent or delivered).
 */
export function VerificationPanel({ verification }: { verification: VerificationDto }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function resend() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/buyer/verification/email/resend", { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    setMessage({ ok: Boolean(res?.ok && data.ok), text: res ? (data.message ?? "Done.") : "Could not reach the server." });
  }

  const v = verification;
  return (
    <section className={dash.card} aria-labelledby="verify-title">
      <h2 id="verify-title" className={dash.cardTitle}><ShieldCheck size={20} aria-hidden /> Verification</h2>
      <p className={dash.legendNote}>Email, mobile, company and documents are verified separately. Confirming an email or phone number is not business verification.</p>
      {message && <p className={clsx(styles.banner, message.ok ? styles.bannerOk : styles.bannerError)} role={message.ok ? "status" : "alert"}>{message.text}</p>}
      <div className={styles.verifyGrid}>
        <div className={dash.card}>
          <h3 className={styles.verifyTitle}><span><Mail size={18} aria-hidden /> Email</span><Badge ok={v.email.status === "VERIFIED"} yes="Confirmed" no="Not confirmed" /></h3>
          <p className={dash.legendNote}>{v.email.note}</p>
          {v.email.canResend && <button type="button" className={styles.secondaryButton} onClick={resend} disabled={busy}>{busy ? "Sending..." : "Send a new confirmation link"}</button>}
        </div>
        <div className={dash.card}>
          <h3 className={styles.verifyTitle}><span><Phone size={18} aria-hidden /> Mobile</span><Badge ok={v.mobile.status === "VERIFIED"} yes="Confirmed" no="Not confirmed" /></h3>
          <p className={dash.legendNote}>{v.mobile.masked ? `${v.mobile.masked}. ` : ""}{v.mobile.note}</p>
        </div>
        <div className={dash.card}>
          <h3 className={styles.verifyTitle}><span><Building2 size={18} aria-hidden /> Company</span><span className={dash.badgeMuted}>{v.company.status === "NO_COMPANY" ? "No company yet" : "Unverified"}</span></h3>
          <p className={dash.legendNote}>{v.company.note}</p>
        </div>
        <div className={dash.card}>
          <h3 className={styles.verifyTitle}><span><FileText size={18} aria-hidden /> Documents</span><span className={dash.badgeMuted}>{v.documents.total === 0 ? "None submitted" : `${v.documents.pending} pending, ${v.documents.verified} verified`}</span></h3>
          <p className={dash.legendNote}>{v.documents.note}</p>
        </div>
      </div>
    </section>
  );
}
