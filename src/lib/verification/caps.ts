import type { AdminCapability } from "@/lib/admin/permissions";
import type { AdminCaps } from "./service";

/** Every flag comes from the account record (the guard's permissions), never from the request. Scope = capability: the admin model has no organisation, category or region scope. */
export const verificationCapsOf = (p: readonly AdminCapability[]): AdminCaps => ({
  approve: p.includes("verification.approve"),
  requestChanges: p.includes("verification.requestChanges"),
  reject: p.includes("verification.reject"),
  documents: p.includes("verification.documents"),
  notes: p.includes("verification.notes"),
  audit: p.includes("verification.audit"),
  supplierPage: p.includes("suppliers.read"),
});
