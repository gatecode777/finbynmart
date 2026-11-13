/** Client-safe rules for linking a catalogue seller to a supplier company (audit D-01). */
export const REASON_MIN = 10;
export const REASON_MAX = 300;
export const SELLER_KEY_LIMIT = 50;

export interface LinkRequest { companyId: string; sellerKey: string; reason: string; acknowledgeHistory: boolean }
export type LinkErrors = Partial<Record<keyof LinkRequest, string>>;

export function validateLink(r: LinkRequest): LinkErrors {
  const e: LinkErrors = {};
  if (!/^[a-f0-9]{24}$/.test(r.companyId)) e.companyId = "Choose a company.";
  if (!r.sellerKey || r.sellerKey.length > 80) e.sellerKey = "Choose a seller.";
  const reason = r.reason.trim();
  if (reason.length < REASON_MIN) e.reason = `Give the ownership evidence or ticket reference (at least ${REASON_MIN} characters).`;
  else if (reason.length > REASON_MAX) e.reason = `Use at most ${REASON_MAX} characters.`;
  if (r.acknowledgeHistory !== true) e.acknowledgeHistory = "Confirm that the company will see the existing inquiries, quotations and orders of this seller.";
  return e;
}
