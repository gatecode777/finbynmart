import Link from "next/link";
import { CheckCircle2, Circle, Lightbulb, MinusCircle, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import type { NextStep, VerificationDto } from "@/lib/buyer/profile";
import dash from "../Dashboard.module.css";
import styles from "./Profile.module.css";

/** Account verification summary and the next steps, both derived from the stored account, company and document state. */
export function ProfileSide({ verification, nextSteps }: { verification: VerificationDto; nextSteps: NextStep[] }) {
  return (
    <aside className={styles.side} aria-label="Verification summary and next steps">
      <section className={dash.card} aria-labelledby="side-verify">
        <h2 id="side-verify" className={dash.cardTitle}><ShieldCheck size={20} aria-hidden /> Account Verification</h2>
        <ul className={dash.statusList}>
          <li className={dash.statusRow}><span>Email</span><span className={verification.email.status === "VERIFIED" ? dash.badgeOk : dash.badgeWarn}>{verification.email.status === "VERIFIED" ? "Confirmed" : "Not confirmed"}</span></li>
          <li className={dash.statusRow}><span>Mobile</span><span className={verification.mobile.status === "VERIFIED" ? dash.badgeOk : dash.badgeWarn}>{verification.mobile.status === "VERIFIED" ? "Confirmed" : "Not confirmed"}</span></li>
          <li className={dash.statusRow}><span>Business</span><span className={dash.badgeMuted}>Not available yet</span></li>
        </ul>
      </section>
      <section className={dash.card} aria-labelledby="side-next">
        <h2 id="side-next" className={dash.cardTitle}><Lightbulb size={20} aria-hidden /> Next Steps</h2>
        <ul className={styles.stepList}>
          {nextSteps.map((step) => (
            <li key={step.key} className={clsx(styles.step, step.status === "done" && styles.stepDone, step.status === "blocked" && styles.stepBlocked)}>
              {step.status === "done" ? <CheckCircle2 size={18} aria-hidden /> : step.status === "blocked" ? <MinusCircle size={18} aria-hidden /> : <Circle size={18} aria-hidden />}
              <span>
                {step.status === "todo" ? <Link href={`/buyer/profile?tab=${step.tab}`} className={dash.viewAll}>{step.label}</Link> : step.label}
                <span className="visually-hidden">{step.status === "done" ? " (done)" : step.status === "blocked" ? " (not available yet)" : " (to do)"}</span>
                {step.note && <span className={styles.stepNote}>{step.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
