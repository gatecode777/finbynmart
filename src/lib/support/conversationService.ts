import { randomBytes } from "node:crypto";
import { ObjectId, type Collection, type Filter } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { readStored, removeStored, saveFile, storageConfigured } from "@/lib/buyer/documentStorage";
import { emailConfigured, sendEmail } from "@/lib/email/provider";
import { formatSubmitted } from "@/lib/inquiries/confirmation";
import {
  feedbackState,
  orderKey,
  parseKey,
  reopenState,
  replyState,
  replyTransition,
  type Allowed,
  type PageQuery,
} from "./conversationRules";
import { STATUS_LABEL, categoryLabel, groupOf, relatedLabel, type RelatedType, type StatusGroup, type TicketStatus } from "./ticketRules";
import { attachmentLimits, checkAttachments, supportInbox, ticketsCollection, type AttachmentMeta, type TicketDoc, type UploadedFile } from "./ticketService";

/**
 * The buyer's conversation on a ticket (Page 37): the ticket page's data, buyer-visible messages, buyer replies, the timeline and the
 * files. Messages live in their own collection because a conversation grows without bound while a ticket document must stay small;
 * everything else (status, events, attachments of the original submission) stays on the ticket from Page 36. Every function takes the
 * buyer from the verified session and finds the ticket by (reference AND buyer): another buyer's reference is "not found", never
 * "forbidden". Internal notes would have visibility "internal" and are excluded by every query here. Nothing in this file invents a
 * message, an agent or an event: the support side that would write support messages does not exist yet, so none appear.
 */
export interface MessageDoc {
  _id?: ObjectId;
  ticketId: ObjectId;
  ticketReference: string;
  buyerId: ObjectId;
  /** "buyer" from the session; "support" and "system" can only be written by a support side (not built). */
  senderRole: "buyer" | "support" | "system";
  /** "reply" is a normal message; "reopen" is the reason given when the buyer reopened the ticket. */
  kind: "reply" | "reopen";
  visibility: "buyer" | "internal";
  body: string;
  attachments: AttachmentMeta[];
  /** Present only when there are files: lets the files list use a small partial index. */
  hasFiles?: true;
  idempotencyKey?: string;
  supportEmail?: "sent" | "failed" | "not_configured" | "pending";
  createdAt: Date;
}

export interface FeedbackDoc {
  _id?: ObjectId;
  ticketId: ObjectId;
  ticketReference: string;
  buyerId: ObjectId;
  rating: number;
  feedbackText: string;
  createdAt: Date;
}

let messageIndexes: Promise<unknown> | undefined;
export async function messagesCollection(): Promise<Collection<MessageDoc>> {
  const col = (await getDb()).collection<MessageDoc>("support_messages");
  messageIndexes ??= Promise.all([
    // the conversation (newest first, walked backwards for older pages) and the timeline (oldest first)
    col.createIndex({ ticketId: 1, visibility: 1, createdAt: -1, _id: -1 }, { name: "ticket_messages_visible" }),
    // the files tab and the download lookup read only the messages that carry files
    col.createIndex({ ticketId: 1, createdAt: 1, _id: 1 }, { name: "ticket_message_files", partialFilterExpression: { hasFiles: true } }),
    // a retried or double-clicked send is the same message. The filter is $exists (not $type) because MongoDB only uses a partial index
    // for an equality lookup when it can prove the query implies the filter, which it can for $exists:true and cannot for $type.
    col.createIndex({ ticketId: 1, idempotencyKey: 1 }, { unique: true, name: "ticket_message_send_key", partialFilterExpression: { idempotencyKey: { $exists: true } } }),
    // the download lookup: one file of one ticket, without reading the ticket's other messages
    col.createIndex({ ticketId: 1, "attachments.id": 1 }, { name: "ticket_message_file_id", partialFilterExpression: { hasFiles: true } }),
  ]);
  await messageIndexes;
  return col;
}

let feedbackIndexes: Promise<unknown> | undefined;
export async function feedbackCollection(): Promise<Collection<FeedbackDoc>> {
  const col = (await getDb()).collection<FeedbackDoc>("support_feedback");
  // one feedback per ticket: the database refuses a second one, so a double click or a race cannot store two
  feedbackIndexes ??= col.createIndex({ ticketId: 1 }, { unique: true, name: "ticket_feedback" });
  await feedbackIndexes;
  return col;
}

// ---------- shapes ----------
export interface AttachmentDto {
  id: string;
  name: string;
  mime: string;
  size: number;
  href: string;
}

export interface MessageDto {
  id: string;
  /** "original" is the description the buyer wrote when raising the ticket (read from the ticket itself). */
  kind: "original" | "reply" | "reopen";
  sender: "buyer" | "support" | "system";
  senderLabel: string;
  body: string;
  attachments: AttachmentDto[];
  at: string;
  atLabel: string;
  /** The paging key (null for the original description). */
  key: string | null;
}

const SENDER_LABEL = { buyer: "You", support: "Finbyn Mart Support", system: "Finbyn Mart" } as const;

const attachmentHref = (reference: string, id: string) => `/api/buyer/support/tickets/${reference}/attachments/${id}`;
const attachmentDto = (reference: string, a: AttachmentMeta): AttachmentDto => ({ id: a.id, name: a.name, mime: a.mime, size: a.size, href: attachmentHref(reference, a.id) });

function messageDto(m: MessageDoc & { _id: ObjectId }): MessageDto {
  return {
    id: m._id.toHexString(),
    kind: m.kind,
    sender: m.senderRole,
    senderLabel: SENDER_LABEL[m.senderRole],
    body: m.body,
    attachments: m.attachments.map((a) => attachmentDto(m.ticketReference, a)),
    at: m.createdAt.toISOString(),
    atLabel: formatSubmitted(m.createdAt.toISOString()),
    key: orderKey(m.createdAt, "m", m._id.toHexString()),
  };
}

function originalDto(t: TicketDoc): MessageDto {
  return {
    id: "original",
    kind: "original",
    sender: "buyer",
    senderLabel: SENDER_LABEL.buyer,
    body: t.description,
    attachments: t.attachments.map((a) => attachmentDto(t.ticketReference, a)),
    at: t.createdAt.toISOString(),
    atLabel: formatSubmitted(t.createdAt.toISOString()),
    key: null,
  };
}

/** The ticket, only if it is this buyer's. */
export async function loadOwnTicket(buyerId: string, reference: string): Promise<(TicketDoc & { _id: ObjectId }) | null> {
  if (!ObjectId.isValid(buyerId)) return null;
  return (await (await ticketsCollection()).findOne({ ticketReference: reference, buyerId: new ObjectId(buyerId) })) as (TicketDoc & { _id: ObjectId }) | null;
}

/** When the ticket was last resolved or closed, from the recorded status events (else the stored date), or null when none is recorded. */
export function resolvedAtOf(t: Pick<TicketDoc, "events" | "status" | "resolvedAt" | "closedAt">): Date | null {
  if (t.status !== "RESOLVED" && t.status !== "CLOSED") return null;
  for (let i = t.events.length - 1; i >= 0; i--) {
    const e = t.events[i];
    if (e.type === "STATUS_CHANGED" && (e.status === "RESOLVED" || e.status === "CLOSED")) return e.at;
  }
  return t.closedAt ?? t.resolvedAt ?? null;
}

export const reopenCountOf = (t: Pick<TicketDoc, "events">) => t.events.filter((e) => e.type === "REOPENED").length;

// ---------- the ticket page's own data ----------
export interface TicketOverview {
  reference: string;
  subject: string;
  category: { id: string; label: string };
  related: { type: RelatedType; typeLabel: string; reference: string; label: string; href: string | null } | null;
  status: TicketStatus;
  statusLabel: string;
  statusGroup: StatusGroup;
  createdAt: string;
  updatedAt: string;
  createdLabel: string;
  updatedLabel: string;
  /** Set only when the ticket is resolved or closed and a status event recorded when. */
  resolvedLabel: string | null;
  hasSupportReply: boolean;
  /** Calculated here from the current status and the policy; the browser never decides. */
  capabilities: { canReply: boolean; canReopen: boolean; canSubmitFeedback: boolean; canRequestClosure: false };
  reasons: { reply: string | null; reopen: string | null; feedback: string | null };
  feedback: { submitted: boolean; rating: number | null; submittedLabel: string | null };
  limits: { maxFiles: number; maxMb: number; types: readonly string[]; canAttach: boolean };
  reopenCount: number;
}

export async function getBuyerTicketOverview(buyerId: string, reference: string, now = new Date()): Promise<TicketOverview | null> {
  const t = await loadOwnTicket(buyerId, reference);
  if (!t) return null;
  const fb = await (await feedbackCollection()).findOne({ ticketId: t._id }, { projection: { rating: 1, createdAt: 1 } });
  const resolved = resolvedAtOf(t);
  const reopens = reopenCountOf(t);
  const reply: Allowed = replyState(t.status);
  const reopen = reopenState(t.status, resolved ?? t.updatedAt, reopens, now);
  const feedback = feedbackState(t.status, Boolean(fb));
  const limits = attachmentLimits();
  return {
    reference: t.ticketReference,
    subject: t.subject,
    category: { id: t.categoryId, label: categoryLabel(t.categoryId) },
    related: t.related ? { type: t.related.type, typeLabel: relatedLabel(t.related.type), reference: t.related.reference, label: t.related.label, href: t.related.href } : null,
    status: t.status,
    statusLabel: STATUS_LABEL[t.status],
    statusGroup: groupOf(t.status),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    createdLabel: formatSubmitted(t.createdAt.toISOString()),
    updatedLabel: formatSubmitted(t.updatedAt.toISOString()),
    resolvedLabel: resolved ? formatSubmitted(resolved.toISOString()) : null,
    hasSupportReply: Boolean(t.lastSupportReplyAt),
    capabilities: { canReply: reply.allowed, canReopen: reopen.allowed, canSubmitFeedback: feedback.allowed, canRequestClosure: false },
    reasons: { reply: reply.reason, reopen: t.status === "RESOLVED" || t.status === "CLOSED" ? reopen.reason : null, feedback: feedback.reason },
    feedback: { submitted: Boolean(fb), rating: fb?.rating ?? null, submittedLabel: fb ? formatSubmitted(fb.createdAt.toISOString()) : null },
    limits: { maxFiles: limits.maxFiles, maxMb: limits.maxMb, types: limits.types, canAttach: storageConfigured() },
    reopenCount: reopens,
  };
}

// ---------- the conversation ----------
export interface MessagePage {
  messages: MessageDto[];
  meta: { hasMore: boolean; nextCursor: string | null };
}

/** Messages strictly before a key (newest first), for walking back through a long conversation. */
function beforeFilter(cursor: string | null): Filter<MessageDoc> {
  const k = cursor ? parseKey(cursor) : null;
  if (!k) return {};
  const at = new Date(k.ms);
  // at the same millisecond events ("e") sort before messages ("m"), so only an "m" cursor can have an earlier message at that instant
  if (k.source === "m" && k.id.length === 24) return { $or: [{ createdAt: { $lt: at } }, { createdAt: at, _id: { $lt: new ObjectId(k.id) } }] };
  return { createdAt: { $lt: at } };
}

/**
 * One page of the buyer-visible conversation, oldest first inside the page. With no cursor it is the NEWEST page; `before` walks back.
 * The buyer's original description is included only when there is nothing older (it is the first message of the conversation).
 */
export async function listBuyerMessages(buyerId: string, reference: string, page: PageQuery): Promise<MessagePage | null> {
  const t = await loadOwnTicket(buyerId, reference);
  if (!t) return null;
  const col = await messagesCollection();
  const docs = await col
    .find({ $and: [{ ticketId: t._id, visibility: "buyer" }, beforeFilter(page.cursor)] }, { projection: { ticketId: 0, buyerId: 0, supportEmail: 0, idempotencyKey: 0 } })
    .sort({ createdAt: -1, _id: -1 })
    .limit(page.limit + 1)
    .toArray();
  const hasMore = docs.length > page.limit;
  const shown = (hasMore ? docs.slice(0, page.limit) : docs).reverse() as (MessageDoc & { _id: ObjectId })[];
  const dtos = shown.map((m) => messageDto({ ...m, ticketReference: t.ticketReference }));
  return {
    messages: hasMore ? dtos : [originalDto(t), ...dtos],
    meta: { hasMore, nextCursor: hasMore ? dtos[0]?.key ?? null : null },
  };
}

export type ReplyOutcome =
  | { ok: true; message: MessageDto; duplicate: boolean; status: TicketStatus; statusChanged: boolean }
  | { ok: false; code: "NOT_FOUND" | "NOT_ALLOWED" | "INVALID_ATTACHMENT" | "STORAGE_UNAVAILABLE"; field?: string; message: string };

const isDuplicateKey = (e: unknown) => (e as { code?: number }).code === 11000;

/**
 * Saves ONE buyer reply. The sender and role come from the session (the caller never passes them from the request). Order: the ticket
 * must be this buyer's -> a retried send returns the first message -> the status must allow a reply -> files are checked by content
 * and stored privately -> the message is inserted (a unique key per send) -> the ticket's last activity (and, when it was waiting for
 * the buyer, its status) is updated. Success is reported only after the message exists; files are removed if the insert fails.
 */
export async function createBuyerReply(buyer: { id: string; name: string; email: string }, reference: string, input: { message: string; idempotencyKey: string }, files: UploadedFile[], now = new Date()): Promise<ReplyOutcome> {
  const t = await loadOwnTicket(buyer.id, reference);
  if (!t) return { ok: false, code: "NOT_FOUND", message: "That ticket was not found." };
  const col = await messagesCollection();

  const first = await col.findOne({ ticketId: t._id, idempotencyKey: input.idempotencyKey });
  if (first) return { ok: true, message: messageDto(first as MessageDoc & { _id: ObjectId }), duplicate: true, status: t.status, statusChanged: false };

  const allowed = replyState(t.status);
  if (!allowed.allowed) return { ok: false, code: "NOT_ALLOWED", message: allowed.reason ?? "You cannot reply to this ticket." };

  const checked = checkAttachments(files);
  if (!checked.ok) return { ok: false, code: "INVALID_ATTACHMENT", field: "attachments", message: checked.message };
  if (checked.files.length > 0 && !storageConfigured()) return { ok: false, code: "STORAGE_UNAVAILABLE", field: "attachments", message: "File storage is not configured on this server, so files cannot be attached yet. You can send the reply without them." };

  const saved: AttachmentMeta[] = [];
  try {
    for (const f of checked.files) saved.push({ id: randomBytes(8).toString("hex"), name: f.name, mime: f.mime, size: f.bytes.length, ref: await saveFile(f.bytes, f.ext) });
  } catch (error) {
    await Promise.all(saved.map((s) => removeStored(s.ref)));
    throw error;
  }

  const doc: MessageDoc = {
    ticketId: t._id,
    ticketReference: t.ticketReference,
    buyerId: t.buyerId,
    senderRole: "buyer",
    kind: "reply",
    visibility: "buyer",
    body: input.message,
    attachments: saved,
    ...(saved.length > 0 ? { hasFiles: true as const } : {}),
    idempotencyKey: input.idempotencyKey,
    supportEmail: emailConfigured() && supportInbox() ? "pending" : "not_configured",
    createdAt: now,
  };
  let inserted: MessageDoc & { _id: ObjectId };
  try {
    const { insertedId } = await col.insertOne(doc);
    inserted = { ...doc, _id: insertedId };
  } catch (error) {
    await Promise.all(saved.map((s) => removeStored(s.ref)));
    if (isDuplicateKey(error)) {
      const winner = await col.findOne({ ticketId: t._id, idempotencyKey: input.idempotencyKey });
      if (winner) return { ok: true, message: messageDto(winner as MessageDoc & { _id: ObjectId }), duplicate: true, status: t.status, statusChanged: false };
    }
    throw error;
  }

  // last activity, and the one allowed transition (waiting for the buyer -> in progress); the filter on status means a change made
  // meanwhile is never overwritten
  const next = replyTransition(t.status);
  const tickets = await ticketsCollection();
  let statusChanged = false;
  if (next) {
    const res = await tickets.updateOne({ _id: t._id, status: t.status }, { $set: { status: next, updatedAt: now }, $push: { events: { type: "STATUS_CHANGED", at: now, actor: "buyer", from: t.status, status: next } } });
    statusChanged = res.modifiedCount === 1;
  }
  if (!statusChanged) await tickets.updateOne({ _id: t._id }, { $max: { updatedAt: now } });

  void alertSupportOfReply(inserted, t.ticketReference, buyer);
  return { ok: true, message: messageDto(inserted), duplicate: false, status: statusChanged ? (next as TicketStatus) : t.status, statusChanged };
}

/** Only when a support inbox and an e-mail provider are configured. The text never carries the message: the reply is read in the ticket. */
export async function alertSupportOfReply(message: MessageDoc & { _id: ObjectId }, reference: string, buyer: { name: string; email: string }, what = "A buyer replied on"): Promise<void> {
  const inbox = supportInbox();
  if (!inbox || !emailConfigured()) return;
  let result: "sent" | "failed" = "failed";
  try {
    const sent = await sendEmail({ to: inbox, subject: `${what} ticket ${reference}`, text: `${what} ticket ${reference}.\nBuyer: ${buyer.name} <${buyer.email}>\nFiles: ${message.attachments.length}\n\nThe message itself is in the ticket, not in this e-mail.` });
    result = sent.status === "sent" ? "sent" : "failed";
  } catch {
    result = "failed";
  }
  await (await messagesCollection()).updateOne({ _id: message._id }, { $set: { supportEmail: result } }).catch(() => undefined);
}

// ---------- the timeline ----------
export interface TimelineItem {
  key: string;
  title: string;
  description: string;
  actor: string;
  at: string;
  atLabel: string;
  status: TicketStatus | null;
}

export interface TimelinePage {
  items: TimelineItem[];
  meta: { hasMore: boolean; nextCursor: string | null };
}

const ACTOR_LABEL = { buyer: "You", support: "Support", system: "Finbyn Mart" } as const;

function eventItem(e: TicketDoc["events"][number], index: number): TimelineItem {
  const at = e.at.toISOString();
  const base = { key: orderKey(e.at, "e", index.toString(16).padStart(6, "0")), actor: ACTOR_LABEL[e.actor], at, atLabel: formatSubmitted(at), status: e.status ?? null };
  switch (e.type) {
    case "CREATED":
      return { ...base, title: "Ticket created", description: "The ticket was raised and saved." };
    case "REOPENED":
      return { ...base, title: "Ticket reopened", description: e.from ? `Reopened from ${STATUS_LABEL[e.from]}.` : "The ticket was reopened." };
    case "FEEDBACK_SUBMITTED":
      return { ...base, title: "Feedback sent", description: "Feedback about the resolution was recorded." };
    default:
      return { ...base, title: e.status === "RESOLVED" ? "Ticket resolved" : e.status === "CLOSED" ? "Ticket closed" : "Status changed", description: e.from && e.status ? `From ${STATUS_LABEL[e.from]} to ${STATUS_LABEL[e.status]}.` : e.status ? `Now ${STATUS_LABEL[e.status]}.` : "The status changed." };
  }
}

function messageItem(m: MessageDoc & { _id: ObjectId }): TimelineItem {
  const at = m.createdAt.toISOString();
  const files = m.attachments.length > 0 ? ` ${m.attachments.length} file${m.attachments.length === 1 ? "" : "s"} attached.` : "";
  return {
    key: orderKey(m.createdAt, "m", m._id.toHexString()),
    title: m.senderRole === "support" ? "Support replied" : "You replied",
    description: `${m.senderRole === "support" ? "A reply from Finbyn Mart Support was added." : "Your reply was added to the conversation."}${files}`,
    actor: ACTOR_LABEL[m.senderRole],
    at,
    atLabel: formatSubmitted(at),
    status: null,
  };
}

/**
 * The buyer-visible activity, oldest first, `limit` at a time after a cursor. Two real sources are merged: the lifecycle events stored
 * on the ticket (internal ones excluded) and the buyer-visible messages (a reopening reason is part of the "reopened" event, so it is
 * not listed twice). Nothing is inferred: an event is shown only if it was recorded, with the time it was recorded.
 */
export async function getBuyerTimeline(buyerId: string, reference: string, page: PageQuery): Promise<TimelinePage | null> {
  const t = await loadOwnTicket(buyerId, reference);
  if (!t) return null;
  const k = page.cursor ? parseKey(page.cursor) : null;
  const after = (key: string) => !page.cursor || key > page.cursor;

  const events = t.events.map((e, i) => ({ e, i })).filter(({ e }) => !e.internal).map(({ e, i }) => eventItem(e, i)).filter((x) => after(x.key));

  const filter: Filter<MessageDoc> = { ticketId: t._id, visibility: "buyer", kind: "reply" };
  if (k) {
    const at = new Date(k.ms);
    // an "e" cursor: messages at the same millisecond come after it; an "m" cursor: later, or the same instant with a larger id
    Object.assign(filter, k.source === "m" && k.id.length === 24 ? { $or: [{ createdAt: { $gt: at } }, { createdAt: at, _id: { $gt: new ObjectId(k.id) } }] } : { createdAt: { $gte: at } });
  }
  const docs = (await (await messagesCollection()).find(filter, { projection: { ticketId: 0, buyerId: 0, supportEmail: 0, idempotencyKey: 0 } }).sort({ createdAt: 1, _id: 1 }).limit(page.limit + 1).toArray()) as (MessageDoc & { _id: ObjectId })[];
  const messages = docs.map((m) => messageItem({ ...m, ticketReference: t.ticketReference }));

  const merged = [...events, ...messages].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const hasMore = merged.length > page.limit;
  const items = merged.slice(0, page.limit);
  return { items, meta: { hasMore, nextCursor: hasMore ? items.at(-1)?.key ?? null : null } };
}

// ---------- files ----------
export interface FileItem extends AttachmentDto {
  source: "ticket" | "reply";
  uploadedBy: string;
  at: string;
  atLabel: string;
}

export interface FilesPage {
  files: FileItem[];
  meta: { hasMore: boolean; nextCursor: string | null };
}

/**
 * Every file the buyer may download on this ticket: the ones sent with the original ticket (first page only) and the ones on
 * buyer-visible messages, oldest first. `limit` counts messages that carry files. Internal messages' files are never listed.
 */
export async function listBuyerFiles(buyerId: string, reference: string, page: PageQuery): Promise<FilesPage | null> {
  const t = await loadOwnTicket(buyerId, reference);
  if (!t) return null;
  const files: FileItem[] = [];
  if (!page.cursor) {
    for (const a of t.attachments) files.push({ ...attachmentDto(t.ticketReference, a), source: "ticket", uploadedBy: ACTOR_LABEL.buyer, at: t.createdAt.toISOString(), atLabel: formatSubmitted(t.createdAt.toISOString()) });
  }
  const k = page.cursor ? parseKey(page.cursor) : null;
  const filter: Filter<MessageDoc> = { ticketId: t._id, hasFiles: true, visibility: "buyer" };
  if (k) {
    const at = new Date(k.ms);
    Object.assign(filter, k.source === "m" && k.id.length === 24 ? { $or: [{ createdAt: { $gt: at } }, { createdAt: at, _id: { $gt: new ObjectId(k.id) } }] } : { createdAt: { $gte: at } });
  }
  const docs = (await (await messagesCollection()).find(filter, { projection: { ticketId: 0, buyerId: 0, supportEmail: 0, idempotencyKey: 0, body: 0 } }).sort({ createdAt: 1, _id: 1 }).limit(page.limit + 1).toArray()) as (MessageDoc & { _id: ObjectId })[];
  const hasMore = docs.length > page.limit;
  const shown = hasMore ? docs.slice(0, page.limit) : docs;
  for (const m of shown) {
    for (const a of m.attachments) files.push({ ...attachmentDto(t.ticketReference, a), source: "reply", uploadedBy: ACTOR_LABEL[m.senderRole], at: m.createdAt.toISOString(), atLabel: formatSubmitted(m.createdAt.toISOString()) });
  }
  const last = shown.at(-1);
  return { files, meta: { hasMore, nextCursor: hasMore && last ? orderKey(last.createdAt, "m", last._id.toHexString()) : null } };
}

/** One file's bytes, only if it belongs to this buyer's ticket (the original submission or a buyer-visible message). Re-checked by content on every read. */
export async function readBuyerTicketAttachment(buyerId: string, reference: string, attachmentId: string): Promise<{ bytes: Buffer; mime: string; name: string } | null> {
  if (!/^[a-f0-9]{16}$/.test(attachmentId)) return null;
  const t = await loadOwnTicket(buyerId, reference);
  if (!t) return null;
  let meta = t.attachments.find((a) => a.id === attachmentId);
  if (!meta) {
    const m = await (await messagesCollection()).findOne({ ticketId: t._id, hasFiles: true, visibility: "buyer", "attachments.id": attachmentId }, { projection: { attachments: 1 } });
    meta = m?.attachments.find((a) => a.id === attachmentId);
  }
  if (!meta) return null;
  const stored = await readStored(meta.ref);
  return stored ? { bytes: stored.bytes, mime: stored.mime, name: meta.name } : null;
}


