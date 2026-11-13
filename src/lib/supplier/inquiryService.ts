import { createHash } from "node:crypto";
import { advanceStatus, findInquiryFor } from "@/lib/leads/access";
import { ObjectId } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { formatSubmitted } from "@/lib/inquiries/confirmation";
import { INQUIRY_TYPES, normaliseStatus } from "@/lib/inquiries/rules";
import { type InquiryDoc } from "@/lib/inquiries/service";
import { listMessages, messagesCollection, toMessageDto, type InquiryMessageDoc, type MessageDto, type MessagePage } from "@/lib/inquiries/messages";
import { quotationsCollection } from "@/lib/quotations/service";
import type { PublicUser } from "@/lib/auth/users";
import type { SupplierContext } from "./company";
import { supplierInquiryStatus } from "./dashboardRules";
import { ACTIVITY_LIMIT, MESSAGE_TYPE_LABEL, replyEligibility, statusPlan, type Cursor, type ResponseInput } from "./inquiryRules";
import { deliverOutbox, noticeState, outboxCollection, type NoticeState } from "./outbox";
import { listQuotationsForInquiry, type SupplierQuotationRow } from "./quotationService";
import { buyerName, loadInquiry, type InquiryRow } from "./quoteService";

/**
 * The supplier's inquiry details and response workflow (Page 41), on the existing inquiry (`inquiries`) with ONE new bounded store (`inquiry_messages`).
 *
 * Access: an inquiry is reachable only when it is addressed to one of the signed-in company's own sellers (`supplierKey` in the session company's seller keys);
 * unknown, malformed and another seller's reference are the same "not found" (loadInquiry). The inquiry is addressed to exactly one seller, so a response
 * by one supplier can never touch another supplier's inquiry, messages or status. The buyer's requirement is shown as the buyer wrote it and is never edited.
 * Buyer privacy: business name only (no e-mail, phone, address, notes or other inquiries). A message never closes, accepts, orders or pays anything.
 */
type Failure = { ok: false; status: 403 | 404 | 409 | 422; code: string; message: string; fields?: Record<string, string>; data?: unknown };
const fail = (status: Failure["status"], code: string, message: string, extra: { fields?: Record<string, string>; data?: unknown } = {}): Failure => ({ ok: false, status, code, message, ...extra });
class Abort extends Error {
  readonly failure: Failure;
  constructor(failure: Failure) {
    super(failure.code);
    this.failure = failure;
  }
}
const keysOf = (c: SupplierContext) => c.company.sellerKeys;
const OPERATION = "inquiry.respond";

export interface InquiryDetail {
  reference: string;
  status: string;
  statusLabel: string;
  awaitingResponse: boolean;
  receivedAt: string;
  receivedLabel: string;
  typeLabel: string;
  requirement: {
    title: string;
    description: string | null;
    category: string | null;
    quantity: number;
    unit: string | null;
    deliveryLocation: string | null;
    specifications: { label: string; value: string }[];
    productUrl: string | null;
  };
  buyer: { name: string; kind: string };
  /** How this company received the inquiry; MATCHED views carry no selected-supplier identity, no product page link and no other recipient. */
  recipient: { type: "DIRECT" | "MATCHED"; badge: string };
  /** What the inquiry form does not capture: shown once, in words, instead of empty "Not provided" rows that suggest a missing answer. */
  notCaptured: string;
  attachments: { available: false; reason: string };
  capabilities: {
    respond: { available: boolean; reason: string | null };
    quotation: { kind: "create" | "continue" | "view" | "unavailable"; label: string; href: string | null; reason: string | null };
  };
}

const NOT_CAPTURED = "The inquiry form does not ask for a target price, a required-by date or attachments, so none are shown. The buyer's message is exactly as they wrote it.";

export async function getInquiryDetail(context: SupplierContext, reference: string): Promise<InquiryDetail | null> {
  const inquiry = await loadInquiry(context, reference);
  if (!inquiry) return null;
  const keys = keysOf(context);
  const quotes = await quotationsCollection();
  const [name, open] = await Promise.all([buyerName(inquiry.buyerId), // the open quotation of this inquiry: the one holding the open-quotation lock, or (an older record made before the lock existed) a current one that is still open
    quotes.findOne({ inquiryId: inquiry._id, supplierKey: { $in: keys }, $or: [{ openKey: { $exists: true } }, { isCurrent: true, status: { $in: ["DRAFT", "SENT", "REVISION_REQUESTED", "ACCEPTED"] } }] }, { projection: { reference: 1, status: 1 }, sort: { version: -1 } })]);
  const s = supplierInquiryStatus(inquiry.status);
  const eligibility = replyEligibility(inquiry.status, Boolean(inquiry.buyerId));
  const product = inquiry.productKey ? getPublicProductByKey(inquiry.productKey) : undefined;
  const type = inquiry.inquiryType ?? (inquiry.type === "inquiry" ? (inquiry.productKey ? "PRODUCT_INQUIRY" : "GENERAL_INQUIRY") : "GET_BEST_QUOTE");

  const respondReason = !context.permissions.respondToInquiries ? "Your role cannot respond to inquiries." : !eligibility.ok ? eligibility.message : null;
  const canQuote = context.permissions.manageQuotations && eligibility.ok;
  const q = `/supplier/quotations/create?inquiryReference=${encodeURIComponent(inquiry.reference!)}`;
  const quotation: InquiryDetail["capabilities"]["quotation"] = open
    ? open.status === "DRAFT"
      ? { kind: "continue", label: "Continue Draft", href: `/supplier/quotations/create?reference=${open.reference}`, reason: null }
      : { kind: "view", label: "View Quotation", href: `/supplier/quotations/${open.reference}`, reason: null }
    : canQuote
      ? { kind: "create", label: "Create Quotation", href: q, reason: null }
      : { kind: "unavailable", label: "Create Quotation", href: null, reason: !context.permissions.manageQuotations ? "Your role cannot create quotations." : !eligibility.ok ? eligibility.message : null };

  return {
    reference: inquiry.reference!,
    status: s.status,
    statusLabel: s.label,
    awaitingResponse: s.pending,
    receivedAt: inquiry.createdAt.toISOString(),
    receivedLabel: formatSubmitted(inquiry.createdAt.toISOString()),
    typeLabel: INQUIRY_TYPES.find((t) => t.value === type)?.label ?? "Inquiry",
    requirement: {
      title: inquiry.productName ?? "General inquiry",
      description: inquiry.message ?? null,
      category: inquiry.categoryName ?? null,
      quantity: inquiry.quantity,
      unit: inquiry.unit ?? null,
      deliveryLocation: inquiry.deliveryLocation?.text ?? null,
      // the listing's own specifications for the product the buyer asked about, rendered generically (label / value) for any category
      specifications: (inquiry.recipientType === "MATCHED" ? (inquiry.productKey ? (getPublicProductByKey(inquiry.productKey)?.specifications ?? []) : []) : (product?.specifications ?? [])).slice(0, 30).map((sp) => ({ label: sp.label, value: sp.unit ? `${sp.value} ${sp.unit}` : sp.value })),
      productUrl: inquiry.recipientType === "MATCHED" ? null : (product?.url ?? null),
    },
    buyer: { name, kind: inquiry.buyerId ? "Registered buyer" : "Guest" },
    recipient: inquiry.recipientType === "MATCHED" ? { type: "MATCHED", badge: "Matches products your company supplies." } : { type: "DIRECT", badge: "Buyer selected your company." },
    notCaptured: NOT_CAPTURED,
    attachments: { available: false, reason: "Buyers cannot attach files to an inquiry yet, so there are no buyer attachments to open." },
    capabilities: { respond: { available: respondReason === null, reason: respondReason }, quotation },
  };
}

// ---------- the conversation ----------
export async function getResponses(context: SupplierContext, reference: string, opts: { limit: number; cursor: Cursor | null }): Promise<MessagePage | null> {
  const inquiry = await loadInquiry(context, reference);
  if (!inquiry) return null;
  return listMessages(inquiry._id, { supplierKeys: keysOf(context) }, opts);
}

export async function getRelatedQuotations(context: SupplierContext, reference: string): Promise<SupplierQuotationRow[] | null> {
  const inquiry = await loadInquiry(context, reference);
  return inquiry ? listQuotationsForInquiry(context, inquiry._id) : null;
}

// ---------- activity: real records only, bounded ----------
export interface ActivityItem {
  key: string;
  at: string;
  atLabel: string;
  title: string;
  detail: string | null;
}

export async function getActivity(context: SupplierContext, reference: string): Promise<{ items: ActivityItem[]; truncated: boolean } | null> {
  const inquiry = await loadInquiry(context, reference);
  if (!inquiry) return null;
  const keys = keysOf(context);
  const [messages, quotes] = await Promise.all([
    (await messagesCollection()).find({ inquiryId: inquiry._id, supplierKey: { $in: keys } }, { projection: { type: 1, authorName: 1, createdAt: 1 } }).sort({ createdAt: -1, _id: -1 }).limit(ACTIVITY_LIMIT).toArray(),
    (await quotationsCollection()).find({ inquiryId: inquiry._id, supplierKey: { $in: keys } }, { projection: { reference: 1, version: 1, status: 1, events: 1, createdAt: 1 } }).limit(30).toArray(),
  ]);
  const all: { at: Date; key: string; title: string; detail: string | null }[] = [];
  all.push({ at: inquiry.createdAt, key: "received", title: "Inquiry received", detail: null });
  for (const h of inquiry.statusHistory ?? []) {
    if (h.from === null) continue; // the creation entry is the "received" event above
    all.push({ at: h.at, key: `status-${h.at.getTime()}-${h.to}`, title: `Inquiry status: ${supplierInquiryStatus(h.to).label}`, detail: h.actor === "buyer" ? "Changed by the buyer" : h.actor === "system" ? "Recorded by the platform" : null });
  }
  for (const m of messages) all.push({ at: m.createdAt, key: `msg-${m._id}`, title: m.type === "RESPONSE" ? "Response sent to the buyer" : m.type === "BUYER_REPLY" ? "Buyer replied" : "Clarification requested from the buyer", detail: m.type === "BUYER_REPLY" ? null : `By ${m.authorName}` });
  for (const q of quotes) {
    if (q.status === "DRAFT") all.push({ at: q.createdAt, key: `draft-${q.reference}`, title: `Quotation draft ${q.reference} started`, detail: null });
    for (const e of q.events ?? []) {
      const title = e.type === "SENT" ? `Quotation ${q.reference} submitted` : e.type === "WITHDRAWN" ? `Quotation ${q.reference} withdrawn` : e.type === "ACCEPTED" ? `Quotation ${q.reference} accepted by the buyer` : e.type === "REJECTED" ? `Quotation ${q.reference} rejected by the buyer` : e.type === "REVISION_REQUESTED" ? `Buyer requested a revision of ${q.reference}` : null;
      if (title) all.push({ at: e.at, key: `q-${q.reference}-${q.version}-${e.type}-${e.at.getTime()}`, title, detail: e.type === "SENT" ? `Version ${q.version}` : null });
    }
  }
  all.sort((a, b) => b.at.getTime() - a.at.getTime());
  const items = all.slice(0, ACTIVITY_LIMIT).map((a) => ({ key: a.key, at: a.at.toISOString(), atLabel: formatSubmitted(a.at.toISOString()), title: a.title, detail: a.detail }));
  return { items, truncated: all.length > ACTIVITY_LIMIT };
}

// ---------- send a response / ask for clarification ----------
export interface SendResult {
  message: MessageDto;
  inquiry: { status: string; statusLabel: string };
  replayed: boolean;
  buyerNotice: NoticeState;
}
export type SendOutcome = ({ ok: true } & SendResult) | Failure;

const hashOf = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

export async function sendResponse(context: SupplierContext, user: PublicUser, reference: string, input: ResponseInput, now = new Date()): Promise<SendOutcome> {
  if (!context.permissions.respondToInquiries) return fail(403, "FORBIDDEN", "Your role cannot respond to inquiries.");
  const first = await loadInquiry(context, reference);
  if (!first) return fail(404, "NOT_FOUND", "Inquiry not found.");
  const requestHash = hashOf({ reference: first.reference, type: input.type, message: input.message });
  const db = await getDb();
  const idem = db.collection("idempotency_keys");
  const scope = { companyId: context.companyId, userId: new ObjectId(user.id), operation: OPERATION, key: input.idempotencyKey };
  const outbox = await outboxCollection();
  await idem.createIndex({ companyId: 1, userId: 1, operation: 1, key: 1 }, { unique: true, name: "idempotency_scope_key" }).catch(() => undefined);

  const replay = async (): Promise<SendOutcome | null> => {
    const prior = await idem.findOne(scope);
    if (!prior) return null;
    if (prior.requestHash !== requestHash) return fail(409, "IDEMPOTENCY_CONFLICT", "This key was already used for a different message. Write the message again and send it.");
    const r = prior.response as { message: MessageDto; inquiry: { status: string; statusLabel: string } };
    return { ok: true, message: r.message, inquiry: r.inquiry, replayed: true, buyerNotice: await noticeState(`inquiry-message:${r.message.id}`) };
  };
  const early = await replay();
  if (early) return early;

  const client = await getMongoClient();
  const session = client.startSession();
  let committed: { message: MessageDto; inquiry: { status: string; statusLabel: string }; outboxId: ObjectId } | undefined;
  try {
    await session.withTransaction(
      async () => {
        committed = undefined;
        const inquiry = (await findInquiryFor(context, { _id: first._id }, session)) as InquiryRow | null;
        if (!inquiry) throw new Abort(fail(404, "NOT_FOUND", "Inquiry not found."));
        const el = replyEligibility(inquiry.status, Boolean(inquiry.buyerId));
        if (!el.ok) throw new Abort(fail(409, el.code, el.message));
        const doc: InquiryMessageDoc = {
          _id: new ObjectId(),
          inquiryId: inquiry._id,
          inquiryReference: inquiry.reference!,
          supplierKey: inquiry.supplierKey,
          supplierCompanyId: context.companyId,
          buyerId: inquiry.buyerId!,
          type: input.type,
          body: input.message,
          authorUserId: new ObjectId(user.id),
          authorName: context.profile.displayName,
          createdAt: now,
        };
        await (await messagesCollection()).insertOne(doc, { session });
        // the inquiry's own lifecycle steps (each one the lifecycle allows); a message never closes, accepts, orders or pays
        const steps = statusPlan(inquiry.status, input.type);
        let current = normaliseStatus(inquiry.status);
        if (steps.length > 0) {
          const history = steps.map((to) => {
            const entry = { from: current, to, actor: "system" as const, at: now, reason: input.type === "RESPONSE" ? "Supplier responded" : "Supplier asked for clarification" };
            current = to;
            return entry;
          });
          if (!(await advanceStatus(inquiry, context, inquiry.status, current, history, now, session))) throw new Abort(fail(409, "CONFLICT", "The inquiry changed while you were writing. Reload it and try again."));
        }
        const message = toMessageDto(doc);
        const inquiryOut = { status: current, statusLabel: supplierInquiryStatus(current).label };
        const outboxId = new ObjectId();
        await outbox.insertOne({ _id: outboxId, type: input.type === "RESPONSE" ? "INQUIRY_RESPONSE" : "INQUIRY_CLARIFICATION", supplierCompanyId: context.companyId, buyerId: inquiry.buyerId!, dedupeKey: `inquiry-message:${doc._id}`, status: "PENDING", attempts: 0, createdAt: now, supplierName: context.profile.displayName, inquiryReference: inquiry.reference! }, { session });
        await idem.insertOne({ ...scope, requestHash, response: { message, inquiry: inquiryOut }, createdAt: now }, { session });
        committed = { message, inquiry: inquiryOut, outboxId };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } catch (error) {
    if (error instanceof Abort) {
      const again = await replay();
      return again ?? error.failure;
    }
    if ((error as { code?: number }).code === 11000) {
      const again = await replay();
      if (again) return again;
    }
    console.error("inquiry response failed", (error as Error).message);
    throw error;
  } finally {
    await session.endSession();
  }
  if (!committed) return fail(409, "CONFLICT", "The message could not be sent. Please try again.");
  await (await getDb()).collection("security_events").insertOne({ userId: new ObjectId(user.id), type: input.type === "RESPONSE" ? "supplier_inquiry_response_sent" : "supplier_inquiry_clarification_sent", at: new Date(), reference: first.reference, companyId: context.companyId, messageId: committed.message.id }).catch(() => undefined);
  await deliverOutbox(committed.outboxId);
  return { ok: true, message: committed.message, inquiry: committed.inquiry, replayed: false, buyerNotice: await noticeState(`inquiry-message:${committed.message.id}`) };
}

export { MESSAGE_TYPE_LABEL };
export type { InquiryDoc };
