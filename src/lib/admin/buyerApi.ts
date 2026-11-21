import type { AdminCapability } from "./permissions";
import type { Caps } from "./buyerManagement";

/** Every flag comes from the account record (the guard's permissions), never from the request. The inquiry link needs the capability of its own destination. */
export const buyerCapsOf = (p: readonly AdminCapability[]): Caps => ({
  suspend: p.includes("buyers.suspend"),
  reactivate: p.includes("buyers.reactivate"),
  contacts: p.includes("buyers.contacts"),
  inquiries: p.includes("inquiries.read"),
});
