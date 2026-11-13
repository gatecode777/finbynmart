import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { formatSubmitted } from "./confirmation";
import { MESSAGE_TYPE_LABEL, decodeCursor, encodeCursor, type Cursor, type MessageType } from "@/lib/supplier/inquiryRules";

/**
 * The inquiry conversation store (`inquiry_messages`): the ONE messaging model. A row is a supplier RESPONSE or a CLARIFICATION question on one inquiry.
 * A separate collection (not an array inside the inquiry) so the history is bounded per page and never grows the inquiry document.
 *
 * Identity, company, recipient, author and time are written only by the server. Rows are never edited or deleted (no editing or deletion is an approved
 * feature). Every read names the inquiry AND the party (the supplier's seller keys, or the buyer), so another party's rows are unreachable even by id.
 * Buyer replies do not exist (no buyer messaging is built), so every row here is authored by a supplier.
 */
export interface InquiryMessageDoc {
  _id: ObjectId;
  inquiryId: ObjectId;
  inquiryReference: string;
  supplierKey: string;
  supplierCompanyId: ObjectId;
  buyerId: ObjectId;
  type: MessageType;
  /** Plain text, 10 to 2,000 characters, rendered as text (never as HTML). */
  body: string;
  authorUserId: ObjectId;
  /** The supplier company's display name at the time (what a buyer is allowed to see; never the staff member's personal details). */
  authorName: string;
  createdAt: Date;
  /** Absent on older rows = SUPPLIER. A BUYER row is the buyer's private reply inside THIS supplier's conversation only (supplierKey is that recipient's). */
  sender?: "SUPPLIER" | "BUYER";
  /** BUYER rows only: exactly-once creation per buyer + key, and the durable intent to notify the supplier (delivered after the insert, retried by the worker sweep). */
  idempotencyKey?: string;
  requestHash?: string;
  notice?: { state: "PENDING" | "DONE" | "SKIPPED_PREFERENCE" | "NOT_RECORDED"; attempts: number };
}

let indexReady: Promise<unknown> | undefined;
export async function messagesCollection(): Promise<Collection<InquiryMessageDoc>> {
  const col = (await getDb()).collection<InquiryMessageDoc>("inquiry_messages");
  // the only access path: one inquiry's messages, newest first, with _id as the tie-break (cursor pagination)
  indexReady ??= Promise.all([
    col.createIndex({ inquiryId: 1, createdAt: -1, _id: -1 }, { name: "inquiry_messages_page" }),
    // one supplier conversation of one inquiry, newest first
    col.createIndex({ inquiryId: 1, supplierKey: 1, createdAt: -1, _id: -1 }, { name: "inquiry_messages_conversation" }),
    col.createIndex({ buyerId: 1, idempotencyKey: 1 }, { unique: true, name: "buyer_message_idempotency", partialFilterExpression: { idempotencyKey: { $exists: true } } }),
    col.createIndex({ "notice.state": 1, createdAt: 1 }, { name: "buyer_message_notice_pending", partialFilterExpression: { "notice.state": "PENDING" } }),
  ]).catch((error) => {
    indexReady = undefined;
    throw error;
  });
  await indexReady;
  return col;
}

export interface MessageDto {
  id: string;
  type: MessageType;
  typeLabel: string;
  body: string;
  authorName: string;
  /** BUYER = the buyer's own reply (shown as "You" to the buyer and "Buyer" to the supplier). */
  sender: "SUPPLIER" | "BUYER";
  createdAt: string;
  createdLabel: string;
}

export const toMessageDto = (d: InquiryMessageDoc): MessageDto => ({ id: String(d._id), type: d.type, typeLabel: MESSAGE_TYPE_LABEL[d.type], body: d.body, authorName: d.sender === "BUYER" ? "Buyer" : d.authorName, sender: d.sender ?? "SUPPLIER", createdAt: d.createdAt.toISOString(), createdLabel: formatSubmitted(d.createdAt.toISOString()) });

export interface MessagePage {
  items: MessageDto[];
  nextCursor: string | null;
}

/** One page, newest first. `party` is the filter that makes the rows reachable: the supplier's seller keys or the buyer's id. */
export async function listMessages(inquiryId: ObjectId, party: { supplierKeys: string[] } | { buyerId: ObjectId }, opts: { limit: number; cursor: Cursor | null }): Promise<MessagePage> {
  const col = await messagesCollection();
  const filter: Record<string, unknown> = { inquiryId, ...("supplierKeys" in party ? { supplierKey: { $in: party.supplierKeys } } : { buyerId: party.buyerId }) };
  if (opts.cursor) {
    const at = new Date(opts.cursor.t);
    filter.$or = [{ createdAt: { $lt: at } }, { createdAt: at, _id: { $lt: new ObjectId(opts.cursor.id) } }];
  }
  const docs = await col.find(filter as never).sort({ createdAt: -1, _id: -1 }).limit(opts.limit + 1).toArray();
  const page = docs.slice(0, opts.limit);
  const last = page.at(-1);
  return { items: page.map(toMessageDto), nextCursor: docs.length > opts.limit && last ? encodeCursor({ t: last.createdAt.getTime(), id: String(last._id) }) : null };
}

export { decodeCursor };
