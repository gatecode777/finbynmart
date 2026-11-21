import type { AdminCapability } from "./permissions";
import type { Caps } from "./supplierManagement";

/** Every flag comes from the account record (the guard's permissions), never from the request. Related links need the capability of their own destination. */
export const supplierCapsOf = (p: readonly AdminCapability[]): Caps => ({
  suspend: p.includes("suppliers.suspend"),
  reactivate: p.includes("suppliers.reactivate"),
  links: p.includes("suppliers.links"),
  contacts: p.includes("suppliers.contacts"),
  audit: p.includes("suppliers.audit"),
  products: p.includes("products.read"),
  companyLinks: p.includes("sellers.map"),
  review: p.includes("products.review"),
});
