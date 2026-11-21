/**
 * Client-safe rules of Admin Audit Logs (Page 65): a READ-ONLY viewer of events that supported workflows actually recorded in `admin_audit_log` (the one administrative audit collection). Nothing is
 * reconstructed from current state, `updatedAt`, notifications or assumptions; an action that no workflow records does not appear. Every recorded action is listed here with the capability an
 * administrator must hold, IN ADDITION to `audit.read`, to see it: the domain's own existing audit or read capability (audit access is never an indirect route into a domain). An action that is not in
 * this registry is never listed, filtered, counted or opened.
 */
import type { AdminCapability } from "./permissions";

export type TargetKind = "inquiry" | "buyer" | "company" | "verification" | "category" | "product" | "seller" | "none";
export interface AuditActionDef { key: string; label: string; workflow: string; capability: AdminCapability; target: TargetKind }

export const AUDIT_ACTIONS: readonly AuditActionDef[] = [
  { key: "INQUIRY_RECIPIENT_ROUTED", label: "Inquiry routed to a supplier", workflow: "Inquiry management", capability: "inquiries.audit", target: "inquiry" },
  { key: "INQUIRY_DISTRIBUTION_PAUSED", label: "Inquiry distribution paused", workflow: "Inquiry management", capability: "inquiries.audit", target: "inquiry" },
  { key: "INQUIRY_DISTRIBUTION_RESUMED", label: "Inquiry distribution resumed", workflow: "Inquiry management", capability: "inquiries.audit", target: "inquiry" },
  { key: "INQUIRY_DISTRIBUTION_RETRIED", label: "Inquiry distribution retried", workflow: "Inquiry management", capability: "inquiries.audit", target: "inquiry" },
  { key: "INQUIRIES_EXPORTED", label: "Inquiries exported", workflow: "Inquiry management", capability: "inquiries.audit", target: "none" },
  { key: "SUPPLIER_COMPANY_SUSPENDED", label: "Supplier company suspended", workflow: "Supplier management", capability: "suppliers.audit", target: "company" },
  { key: "SUPPLIER_COMPANY_REACTIVATED", label: "Supplier company reactivated", workflow: "Supplier management", capability: "suppliers.audit", target: "company" },
  { key: "SUPPLIERS_EXPORTED", label: "Suppliers exported", workflow: "Supplier management", capability: "suppliers.audit", target: "none" },
  { key: "SELLER_LINKED", label: "Catalogue seller linked to a company", workflow: "Company links", capability: "sellers.map", target: "seller" },
  { key: "VERIFICATION_SUBMITTED", label: "Verification submitted", workflow: "Supplier verification", capability: "verification.audit", target: "verification" },
  { key: "VERIFICATION_APPROVED", label: "Verification approved", workflow: "Supplier verification", capability: "verification.audit", target: "verification" },
  { key: "VERIFICATION_CHANGES_REQUESTED", label: "Verification changes requested", workflow: "Supplier verification", capability: "verification.audit", target: "verification" },
  { key: "VERIFICATION_REJECTED", label: "Verification rejected", workflow: "Supplier verification", capability: "verification.audit", target: "verification" },
  { key: "VERIFICATION_DOCUMENT_VIEWED", label: "Verification document opened", workflow: "Supplier verification", capability: "verification.audit", target: "verification" },
  { key: "CATEGORY_DEACTIVATED", label: "Category deactivated", workflow: "Category management", capability: "categories.audit", target: "category" },
  { key: "CATEGORY_REACTIVATED", label: "Category reactivated", workflow: "Category management", capability: "categories.audit", target: "category" },
  { key: "PRODUCT_APPROVED", label: "Product revision approved", workflow: "Product review", capability: "products.review", target: "product" },
  { key: "PRODUCT_REJECTED", label: "Product revision rejected", workflow: "Product review", capability: "products.review", target: "product" },
  { key: "PRODUCT_UNPUBLISHED", label: "Product unpublished", workflow: "Product management", capability: "products.read", target: "product" },
  { key: "PRODUCTS_EXPORTED", label: "Products exported", workflow: "Product management", capability: "products.read", target: "none" },
  { key: "BUYER_ACCOUNT_SUSPENDED", label: "Buyer account suspended", workflow: "Buyer management", capability: "buyers.read", target: "buyer" },
  { key: "BUYER_ACCOUNT_REACTIVATED", label: "Buyer account reactivated", workflow: "Buyer management", capability: "buyers.read", target: "buyer" },
] as const;
export const ACTION_KEYS = AUDIT_ACTIONS.map((a) => a.key) as readonly string[];
export const actionOf = (key: string): AuditActionDef | undefined => AUDIT_ACTIONS.find((a) => a.key === key);

/** What this administrator may see: `audit.read` is required, then each action needs its own domain capability. Without `audit.read` nothing is visible. */
export const visibleActions = (permissions: readonly AdminCapability[]): AuditActionDef[] => (permissions.includes("audit.read") ? AUDIT_ACTIONS.filter((a) => permissions.includes(a.capability)) : []);

/** Recorded by no workflow at all (so they cannot appear): stated on the page, not guessed. */
export const NOT_RECORDED = [
  "Support staff replies, internal notes and ticket status changes",
  "Admin display-name changes and other self-service account changes",
  "Sign-ins, sign-outs and other security events (the deferred Super Admin Security Logs)",
  "Reading or searching any page (reads are never recorded)",
] as const;

export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const SEARCH_RE = /^[A-Za-z0-9~/_-]{1,60}$/;
export const EVENT_KEY_RE = /^al-[a-f0-9]{24}$/;
export const eventKeyOf = (id: string) => `al-${id}`;
const CURSOR = /^(\d{10,14})_([0-9a-f]{24})$/;
export const encodeCursor = (c: { ms: number; id: string }) => `${c.ms}_${c.id}`;
export const decodeCursor = (v: string): { ms: number; id: string } | null => { const m = CURSOR.exec(v); return m ? { ms: Number(m[1]), id: m[2] } : null; };

export interface AuditQuery { action: string; q: string; from: string; to: string; cursor: { ms: number; id: string } | null; limit: number }

import { defaultRange, parseRange } from "@/lib/supplier/analyticsRules";
export { defaultRange, parseRange };

/** Strict validation: unknown action (not in the registry), a search that is not a plain reference, impossible / inverted / future / over-366-day dates, a bad cursor or limit, and any other parameter are refused. */
export function validateQuery(get: (k: string) => string | null | undefined, keys: Iterable<string>, now = new Date()): { ok: true; value: AuditQuery } | { ok: false; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const action = get("action") || "all";
  if (action !== "all" && !ACTION_KEYS.includes(action)) fields.action = "Unknown action.";
  const q = (get("q") ?? "").replace(/[\u0000-\u001f]/g, " ").trim();
  if (q && !SEARCH_RE.test(q)) fields.q = "Search by a target reference: letters, digits and - ~ / _ only, up to 60 characters.";
  const d = defaultRange(now);
  const from = get("from") || d.startDay, to = get("to") || d.endDay;
  const r = parseRange(from, to, now);
  if (!r.ok) fields.range = r.message;
  let cursor: AuditQuery["cursor"] = null;
  const c = get("cursor");
  if (c) { cursor = decodeCursor(c); if (!cursor) fields.cursor = "Reload the page and try again."; }
  let limit = PAGE_SIZE;
  const l = get("limit");
  if (l) { const n = /^\d{1,3}$/.test(l) ? Number(l) : NaN; if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE_SIZE) fields.limit = `Use a number from 1 to ${MAX_PAGE_SIZE}.`; else limit = n; }
  for (const k of keys) if (!["action", "q", "from", "to", "cursor", "limit"].includes(k)) fields[k] = "This parameter is not supported.";
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, value: { action, q, from, to, cursor, limit } };
}
