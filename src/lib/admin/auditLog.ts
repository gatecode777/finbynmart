import { getDb } from "@/lib/db/mongo";

/**
 * The one administrative audit collection (`admin_audit_log`) with the indexes every admin module relies on: a unique partial `operationKey` (one applied request per administrator +
 * action + idempotency key) and the per-inquiry activity order. Per-company activity has its own index, created by the supplier module.
 */
let auditReady: Promise<unknown> | undefined;
export async function adminAuditLog() {
  const c = (await getDb()).collection("admin_audit_log");
  auditReady ??= Promise.all([
    c.createIndex({ operationKey: 1 }, { unique: true, name: "audit_operation_unique", partialFilterExpression: { operationKey: { $exists: true } } }),
    c.createIndex({ inquiryReference: 1, at: -1, _id: -1 }, { name: "audit_inquiry_newest", partialFilterExpression: { inquiryReference: { $exists: true } } }),
  ]).catch((e) => {
    auditReady = undefined;
    throw e;
  });
  await auditReady;
  return c;
}
