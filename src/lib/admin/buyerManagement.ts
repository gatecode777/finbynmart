import { createHash } from "node:crypto";
import { ObjectId, type ClientSession, type Document } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { adminAuditLog } from "./auditLog";
import {
  BUYER_ID_RE, CODE_RE, PAGE_SIZE, MAX_PAGE_SIZE, MAX_PAGE, STATUS_LABEL, actionPlan, cleanReason, maskEmail, maskPhone, refCode, validateReason,
  type AccountState, type ActionState, type BuyerAction, type BuyerListState,
} from "./buyerRules";
import { KEY_RE } from "./inquiryRules";

/**
 * Admin Buyer Management (Page 51). Buyers are `users` records with role "buyer": no second user store, identity or authentication system. Every read has role "buyer" in its filter, so
 * a supplier or admin account can never be listed, opened or changed here, by id or otherwise.
 *
 * Suspension is the account's own `accountStatus` (the same field `getCurrentUser` and the sign-in route already enforce on EVERY request): a suspended account cannot sign in and every
 * existing session is refused on its next request. Suspending also raises `sessionVersion`, so the sessions that were open stay ended after a reactivation. One snapshot transaction commits
 * the conditional update (state + revision), and the audit row (unique operation key + request hash) together or not at all. Nothing is deleted.
 */
export interface Caps { suspend: boolean; reactivate: boolean; contacts: boolean; inquiries: boolean }
interface UserRow { _id: ObjectId; name?: string; email?: string; role?: string; accountStatus?: AccountState; accountRev?: number; createdAt?: Date; updatedAt?: Date; lastLoginAt?: Date | null; companyName?: string; emailVerified?: boolean; phone?: { normalized?: string; countryCode?: string }; suspension?: { at: Date; reason: string } }

let indexReady: Promise<unknown> | undefined;
async function users() {
  const c = (await getDb()).collection<UserRow>("users");
  indexReady ??= Promise.all([
    c.createIndex({ role: 1, createdAt: -1, _id: -1 }, { name: "buyers_admin_newest" }),
    (async () => (await adminAuditLog()).createIndex({ buyerId: 1, at: -1, _id: -1 }, { name: "audit_buyer_newest", partialFilterExpression: { buyerId: { $exists: true } } }))(),
  ]).catch((e) => { indexReady = undefined; throw e; });
  await indexReady;
  return c;
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stateOf = (u: Pick<UserRow, "accountStatus">): AccountState => u.accountStatus ?? "ACTIVE";

// ---------------------------------------------------------------- list
export interface BuyerRow { id: string; code: string; name: string; status: AccountState; statusLabel: string; joinedAt: string | null }
export interface BuyerList { items: BuyerRow[]; meta: { page: number; limit: number; total: number; totalPages: number } }

/** Role, status and the search term. Name is an anchored, escaped, case-insensitive prefix; a 24-hex id or a BUY- code matches the account reference. Input is data, never query syntax. */
export function buyerMatch(s: Pick<BuyerListState, "q" | "status">): Document {
  const m: Document = { role: "buyer" };
  if (s.status === "ACTIVE") m.accountStatus = { $in: ["ACTIVE", null] }; // an absent status is ACTIVE
  else if (s.status !== "all") m.accountStatus = s.status;
  const term = s.q.trim();
  if (term) {
    if (term.length === 24 && BUYER_ID_RE.test(term.toLowerCase())) m._id = new ObjectId(term.toLowerCase());
    else if (CODE_RE.test(term.toUpperCase())) m.$expr = { $eq: [{ $substrCP: [{ $toString: "$_id" }, 16, 8] }, term.slice(4).toLowerCase()] };
    else m.name = { $regex: `^${escapeRe(term)}`, $options: "i" };
  }
  return m;
}

const rowOf = (d: UserRow): BuyerRow => ({ id: d._id.toHexString(), code: refCode(d._id.toHexString()), name: (d.name ?? "").trim() || "Name not provided", status: stateOf(d), statusLabel: STATUS_LABEL[stateOf(d)], joinedAt: d.createdAt ? d.createdAt.toISOString() : null });

/** One bounded page (newest account first, the unique _id as tie-break) and one count under the same filter; only name, status and joined date are read. */
export async function listBuyers(s: BuyerListState, limit = PAGE_SIZE): Promise<BuyerList> {
  const c = await users();
  const match = buyerMatch(s);
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
  const page = Math.max(1, Math.min(MAX_PAGE, Math.floor(s.page)));
  const [rows, total] = await Promise.all([
    c.find(match, { projection: { name: 1, accountStatus: 1, createdAt: 1 } }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * size).limit(size).toArray(),
    c.countDocuments(match),
  ]);
  return { items: rows.map(rowOf), meta: { page, limit: size, total, totalPages: Math.max(1, Math.ceil(total / size)) } };
}

// ---------------------------------------------------------------- detail
export interface BuyerDetail extends BuyerRow {
  role: "Buyer";
  businessName: string | null;
  emailConfirmed: boolean;
  /** Always false: no business verification exists for buyers. An e-mail confirmation is not a verified business. */
  businessVerified: false;
  lastSignInAt: string | null;
  /** Full values only with buyers.contacts; otherwise masked server-side (the full value is never sent). */
  contact: { email: string | null; phone: string | null; masked: boolean };
  revision: number;
  actions: Record<BuyerAction, ActionState>;
  suspension: { at: string; reason: string } | null;
  links: { inquiries: string | null };
}

export async function getBuyer(reference: string, caps: Caps): Promise<BuyerDetail | null> {
  if (!BUYER_ID_RE.test(reference)) return null;
  const d = await (await users()).findOne({ _id: new ObjectId(reference), role: "buyer" }, { projection: { name: 1, email: 1, accountStatus: 1, accountRev: 1, createdAt: 1, lastLoginAt: 1, companyName: 1, emailVerified: 1, "phone.normalized": 1, suspension: 1 } });
  if (!d) return null;
  const row = rowOf(d);
  const canSeeReason = caps.suspend || caps.reactivate;
  return {
    ...row,
    role: "Buyer",
    businessName: d.companyName?.trim() || null,
    emailConfirmed: d.emailVerified === true,
    businessVerified: false,
    lastSignInAt: d.lastLoginAt ? d.lastLoginAt.toISOString() : null,
    contact: caps.contacts
      ? { email: d.email || null, phone: d.phone?.normalized || null, masked: false }
      : { email: d.email ? maskEmail(d.email) || null : null, phone: d.phone?.normalized ? maskPhone(d.phone.normalized) || null : null, masked: true },
    revision: d.accountRev ?? 0,
    actions: actionPlan(row.status, caps),
    suspension: canSeeReason && d.suspension && row.status === "SUSPENDED" ? { at: d.suspension.at.toISOString(), reason: d.suspension.reason } : null,
    links: { inquiries: caps.inquiries ? `/admin/inquiries?buyer=${row.id}` : null },
  };
}

// ---------------------------------------------------------------- status change
export type OpResult = { ok: true; replay: boolean; message: string } | { ok: false; status: 404 | 409 | 422; message: string; fields?: Record<string, string> };
const fail = (status: 404 | 409 | 422, message: string, fields?: Record<string, string>): Extract<OpResult, { ok: false }> => ({ ok: false, status, message, ...(fields ? { fields } : {}) });
export interface StatusInput { reason: unknown; expectedRev: unknown; idempotencyKey: unknown }
const ACTION_AUDIT = { suspend: "BUYER_ACCOUNT_SUSPENDED", reactivate: "BUYER_ACCOUNT_REACTIVATED" } as const;

/**
 * Suspend or reactivate ONE buyer account. Re-validates everything on the server: the reason, the expected revision, the request key, the buyer role and the current state. A retry with the
 * same key and request answers the original result (no second audit row); the same key with another request is 409; a stale revision or a state that no longer allows the change is 409.
 * If the audit row cannot be written the transaction aborts and the account is unchanged.
 */
export async function changeBuyerStatus(action: BuyerAction, adminId: ObjectId, reference: string, input: StatusInput): Promise<OpResult> {
  const reason = cleanReason(input.reason);
  const fields: Record<string, string> = {};
  const reasonError = validateReason(reason);
  if (reasonError) fields.reason = reasonError;
  const rev = input.expectedRev;
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 0) fields.expectedRev = "Reload the buyer and try again.";
  const key = typeof input.idempotencyKey === "string" && KEY_RE.test(input.idempotencyKey) ? input.idempotencyKey : "";
  if (!key) fields.idempotencyKey = "A request key is required. Reload the page and try again.";
  if (!BUYER_ID_RE.test(reference)) return fail(404, "Buyer not found.");
  if (Object.keys(fields).length) return fail(422, "Please fix the highlighted fields.", fields);

  const operationKey = `${adminId.toHexString()}:${ACTION_AUDIT[action]}:${key}`;
  const bodyHash = createHash("sha256").update(JSON.stringify([reference, action, reason, rev])).digest("hex");
  const audit = await adminAuditLog();
  const replay = async (): Promise<OpResult | null> => {
    const prev = await audit.findOne({ operationKey }, { projection: { bodyHash: 1 } });
    if (!prev) return null;
    return prev.bodyHash === bodyHash ? { ok: true, replay: true, message: "This request was already applied." } : fail(409, "This request key was already used for a different request. Reload and try again.");
  };
  const again = await replay();
  if (again) return again;

  const c = await users();
  const _id = new ObjectId(reference);
  const session: ClientSession = (await getMongoClient()).startSession();
  let out: OpResult | undefined;
  try {
    await session.withTransaction(
      async () => {
        out = undefined;
        const cur = await c.findOne({ _id, role: "buyer" }, { session });
        if (!cur) { out = fail(404, "Buyer not found."); return; }
        const status = stateOf(cur);
        const plan = actionPlan(status, { suspend: true, reactivate: true })[action];
        if (!plan.available) { out = fail(409, plan.reason ?? "The account is not in a state that allows this change. Reload to see its current status."); return; }
        if ((cur.accountRev ?? 0) !== rev) { out = fail(409, "The account changed after you opened it. Reload and review its current status."); return; }
        const now = new Date();
        const next: AccountState = action === "suspend" ? "SUSPENDED" : "ACTIVE";
        const revNew = (cur.accountRev ?? 0) + 1;
        const cond = { _id, role: "buyer", accountStatus: status === "ACTIVE" ? { $in: ["ACTIVE", null] } : status, ...((cur.accountRev ?? 0) === 0 ? { $or: [{ accountRev: 0 }, { accountRev: { $exists: false } }] } : { accountRev: cur.accountRev }) };
        const update: Document = action === "suspend"
          ? { $set: { accountStatus: next, accountRev: revNew, updatedAt: now, suspension: { at: now, by: adminId, reason, revision: revNew } }, $inc: { sessionVersion: 1 } }
          : { $set: { accountStatus: next, accountRev: revNew, updatedAt: now }, $unset: { suspension: "" } };
        const upd = await c.updateOne(cond as never, update, { session });
        if (upd.matchedCount !== 1) { out = fail(409, "The account changed while you were saving. Reload and try again."); return; }
        await audit.insertOne({ _id: new ObjectId(), action: ACTION_AUDIT[action], actorId: adminId, buyerId: _id, reason, operationKey, bodyHash, before: { status, revision: cur.accountRev ?? 0 }, after: { status: next, revision: revNew }, summary: `${STATUS_LABEL[status]} to ${STATUS_LABEL[next]}`, at: now }, { session });
        out = { ok: true, replay: false, message: action === "suspend" ? "The buyer account was suspended. Their records are kept and every session was ended." : "The buyer account was reactivated. They must sign in again." };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } catch (e) {
    // the unique operation key refused a second insert: a concurrent identical request committed first
    if ((e as { code?: number }).code === 11000) {
      const r = await replay();
      if (r) return r;
    }
    throw e;
  } finally {
    await session.endSession();
  }
  return out ?? fail(409, "Nothing was changed.");
}
