import { createHash, createHmac } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { findCompanyBySupplierKey } from "@/lib/supplier/company";
import { cleanMessage, decodeCursor, encodeCursor, MESSAGE_MAX, MESSAGE_MIN } from "@/lib/supplier/inquiryRules";
import { isSupplierCategoryEnabled } from "@/lib/supplier/settingsService";
import { notifySupplier } from "@/lib/supplier/notifications";
import { quotationsCollection } from "@/lib/quotations/service";
import { STATUS_LABEL, effectiveStatus } from "@/lib/quotations/quotationRules";
import { findInquiryByReference } from "./service";
import { formatSubmitted } from "./confirmation";
import { listMessages, messagesCollection, toMessageDto, type InquiryMessageDoc, type MessageDto, type MessagePage } from "./messages";
import { isIdempotencyKey, REFERENCE_PATTERN } from "./rules";

/**
 * The BUYER side of the supplier conversations of one requirement (inquiry). One model: `inquiry_messages`. A conversation is
 * (inquiry, supplier recipient): every row carries the recipient's own `supplierKey`, so Supplier A's thread can never contain Supplier B's rows and a
 * buyer reply goes ONLY to the conversation it was written in. Buyer ownership is checked on every call (inquiry.buyerId = the session's account); a
 * supplier is addressed by an opaque server-made token (HMAC of inquiry + supplier key), never by a key, company id or recipient list from the browser.
 * Only suppliers that really replied or quoted are listed: a matched company that merely received access is never named. No read receipts, no live chat.
 */
const CLOSED = ["CANCELLED", "CLOSED", "REJECTED"];

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not configured");
  return s;
};
export const conversationToken = (inquiryId: ObjectId, supplierKey: string): string => createHmac("sha256", secret()).update(`${inquiryId.toHexString()}|${supplierKey}`).digest("base64url").slice(0, 24);

export interface ResponderDto {
  conversation: string;
  name: string;
  origin: "SELECTED" | "MATCHED";
  originLabel: string;
  replies: number;
  lastReply: { summary: string; at: string; atLabel: string } | null;
  lastActivityAt: string | null;
  lastActivityLabel: string | null;
  /** The buyer's current submitted offer from this supplier (never a draft; one per supplier). */
  offer: { reference: string; version: number; status: string; statusLabel: string; href: string } | null;
}

const summaryOf = (body: string) => {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 137)}...` : flat;
};

async function ownedInquiry(buyerId: string, reference: string) {
  if (!ObjectId.isValid(buyerId) || !REFERENCE_PATTERN.test(reference)) return null;
  const inquiry = await findInquiryByReference(reference);
  return inquiry && inquiry.buyerId?.toHexString() === buyerId ? inquiry : null;
}

/** Suppliers that replied or submitted an offer for this requirement, with their source label. Bounded by the number of such suppliers. */
export async function listResponders(buyerId: string, reference: string, now = new Date()): Promise<{ responders: ResponderDto[]; open: boolean } | null> {
  const inquiry = await ownedInquiry(buyerId, reference);
  if (!inquiry) return null;
  const owner = new ObjectId(buyerId);
  const messages = await messagesCollection();
  const [supplierRows, activityRows, offers] = await Promise.all([
    messages.aggregate<{ _id: string; name: string; replies: number; at: Date; body: string }>([
      { $match: { inquiryId: inquiry._id, buyerId: owner, sender: { $ne: "BUYER" } } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: "$supplierKey", name: { $first: "$authorName" }, replies: { $sum: 1 }, at: { $first: "$createdAt" }, body: { $first: "$body" } } },
      { $limit: 100 },
    ]).toArray(),
    messages.aggregate<{ _id: string; at: Date }>([{ $match: { inquiryId: inquiry._id, buyerId: owner } }, { $group: { _id: "$supplierKey", at: { $max: "$createdAt" } } }, { $limit: 100 }]).toArray(),
    (await quotationsCollection()).find({ inquiryId: inquiry._id, buyerId: owner, isCurrent: true, status: { $ne: "DRAFT" } }, { projection: { reference: 1, version: 1, status: 1, supplierKey: 1, supplierName: 1, validUntil: 1, sentAt: 1 } }).limit(100).toArray(),
  ]);
  const keys = new Set<string>([...supplierRows.map((r) => r._id), ...offers.map((o) => o.supplierKey)]);
  const reply = new Map(supplierRows.map((r) => [r._id, r]));
  const activity = new Map(activityRows.map((r) => [r._id, r.at]));
  const offer = new Map(offers.map((o) => [o.supplierKey, o]));
  const responders: ResponderDto[] = [...keys].map((key) => {
    const r = reply.get(key);
    const o = offer.get(key);
    const selected = key === inquiry.supplierKey;
    const last = [activity.get(key), o?.sentAt].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const status = o ? effectiveStatus(o.status, o.validUntil, now) : null;
    return {
      conversation: conversationToken(inquiry._id!, key),
      name: selected ? inquiry.supplierName : (r?.name ?? o?.supplierName ?? "Supplier"),
      origin: selected ? "SELECTED" : "MATCHED",
      originLabel: selected ? "Selected supplier" : "Additional matching supplier",
      replies: r?.replies ?? 0,
      lastReply: r ? { summary: summaryOf(r.body), at: r.at.toISOString(), atLabel: formatSubmitted(r.at.toISOString()) } : null,
      lastActivityAt: last?.toISOString() ?? null,
      lastActivityLabel: last ? formatSubmitted(last.toISOString()) : null,
      offer: o && status ? { reference: o.reference, version: o.version, status, statusLabel: STATUS_LABEL[status], href: `/buyer/quotations/${o.reference}` } : null,
    };
  });
  // the selected supplier first, then by latest activity
  responders.sort((a, b) => (a.origin === b.origin ? (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") : a.origin === "SELECTED" ? -1 : 1));
  return { responders, open: !CLOSED.includes(inquiry.status) };
}

async function resolveConversation(buyerId: string, reference: string, token: string) {
  const inquiry = await ownedInquiry(buyerId, reference);
  if (!inquiry || !/^[A-Za-z0-9_-]{24}$/.test(token)) return null;
  const owner = new ObjectId(buyerId);
  const fromMessages = await (await messagesCollection()).distinct("supplierKey", { inquiryId: inquiry._id, buyerId: owner, sender: { $ne: "BUYER" } });
  const fromQuotes = await (await quotationsCollection()).distinct("supplierKey", { inquiryId: inquiry._id, buyerId: owner, status: { $ne: "DRAFT" } });
  const supplierKey = [...new Set([...fromMessages, ...fromQuotes])].find((k) => conversationToken(inquiry._id!, k) === token);
  return supplierKey ? { inquiry, supplierKey, owner } : null;
}

/** One page (newest first) of ONE supplier conversation. Null = not this buyer's requirement or not a supplier that replied (identical 404). */
export async function getConversation(buyerId: string, reference: string, token: string, opts: { limit: number; cursor: string | null }): Promise<MessagePage | null> {
  const c = await resolveConversation(buyerId, reference, token);
  if (!c) return null;
  const col = await messagesCollection();
  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;
  const filter: Record<string, unknown> = { inquiryId: c.inquiry._id, buyerId: c.owner, supplierKey: c.supplierKey };
  if (cursor) {
    const at = new Date(cursor.t);
    filter.$or = [{ createdAt: { $lt: at } }, { createdAt: at, _id: { $lt: new ObjectId(cursor.id) } }];
  }
  const docs = await col.find(filter as never).sort({ createdAt: -1, _id: -1 }).limit(opts.limit + 1).toArray();
  const page = docs.slice(0, opts.limit);
  const last = page.at(-1);
  return { items: page.map(toMessageDto), nextCursor: docs.length > opts.limit && last ? encodeCursor({ t: last.createdAt.getTime(), id: String(last._id) }) : null };
}

export type ReplyOutcome = { ok: true; message: MessageDto; replayed: boolean } | { ok: false; status: 404 | 409 | 422; code: string; message: string; fields?: Record<string, string> };

/**
 * The buyer's private reply to ONE supplier. The author, recipient, company and time are server-made. Exactly once per (buyer, key): the same key and text
 * returns the first message, another text under the same key is a conflict. The requirement must still be open. The supplier is told in-app
 * (preference-respecting, deduplicated, no message text in the notice) by a durable intent on the row that the worker sweep also retries.
 */
export async function sendBuyerReply(buyerId: string, reference: string, token: string, input: { message: unknown; idempotencyKey: unknown }, now = new Date()): Promise<ReplyOutcome> {
  const text = typeof input.message === "string" ? cleanMessage(input.message) : "";
  if (text.length < MESSAGE_MIN || text.length > MESSAGE_MAX) return { ok: false, status: 422, code: "MESSAGE", message: "Check the message.", fields: { message: `Write between ${MESSAGE_MIN} and ${MESSAGE_MAX.toLocaleString("en-IN")} characters.` } };
  if (!isIdempotencyKey(input.idempotencyKey)) return { ok: false, status: 422, code: "KEY", message: "Reload the page and try again.", fields: { idempotencyKey: "A request key is required." } };
  const c = await resolveConversation(buyerId, reference, token);
  if (!c) return { ok: false, status: 404, code: "NOT_FOUND", message: "Conversation not found." };
  const col = await messagesCollection();
  const requestHash = createHash("sha256").update(JSON.stringify([reference, token, text])).digest("hex");
  const replay = async (): Promise<ReplyOutcome | null> => {
    const prior = await col.findOne({ buyerId: c.owner, idempotencyKey: input.idempotencyKey as string });
    if (!prior) return null;
    return prior.requestHash === requestHash ? { ok: true, message: toMessageDto(prior), replayed: true } : { ok: false, status: 409, code: "IDEMPOTENCY_CONFLICT", message: "This request key was already used for a different message. Write the message again and send it." };
  };
  const early = await replay();
  if (early) return early;
  if (CLOSED.includes(c.inquiry.status)) return { ok: false, status: 409, code: "CLOSED", message: "This requirement is closed, so you can no longer message suppliers about it." };
  const company = await findCompanyBySupplierKey(c.supplierKey, { _id: 1, ownerUserId: 1 });
  if (!company) return { ok: false, status: 409, code: "RECIPIENT_UNAVAILABLE", message: "This supplier can no longer receive messages." };
  const doc: InquiryMessageDoc = {
    _id: new ObjectId(),
    inquiryId: c.inquiry._id!,
    inquiryReference: reference,
    supplierKey: c.supplierKey,
    supplierCompanyId: company._id,
    buyerId: c.owner,
    type: "BUYER_REPLY",
    body: text,
    authorUserId: c.owner,
    authorName: "Buyer",
    sender: "BUYER",
    idempotencyKey: input.idempotencyKey as string,
    requestHash,
    notice: { state: "PENDING", attempts: 0 },
    createdAt: now,
  };
  try {
    await col.insertOne(doc);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return (await replay()) ?? { ok: false, status: 409, code: "CONFLICT", message: "The message could not be sent. Please try again." };
    throw error;
  }
  await deliverBuyerReplyNotice(doc._id).catch(() => undefined);
  return { ok: true, message: toMessageDto(doc), replayed: false };
}

/** The supplier's in-app notice for one buyer reply. Deduplicated by the message id; a failure leaves it PENDING for the next sweep. */
export async function deliverBuyerReplyNotice(id: ObjectId): Promise<void> {
  const col = await messagesCollection();
  const m = await col.findOne({ _id: id, "notice.state": "PENDING" });
  if (!m?.notice) return;
  const company = await findCompanyBySupplierKey(m.supplierKey, { ownerUserId: 1 });
  const owner = company?.ownerUserId.toHexString();
  let state: NonNullable<InquiryMessageDoc["notice"]>["state"] = "PENDING";
  if (!owner) state = "NOT_RECORDED";
  else if (!(await isSupplierCategoryEnabled(owner, "inquiries"))) state = "SKIPPED_PREFERENCE";
  else {
    const dedupeKey = `buyer-reply:${m._id}`;
    await notifySupplier(owner, { category: "inquiries", type: "BUYER_REPLY", title: "A buyer replied", body: "A buyer replied in one of your conversations. Open the inquiry to read it.", link: `/supplier/inquiries/${m.inquiryReference}`, dedupeKey });
    if (await (await getDb()).collection("supplier_notifications").findOne({ supplierId: new ObjectId(owner), dedupeKey }, { projection: { _id: 1 } })) state = "DONE";
  }
  const attempts = m.notice.attempts + 1;
  if (state === "PENDING" && attempts >= 3) state = "NOT_RECORDED";
  await col.updateOne({ _id: m._id }, { $set: { "notice.state": state, "notice.attempts": attempts } });
}

/** Worker sweep: notices owed for buyer replies (bounded). */
export async function sweepBuyerReplyNotices(limit = 100): Promise<number> {
  const rows = await (await messagesCollection()).find({ "notice.state": "PENDING" }, { projection: { _id: 1 } }).sort({ createdAt: 1 }).limit(limit).toArray();
  for (const r of rows) await deliverBuyerReplyNotice(r._id).catch(() => undefined);
  return rows.length;
}

/** For the requirement list: supplier replies and current submitted offers per inquiry, batched (two grouped reads for a whole page). Drafts, buyer replies and older versions are not counted. */
export async function countsForInquiries(buyerId: string, inquiryIds: ObjectId[]): Promise<Map<string, { responses: number; offers: number }>> {
  const out = new Map<string, { responses: number; offers: number }>();
  if (!inquiryIds.length) return out;
  const owner = new ObjectId(buyerId);
  const [replies, offers] = await Promise.all([
    (await messagesCollection()).aggregate<{ _id: ObjectId; n: number }>([{ $match: { inquiryId: { $in: inquiryIds }, buyerId: owner, sender: { $ne: "BUYER" } } }, { $group: { _id: "$inquiryId", n: { $sum: 1 } } }]).toArray(),
    (await quotationsCollection()).aggregate<{ _id: ObjectId; n: number }>([{ $match: { inquiryId: { $in: inquiryIds }, buyerId: owner, isCurrent: true, status: { $ne: "DRAFT" } } }, { $group: { _id: "$inquiryId", n: { $sum: 1 } } }]).toArray(),
  ]);
  for (const id of inquiryIds) out.set(id.toHexString(), { responses: 0, offers: 0 });
  for (const r of replies) out.get(r._id.toHexString())!.responses = r.n;
  for (const o of offers) out.get(o._id.toHexString())!.offers = o.n;
  return out;
}

export { listMessages };
