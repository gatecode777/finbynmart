/**
 * Account-recovery security settings in one place. Values can be tuned with environment variables, within safe bounds.
 *  - AUTH_RESET_TTL_MINUTES: how long a password-reset link works (default 30, allowed 5 to 120).
 *  - AUTH_VERIFY_TTL_HOURS: how long an email-confirmation link works (default 24, allowed 1 to 72).
 *  - AUTH_RESEND_COOLDOWN_SECONDS: minimum gap between two recovery emails for the same address (default 60, allowed 30 to 600).
 */
function bounded(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min && value <= max ? Math.floor(value) : fallback;
}

export const resetTtlMinutes = () => bounded("AUTH_RESET_TTL_MINUTES", 30, 5, 120);
export const verifyTtlHours = () => bounded("AUTH_VERIFY_TTL_HOURS", 24, 1, 72);
/** How long the "password reset successful" page can be reopened after a reset (default 10 minutes, allowed 2 to 60). */
export const resetConfirmationMinutes = () => bounded("AUTH_RESET_CONFIRMATION_MINUTES", 10, 2, 60);
export const resendCooldownSeconds = () => bounded("AUTH_RESEND_COOLDOWN_SECONDS", 60, 30, 600);

/** Recovery emails per address per hour (on top of the cooldown) and per client address per hour. */
export const RECOVERY_PER_EMAIL_PER_HOUR = 3;
export const RECOVERY_PER_IP_PER_HOUR = 10;
