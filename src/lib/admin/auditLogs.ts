import { ObjectId, type Document } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import type { AdminCapability } from "./permissions";
import { adminAuditLog } from "./auditLog";
import { actionOf, eventKeyOf, visibleActions, type AuditActionDef, type AuditQuery, ACTION_KEYS } from "./auditRules";
import { refCode as buyerCode } from "./buyerRules";
import { refCode as companyCode } from "./supplierRules";
import { parseRange } from "@/lib/supplier/analyticsRules";

/**
 * Admin Audit Logs (Page 65): READ-ONLY. One explicit adapter over the one collection that exists, `admin_audit_log`. A row is returned only if its `action` is in the registry AND the administrator holds
 * `audit.read` plus that action's domain capability (resolved on every request from the account). The DTO is built field by field from an allowlist: the raw document is never sent, free text is length
 * bounded, `before`/`after` snapshots are reduced to allowlisted scalar fields, and unknown fields are dropped. Nothing is written, counted for display, or reconstructed. Outcome is not recorded by any
 * producer (rows are written only for committed actions) so none is shown. A deleted target never removes an event: targets are not resolved, only referenced.
 */
export interface Actor { label: string; kind: "admin" | "supplier" | "buyer" | "unavailable" }
export interface AuditRow { eventKey: string; action: string; label: string; workflow: string; recordedAt: string; actor: Actor; target: { type: string; reference: string | null } }
export interface AuditList { items: AuditRow[]; nextCursor: string | null; referenceTime: string; coverage: { workflows: string[] }; actions: { key: string; label: string }[] }
export interface AuditDetail extends AuditRow {
  reason: string | null;
  reasonCode: string | null;
  summary: string | null;
  changes: { label: string; before: string; after: string }[];
  facts: { label: string; value: string }[];
  link: { href: string; label: string } | null;
  notes: string[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let indexReady: Promise<unknown> | undefined;
async function col() {
  const c = await adminAuditLog();
  indexReady ??= Promise.all([
    c.createIndex({ at: -1, _id: -1 }, { name: "audit_newest" }),
    c.createIndex({ action: 1, at: -1, _id: -1 }, { name: "audit_action_newest" }),
  ]).catch((e) => { indexReady = undefined; throw e; });
  await indexReady;
  return c;
}

/** The action filter and the visibility scope in ONE condition. */
function scopeCondition(allowed: AuditActionDef[], action: string): Document {
  const keys = allowed.map((a) => a.key).filter((k) => action === "all" || k === action);
  return { action: { $in: keys } };
}

/** Exact or prefix search on the fields a supported workflow records; the text is validated to a plain reference first (no operators, no free regex). */
export function searchCondition(term: string): Document | null {
  const t = term.trim();
  if (!t) return null;
  const upper = t.toUpperCase();
  if (/^[a-f0-9]{24}$/i.test(t)) { const id = new ObjectId(t.toLowerCase()); return { $or: [{ buyerId: id }, { companyId: id }, { productId: id }, { adminUserId: id }] }; }
  if (/^BUY-[A-F0-9]{8}$/.test(upper)) return { $expr: { $eq: [{ $substrCP: [{ $toString: "$buyerId" }, 16, 8] }, upper.slice(4).toLowerCase()] } };
  if (/^CMP-[A-F0-9]{8}$/.test(upper)) return { $expr: { $eq: [{ $substrCP: [{ $toString: "$companyId" }, 16, 8] }, upper.slice(4).toLowerCase()] } };
  if (/^FBM-[A-Z]{2,5}-[A-Z0-9-]{1,20}$/.test(upper)) return { $or: [{ inquiryReference: { $regex: `^${escapeRe(upper)}` } }, { verificationReference: { $regex: `^${escapeRe(upper)}` } }] };
  return { $or: [{ categoryId: t }, { categoryId: t.toLowerCase() }, { sellerKey: t }, { sellerKey: upper }] };
}

async function actors(ids: ObjectId[]): Promise<Map<string, Actor>> {
  const out = new Map<string, Actor>();
  if (ids.length === 0) return out;
  const users = await (await getDb()).collection<{ _id: ObjectId; name?: string; role?: string }>("users").find({ _id: { $in: ids } }, { projection: { name: 1, role: 1 } }).toArray();
  for (const u of users) out.set(u._id.toHexString(), u.role === "admin" ? { label: (u.name ?? "").trim() || "Admin account", kind: "admin" } : u.role === "supplier" ? { label: "Supplier account owner", kind: "supplier" } : { label: "Buyer account", kind: "buyer" });
  return out;
}
const actorOf = (d: Document, map: Map<string, Actor>): Actor => {
  const id = d.actorId instanceof ObjectId ? d.actorId.toHexString() : null;
  return (id && map.get(id)) || { label: "Actor unavailable", kind: "unavailable" };
};

const short = (v: unknown, n: number): string | null => (typeof v === "string" && v.trim() ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) : null);
const hex = (v: unknown): string | null => (v instanceof ObjectId ? v.toHexString() : null);

export function targetOf(def: AuditActionDef, d: Document): { type: string; reference: string | null } {
  switch (def.target) {
    case "inquiry": return { type: "Inquiry", reference: short(d.inquiryReference, 40) };
    case "buyer": { const id = hex(d.buyerId); return { type: "Buyer account", reference: id ? buyerCode(id) : null }; }
    case "company": { const id = hex(d.companyId); return { type: "Supplier company", reference: id ? companyCode(id) : null }; }
    case "seller": { const id = hex(d.companyId); return { type: "Supplier company", reference: id ? companyCode(id) : null }; }
    case "verification": return { type: "Verification submission", reference: short(d.verificationReference, 40) };
    case "category": return { type: "Category", reference: short(d.categoryId, 60) };
    case "product": return { type: "Product", reference: hex(d.productId) };
    default: return { type: "Not applicable", reference: null };
  }
}

function rowOf(def: AuditActionDef, d: Document, map: Map<string, Actor>): AuditRow {
  return { eventKey: eventKeyOf((d._id as ObjectId).toHexString()), action: def.key, label: def.label, workflow: def.workflow, recordedAt: (d.at as Date).toISOString(), actor: actorOf(d, map), target: targetOf(def, d) };
}
const LIST_PROJECTION = { action: 1, actorId: 1, at: 1, inquiryReference: 1, buyerId: 1, companyId: 1, productId: 1, verificationReference: 1, categoryId: 1 };

/** Newest first by recorded time then id (keyset cursor), one bounded read of limit + 1 rows from the single source; no totals are claimed. */
export async function listAuditEvents(permissions: readonly AdminCapability[], q: AuditQuery, now = new Date()): Promise<AuditList> {
  const allowed = visibleActions(permissions);
  const base: AuditList = { items: [], nextCursor: null, referenceTime: now.toISOString(), coverage: { workflows: [...new Set(allowed.map((a) => a.workflow))] }, actions: allowed.map((a) => ({ key: a.key, label: a.label })) };
  if (allowed.length === 0) return base;
  const range = parseRange(q.from, q.to, now);
  if (!range.ok) throw new Error("invalid range");
  const and: Document[] = [{ at: { $gte: range.range.start, $lt: range.range.end } }, scopeCondition(allowed, q.action)];
  const s = searchCondition(q.q);
  if (s) and.push(s);
  if (q.cursor) and.push({ $or: [{ at: { $lt: new Date(q.cursor.ms) } }, { at: new Date(q.cursor.ms), _id: { $lt: new ObjectId(q.cursor.id) } }] });
  const c = await col();
  const rows = await c.find({ $and: and }, { projection: LIST_PROJECTION }).sort({ at: -1, _id: -1 }).limit(q.limit + 1).toArray();
  const page = rows.slice(0, q.limit);
  const map = await actors(page.flatMap((d) => (d.actorId instanceof ObjectId ? [d.actorId] : [])));
  const items = page.map((d) => rowOf(actionOf(d.action as string)!, d, map));
  const last = page[page.length - 1];
  return { ...base, items, nextCursor: rows.length > q.limit && last ? `${(last.at as Date).getTime()}_${(last._id as ObjectId).toHexString()}` : null };
}

const STATUS_LABELS: Record<string, string> = { ACTIVE: "Active", SUSPENDED: "Suspended", PENDING_EMAIL_VERIFICATION: "Awaiting e-mail confirmation", PENDING_REVIEW: "Pending review", APPROVED: "Approved", REJECTED: "Rejected", CHANGES_REQUESTED: "Changes requested", SUPERSEDED: "Superseded" };
const scalar = (v: unknown): string | null => (typeof v === "string" ? (STATUS_LABELS[v] ?? v.slice(0, 40)) : typeof v === "boolean" ? (v ? "Active" : "Inactive") : typeof v === "number" ? String(v) : null);
/** Only allowlisted scalar keys of before/after are shown (never a whole snapshot). */
function changesOf(d: Document): AuditDetail["changes"] {
  const b = d.before && typeof d.before === "object" ? (d.before as Document) : null, a = d.after && typeof d.after === "object" ? (d.after as Document) : null;
  if (!b || !a) return [];
  const out: AuditDetail["changes"] = [];
  for (const [key, label] of [["status", "Status"], ["state", "State"], ["isActive", "Active"]] as const) {
    const x = scalar(b[key]), y = scalar(a[key]);
    if (x !== null && y !== null) out.push({ label, before: x, after: y });
  }
  return out;
}

export async function getAuditEvent(eventKey: string, permissions: readonly AdminCapability[]): Promise<AuditDetail | null> {
  if (!/^al-[a-f0-9]{24}$/.test(eventKey)) return null;
  const allowed = visibleActions(permissions);
  if (allowed.length === 0) return null;
  const c = await col();
  const d = await c.findOne({ _id: new ObjectId(eventKey.slice(3)), action: { $in: allowed.map((a) => a.key) } });
  if (!d) return null; // unknown, malformed and out-of-scope events are the same 404
  const def = actionOf(d.action as string)!;
  const map = await actors(d.actorId instanceof ObjectId ? [d.actorId] : []);
  const facts: AuditDetail["facts"] = [];
  if (typeof d.rows === "number") facts.push({ label: "Rows exported", value: String(d.rows) });
  if (typeof d.truncated === "boolean") facts.push({ label: "Export truncated", value: d.truncated ? "Yes" : "No" });
  if (typeof d.revision === "number") facts.push({ label: "Revision", value: String(d.revision) });
  if (def.key === "SELLER_LINKED") { const n = short(d.sellerName, 120), k = short(d.sellerKey, 40); if (n) facts.push({ label: "Catalogue seller", value: n }); if (k) facts.push({ label: "Seller key", value: k }); }
  const target = targetOf(def, d);
  const link = linkOf(def, d, permissions);
  const notes = ["The actor name is the account's current name, not necessarily its name when the event was recorded.", "Only the event was recorded; the record it refers to may have changed or no longer exist, and its current state is not shown here."];
  return { ...rowOf(def, d, map), reason: short(d.reason, 500), reasonCode: short(d.reasonCode, 40), summary: short(d.summary, 200), changes: changesOf(d), facts, link, notes: target.reference ? notes : notes.slice(0, 1) };
}

/** Deep links only to existing pages whose own permission is held; the destination enforces it again. Nothing executes by opening it. */
function linkOf(def: AuditActionDef, d: Document, p: readonly AdminCapability[]): AuditDetail["link"] {
  if (def.target === "inquiry" && p.includes("inquiries.read") && typeof d.inquiryReference === "string" && /^FBM-INQ-[A-Z0-9]{6,12}$/.test(d.inquiryReference)) return { href: `/admin/inquiries?review=${d.inquiryReference}`, label: "Open inquiry" };
  if (def.target === "verification" && p.includes("verification.read") && typeof d.verificationReference === "string" && /^[A-Z0-9-]{6,40}$/.test(d.verificationReference)) return { href: `/admin/verification?review=${encodeURIComponent(d.verificationReference)}`, label: "Open submission" };
  if (def.target === "buyer" && p.includes("buyers.read") && d.buyerId instanceof ObjectId) return { href: `/admin/buyers?review=${d.buyerId.toHexString()}`, label: "Open buyer" };
  if (def.target === "company" && p.includes("suppliers.read") && d.companyId instanceof ObjectId) return { href: `/admin/suppliers?review=${d.companyId.toHexString()}`, label: "Open supplier" };
  return null;
}
export { ACTION_KEYS };
