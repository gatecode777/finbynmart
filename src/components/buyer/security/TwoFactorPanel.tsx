import { KeyRound } from "lucide-react";
import dash from "../Dashboard.module.css";
import { StatusBadge } from "./securityShared";
import s from "./Security.module.css";

/**
 * Two-step verification is NOT available: this site has no second-factor service (no authenticator or SMS/e-mail code check at sign-in, no recovery
 * codes). So there is no switch and nothing that looks enabled; the panel says so and what protects the account in the meantime.
 */
export function TwoFactorPanel({ reason }: { reason: string }) {
  return (
    <section className={dash.card} aria-labelledby="twofactor-title">
      <h2 id="twofactor-title" className={dash.cardTitle}><KeyRound size={20} aria-hidden /> Two-Step Verification</h2>
      <p><StatusBadge status="info" label="Not available" /></p>
      <p className={s.intro}>{reason}</p>
      <p className={s.note}>Until it exists, protect your account with a strong, unique password, review your signed-in devices and sign-in activity here, and sign out devices you do not recognise. You will be told here if a new device signs in.</p>
    </section>
  );
}
