"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import type { RecoveryMethods } from "@/lib/buyer/securitySessions";
import dash from "../Dashboard.module.css";
import inq from "../inquiries/Inquiries.module.css";
import { Loading, StatusBadge } from "./securityShared";
import s from "./Security.module.css";

const STATE = {
  verified: { status: "success" as const, label: "Verified" },
  not_verified: { status: "warn" as const, label: "Not verified" },
  not_set_up: { status: "info" as const, label: "Not set up" },
  unavailable: { status: "info" as const, label: "Not available" },
  available: { status: "success" as const, label: "Available" },
};

/** What can really recover the account: a confirmed email (a reset link). A number is never treated as verified (no SMS service); recovery codes need two-step verification. */
export function RecoveryMethodsPanel() {
  const [data, setData] = useState<RecoveryMethods | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/buyer/security/recovery-methods", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.message ?? "Recovery information could not be loaded.");
      setData(body.data as RecoveryMethods);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className={dash.card} aria-labelledby="recovery-title">
      <h2 id="recovery-title" className={dash.cardTitle}><LifeBuoy size={20} aria-hidden /> Account Recovery</h2>
      {error && !data ? (
        <div role="alert">
          <p className={s.note}>{error}</p>
          <button type="button" className={inq.btn} onClick={() => void load()}>Try again</button>
        </div>
      ) : !data ? (
        <Loading label="Loading recovery information" />
      ) : (
        <ul className={s.recovery}>
          <li className={s.recoveryRow}>
            <div>
              <p className={s.recoveryName}>Email {data.email.masked ? `· ${data.email.masked}` : ""}</p>
              <p className={s.recoveryNote}>{data.email.note}</p>
            </div>
            <StatusBadge status={STATE[data.email.state].status} label={STATE[data.email.state].label} />
          </li>
          <li className={s.recoveryRow}>
            <div>
              <p className={s.recoveryName}>Mobile {data.mobile.masked ? `· ${data.mobile.masked}` : ""}</p>
              <p className={s.recoveryNote}>{data.mobile.note}</p>
            </div>
            <StatusBadge status={STATE[data.mobile.state].status} label={STATE[data.mobile.state].label} />
          </li>
          <li className={s.recoveryRow}>
            <div>
              <p className={s.recoveryName}>Recovery codes</p>
              <p className={s.recoveryNote}>{data.recoveryCodes.note}</p>
            </div>
            <StatusBadge status="info" label="Not available" />
          </li>
          <li className={s.recoveryRow}>
            <div>
              <p className={s.recoveryName}>Password reset by email</p>
              <p className={s.recoveryNote}>{data.passwordReset.note}{data.passwordReset.state === "available" && <> <Link prefetch={false} href="/forgot-password" className={dash.viewAll}>Forgot password</Link></>}</p>
            </div>
            <StatusBadge status={STATE[data.passwordReset.state].status} label={STATE[data.passwordReset.state].label} />
          </li>
        </ul>
      )}
    </section>
  );
}
