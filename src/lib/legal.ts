/**
 * Where the legal pages live and which wording of the consent a buyer agreed to.
 *
 * The pages themselves (/terms-and-conditions, /privacy-policy) are not published yet (the site shows an honest "not
 * published" page for them): the links point at the routes the footer already uses and nothing is written on the business's
 * behalf. CONSENT_VERSION identifies the WORDING OF THE CONSENT SENTENCE shown on the sign-up and contact forms, so a stored
 * consent says exactly which sentence the person agreed to. Change it whenever that wording changes.
 */
export const TERMS_PATH = "/terms-and-conditions";
export const PRIVACY_PATH = "/privacy-policy";
export const CONSENT_VERSION = "2026-11-02";
