/**
 * Where the legal pages live and which wording of the consent a buyer agreed to.
 *
 * /terms-and-conditions is a REVIEWABLE DRAFT (docs/page-designs/PAGE_17_TERMS_AND_CONDITIONS.md) that says so until the business sets TERMS_EFFECTIVE_DATE; viewing it records no acceptance. /privacy-policy
 * is also reviewable (docs/page-designs/PAGE_16_PRIVACY_POLICY.md). The links point at the routes the footer already uses and nothing is written on the business's behalf. CONSENT_VERSION identifies the WORDING OF THE CONSENT SENTENCE shown on the sign-up and contact forms, so a stored
 * consent says exactly which sentence the person agreed to. Change it whenever that wording changes.
 */
export const TERMS_PATH = "/terms-and-conditions";
export const PRIVACY_PATH = "/privacy-policy";
export const CONSENT_VERSION = "2026-11-02";
