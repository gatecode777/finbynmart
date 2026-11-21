import { createHash } from "node:crypto";
import { ObjectId, type Collection, type Document } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { approvedCountsByNode, isCategoryActive } from "@/lib/catalog/approvedStore";
import { invalidateApproved } from "@/lib/catalog/approvedProducts";
import { getCategoryDirectory } from "@/lib/catalog/categories";
import { adminAuditLog } from "./auditLog";
import { DEACTIVATE_EFFECTS, KEY_RE, MAX_PAGE, MAX_PAGE_SIZE, PAGE_SIZE, REACTIVATE_EFFECTS, activationPlan, cleanReason, idOfRef, levelOf, refOf, validateReason, type ActionState, type Level, type ListState } from "./categoryRules";

/**
 * Admin Category Management service. The taxonomy is code-defined (see categoryRules.ts); the only stored state is the activation OVERLAY `category_overrides` (`_id` = main category id,
 * `isActive`, `rev`, internal `reason`), written ONLY by `setActivation` below and read by the central directory, so the administrator's view and every public consumer share one model.
 * Scope = capability (the admin model has no organisation, category or region scope). The taxonomy is small (a few hundred nodes), so it is read from the cached directory and filtered in
 * memory with bounded pages; nothing is fetched per node, and product counts come from the directory's single pass (no per-node queries).
 */
export interface Caps { activation: boolean; audit: boolean }
export interface CategoryRow {
  id: string;
  ref: string;
  name: string;
  level: Level;
  parentId: string | null;
  parentName: string | null;
  source: "curated" | "catalog";
  /** The administrator's own switch (main categories only; below them the value of the main category). */
  ownActive: boolean;
  /** The effective activation: a node follows its main category. */
  effectiveActive: boolean;
  /** Effective activation AND eligible public products (or an eligible child): what the public site shows. */
  discoverable: boolean;
  /** Eligible products WITHOUT the activation gate (an inactive category can show products and stay hidden). */
  eligibleProducts: number;
  /** Which products the count covers: a main category counts its whole branch, a department its own, a product category its own. */
  countScope: "This category and everything below it" | "This level only";
  childCount: number;
  revision: number;
  actions: { activation: ActionState };
}
export interface CategoryList {
  items: CategoryRow[];
  /** Counts of categories (nodes of the directory), by effective status. */
  summary: { total: number; active: number; inactive: number; main: number };
  meta: { page: number; limit: number; total: number; totalPages: number };
}

let ready: Promise<unknown> | undefined;
async function overrides(): Promise<Collection<{ _id: string; isActive: boolean; rev: number; reason: string; updatedAt: Date; updatedBy: ObjectId }>> {
  const c = (await getDb()).collection<{ _id: string; isActive: boolean; rev: number; reason: string; updatedAt: Date; updatedBy: ObjectId }>("category_overrides");
  ready ??= Promise.all([
    (await categoryEvents()).createIndex({ dedupeKey: 1 }, { unique: true, name: "category_event_dedupe" }),
    (await categoryEvents()).createIndex({ "refresh.state": 1, createdAt: 1 }, { name: "category_event_pending" }),
    (await adminAuditLog()).createIndex({ categoryId: 1, at: -1, _id: -1 }, { name: "audit_category_newest", partialFilterExpression: { categoryId: { $exists: true } } }),
  ]).catch((e) => { ready = undefined; throw e; });
  await ready;
  return c;
}
interface EventDoc { _id: ObjectId; dedupeKey: string; categoryId: string; action: "DEACTIVATE" | "REACTIVATE"; refresh: { state: "PENDING" | "DONE"; attempts: number }; createdAt: Date }
async function categoryEvents(): Promise<Collection<EventDoc>> { return (await getDb()).collection<EventDoc>("category_events"); }


type Node = ReturnType<typeof getCategoryDirectory>["management"][number];
/** Every node of the code-defined taxonomy with its effective state. `revs` holds the overlay revisions (absent = 0). */
function rowOf(n: Node, byId: Map<string, Node>, discoverable: Set<string>, revs: Map<string, number>, caps: Caps): CategoryRow {
  const level = levelOf(n.id);
  const main = n.id.split("/")[0];
  const parent = n.parentId ? byId.get(n.parentId) : undefined;
  return {
    id: n.id,
    ref: refOf(n.id),
    name: n.name,
    level,
    parentId: n.parentId,
    parentName: parent?.name ?? null,
    source: n.source === "catalog" ? "catalog" : "curated",
    ownActive: isCategoryActive(main),
    effectiveActive: n.isActive,
    discoverable: discoverable.has(n.id),
    eligibleProducts: n.productCount,
    countScope: level === "MAIN" ? "This category and everything below it" : "This level only",
    childCount: n.childIds.length,
    revision: revs.get(main) ?? 0,
    actions: { activation: activationPlan(level, isCategoryActive(main), caps.activation) },
  };
}

async function revisions(): Promise<Map<string, number>> {
  const docs = await (await overrides()).find({}, { projection: { rev: 1 } }).limit(500).toArray();
  return new Map(docs.map((d) => [d._id, d.rev]));
}

export async function listCategories(s: ListState, caps: Caps, limit = PAGE_SIZE): Promise<CategoryList> {
  const dir = getCategoryDirectory();
  const byId = new Map(dir.management.map((n) => [n.id, n]));
  const discoverable = new Set(dir.nodes.map((n) => n.id));
  const revs = await revisions();
  const q = s.q.trim().toLowerCase();
  const all = dir.management;
  const matched = all.filter((n) => {
    if (s.level !== "all" && levelOf(n.id) !== s.level) return false;
    if (s.status === "active" && !n.isActive) return false;
    if (s.status === "inactive" && n.isActive) return false;
    if (s.parent && n.parentId !== idOfRef(s.parent)) return false;
    if (q && !n.name.toLowerCase().startsWith(q) && !n.slug.toLowerCase().startsWith(q) && !n.id.toLowerCase().startsWith(q)) return false;
    return true;
  });
  const page = Math.max(1, Math.min(MAX_PAGE, s.page));
  const lim = Math.min(MAX_PAGE_SIZE, Math.max(1, limit));
  const slice = matched.slice((page - 1) * lim, page * lim);
  return {
    items: slice.map((n) => rowOf(n, byId, discoverable, revs, caps)),
    summary: { total: all.length, active: all.filter((n) => n.isActive).length, inactive: all.filter((n) => !n.isActive).length, main: all.filter((n) => n.parentId === null).length },
    meta: { page, limit: lim, total: matched.length, totalPages: Math.max(1, Math.ceil(matched.length / lim)) },
  };
}

export interface CategoryDetail extends CategoryRow {
  description: string;
  path: { id: string; name: string }[];
  children: { id: string; ref: string; name: string; eligibleProducts: number }[];
  impact: { eligibleProducts: number; supplierProducts: number; catalogueProducts: number; descendants: number; effects: readonly string[] };
  internalReason: string | null;
  unsupported: string[];
}

export async function getCategory(ref: string, caps: Caps): Promise<CategoryDetail | null> {
  const id = idOfRef(ref);
  if (!id) return null;
  const dir = getCategoryDirectory();
  const byId = new Map(dir.management.map((n) => [n.id, n]));
  const n = byId.get(id);
  if (!n) return null;
  const revs = await revisions();
  const row = rowOf(n, byId, new Set(dir.nodes.map((x) => x.id)), revs, caps);
  const main = id.split("/")[0];
  const doc = caps.audit ? await (await overrides()).findOne({ _id: main }, { projection: { reason: 1, isActive: 1 } }) : null;
  const path: { id: string; name: string }[] = [];
  for (let cur: Node | undefined = n; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) path.unshift({ id: cur.id, name: cur.name });
  const descendants = dir.management.filter((x) => x.id.startsWith(`${id}/`)).length;
  const supplierProducts = approvedCountsByNode().get(id) ?? 0;
  return {
    ...row,
    description: n.description,
    path,
    children: n.childIds.slice(0, 50).map((c) => byId.get(c)).filter((c): c is Node => !!c).map((c) => ({ id: c.id, ref: refOf(c.id), name: c.name, eligibleProducts: c.productCount })),
    impact: { eligibleProducts: n.productCount, supplierProducts, catalogueProducts: Math.max(0, n.productCount - supplierProducts), descendants, effects: n.isActive ? DEACTIVATE_EFFECTS : REACTIVATE_EFFECTS },
    internalReason: doc && doc.isActive === false ? doc.reason : null,
    unsupported: ["Create category", "Edit name or description", "Change parent", "Change slug", "Activation below a main category"],
  };
}

// ---------------------------------------------------------------- activity
export interface ActivityItem { label: string; actor: string; at: string; reason: string | null; detail: string | null }
const CURSOR_RE = /^\d{10,15}\.[a-f0-9]{24}$/;
export async function getActivity(ref: string, cursor: string | null, limit = 20): Promise<{ items: ActivityItem[]; nextCursor: string | null } | null> {
  const id = idOfRef(ref);
  if (!id || !getCategoryDirectory().management.some((n) => n.id === id)) return null;
  await overrides();
  const lim = Math.min(50, Math.max(1, limit));
  const filter: Document = { categoryId: id.split("/")[0] };
  if (cursor && CURSOR_RE.test(cursor)) {
    const [ms, oid] = cursor.split(".");
    const at = new Date(Number(ms));
    filter.$or = [{ at: { $lt: at } }, { at, _id: { $lt: new ObjectId(oid) } }];
  }
  const rows = await (await adminAuditLog()).find(filter, { projection: { action: 1, actorId: 1, at: 1, reason: 1, summary: 1 } }).sort({ at: -1, _id: -1 }).limit(lim + 1).toArray();
  const page = rows.slice(0, lim);
  const actors = await (await getDb()).collection<{ _id: ObjectId; name?: string }>("users").find({ _id: { $in: page.flatMap((r) => (r.actorId instanceof ObjectId ? [r.actorId] : [])) } }, { projection: { name: 1 } }).toArray();
  const an = new Map(actors.map((a) => [a._id.toHexString(), a.name || "Administrator"]));
  const last = page[page.length - 1];
  const LABEL: Record<string, string> = { CATEGORY_DEACTIVATED: "Category deactivated", CATEGORY_REACTIVATED: "Category reactivated" };
  return {
    items: page.map((r) => ({ label: LABEL[String(r.action)] ?? String(r.action), actor: r.actorId instanceof ObjectId ? an.get(r.actorId.toHexString()) ?? "Administrator" : "Administrator", at: (r.at as Date).toISOString(), reason: typeof r.reason === "string" ? r.reason : null, detail: typeof r.summary === "string" ? r.summary : null })),
    nextCursor: rows.length > lim && last ? `${(last.at as Date).getTime()}.${(last._id as ObjectId).toHexString()}` : null,
  };
}

// ---------------------------------------------------------------- activation (the only mutation)
export type OpResult = { ok: true; replay: boolean; message: string } | { ok: false; status: 404 | 409 | 422; message: string; fields?: Record<string, string> };
const fail = (status: 404 | 409 | 422, message: string, fields?: Record<string, string>): Extract<OpResult, { ok: false }> => ({ ok: false, status, message, ...(fields ? { fields } : {}) });
export interface ActivationInput { isActive: unknown; reason: unknown; expectedRev: unknown; idempotencyKey: unknown }

/**
 * Activate or deactivate ONE main category (the overlay). One snapshot transaction: the conditional write of the overlay document (insert at revision 1, or update conditional on the revision the
 * administrator saw), the audit row (unique operation key + request hash) and the recovery event commit together or not at all; a duplicate first insert (two administrators at once) is a 409.
 * It writes ONLY the main category's own flag: no child flag is overwritten (there is none), no product, inquiry, quotation or snapshot is touched, and reactivating never re-enables anything else.
 * After the commit the public snapshot and directory refresh (`invalidateApproved` also reloads the overlay); a failed refresh leaves the event for the worker sweep. Other server
 * instances converge within the snapshot TTL (60 s); new publications, inquiries and lead commits re-read the overlay from the database, so they never wait for that.
 */
export async function setActivation(adminId: ObjectId, ref: string, input: ActivationInput): Promise<OpResult> {
  const id = idOfRef(ref);
  if (!id) return fail(404, "Category not found.");
  const fields: Record<string, string> = {};
  if (typeof input.isActive !== "boolean") fields.isActive = "Choose active or inactive.";
  const reason = cleanReason(input.reason);
  const reasonError = validateReason(reason);
  if (reasonError) fields.reason = reasonError;
  const rev = input.expectedRev;
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 0) fields.expectedRev = "Reload the category and try again.";
  const key = typeof input.idempotencyKey === "string" && KEY_RE.test(input.idempotencyKey) ? input.idempotencyKey : "";
  if (!key) fields.idempotencyKey = "A request key is required. Reload the page and try again.";
  const node = getCategoryDirectory().management.find((n) => n.id === id);
  if (!node) return fail(404, "Category not found.");
  if (levelOf(id) !== "MAIN") return fail(409, activationPlan("DEPARTMENT", true, true).reason ?? "Not supported.");
  if (Object.keys(fields).length) return fail(422, "Please fix the highlighted fields.", fields);

  const want = input.isActive as boolean;
  const action = want ? "CATEGORY_REACTIVATED" : "CATEGORY_DEACTIVATED";
  const operationKey = `${adminId.toHexString()}:${action}:${key}`;
  const bodyHash = createHash("sha256").update(JSON.stringify([id, want, reason, rev])).digest("hex");
  const audit = await adminAuditLog();
  const replay = async (): Promise<OpResult | null> => {
    const prev = await audit.findOne({ operationKey }, { projection: { bodyHash: 1 } });
    if (!prev) return null;
    return prev.bodyHash === bodyHash ? { ok: true, replay: true, message: "This change was already applied." } : fail(409, "This request key was already used for a different request. Reload and try again.");
  };
  const again = await replay();
  if (again) return again;

  const c = await overrides();
  const events = await categoryEvents();
  const session = (await getMongoClient()).startSession();
  let out: OpResult | undefined;
  let eventId: ObjectId | undefined;
  try {
    await session.withTransaction(
      async () => {
        out = undefined;
        eventId = undefined;
        const cur = await c.findOne({ _id: id }, { session });
        const curRev = cur?.rev ?? 0;
        const curActive = cur ? cur.isActive : true;
        if (curRev !== rev) { out = fail(409, "The category changed after you opened it. Reload and review its current state."); return; }
        if (curActive === want) { out = fail(409, want ? "The category is already active." : "The category is already inactive."); return; }
        const now = new Date();
        if (cur) {
          const u = await c.updateOne({ _id: id, rev: curRev }, { $set: { isActive: want, reason, updatedAt: now, updatedBy: adminId }, $inc: { rev: 1 } }, { session });
          if (u.matchedCount !== 1) { out = fail(409, "The category changed while you were saving. Reload and try again."); return; }
        } else {
          await c.insertOne({ _id: id, isActive: want, rev: 1, reason, updatedAt: now, updatedBy: adminId }, { session });
        }
        await audit.insertOne({ _id: new ObjectId(), action, actorId: adminId, categoryId: id, reason, operationKey, bodyHash, before: { isActive: curActive, rev: curRev }, after: { isActive: want, rev: curRev + 1 }, summary: `${node.name}: ${curActive ? "Active" : "Inactive"} → ${want ? "Active" : "Inactive"}`, at: now }, { session });
        eventId = new ObjectId();
        await events.insertOne({ _id: eventId, dedupeKey: `category:${id}:${curRev + 1}`, categoryId: id, action: want ? "REACTIVATE" : "DEACTIVATE", refresh: { state: "PENDING", attempts: 0 }, createdAt: now }, { session });
        out = { ok: true, replay: false, message: want ? "The category was reactivated. It is shown wherever eligible public products exist." : "The category was deactivated. Its records are kept and it is hidden from public discovery." };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      const r = await replay();
      if (r) return r;
      return fail(409, "The category was changed by someone else at the same moment. Reload and try again.");
    }
    throw e;
  } finally {
    await session.endSession();
  }
  const result = out ?? fail(409, "Nothing was changed.");
  if (result.ok && eventId) await processEvent(eventId).catch(() => undefined);
  return result;
}

/** After the commit: refresh the overlay, the public snapshot and the directory in this process. A failure leaves the event pending for the worker sweep (never repeats the change). */
export async function processEvent(id: ObjectId): Promise<void> {
  const events = await categoryEvents();
  const ev = await events.findOne({ _id: id });
  if (!ev || ev.refresh.state === "DONE") return;
  const ok = await invalidateApproved().then(() => true, () => false);
  await events.updateOne({ _id: id }, ok ? { $set: { "refresh.state": "DONE" }, $inc: { "refresh.attempts": 1 } } : { $inc: { "refresh.attempts": 1 } });
}
export async function sweepCategoryEvents(limit = 25): Promise<number> {
  const events = await categoryEvents();
  const pending = await events.find({ "refresh.state": "PENDING" }, { projection: { _id: 1 } }).sort({ createdAt: 1 }).limit(limit).toArray();
  for (const e of pending) await processEvent(e._id).catch(() => undefined);
  return pending.length;
}
