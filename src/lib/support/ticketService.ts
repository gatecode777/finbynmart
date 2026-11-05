import { randomBytes } from "node:crypto";
import { ObjectId, type Collection, type Document, type Filter, type Sort } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { claimedExtension, detectType, displayFilename, removeStored, saveFile, storageConfigured } from "@/lib/buyer/documentStorage";
import { notifyTicketCreated } from "@/lib/buyer/notifications";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { resolveProduct } from "@/lib/catalog/productRef";
import { sendEmail, emailConfigured } from "@/lib/email/provider";
import { inquiriesCollection } from "@/lib/inquiries/service";
import { ordersCollection } from "@/lib/orders/service";
import { quotationsCollection } from "@/lib/quotations/service";
import {
  ATTACHMENT_CEILING,
  ATTACHMENT_DEFAULTS,
  STATUS_LABEL,
  categoryLabel,
  escapeRegex,
  groupOf,
  isTicketStatus,
  referenceMonth,
  relatedLabel,
  type RelatedType,
  type StatusGroup,
  type TicketInput,
  type TicketListQuery,
  type TicketStatus,
} from "./ticketRules";

/**
 * The buyer's side of support tickets (Page 36): create, list, summary, details, attachment download. Nothing here invents a ticket, a
 * reply or an agent: tickets are created by the buyer, start OPEN, and stay so until a support side (not built) changes them. Every
 * query names the buyer from the verified session; another buyer's reference, an unknown one and a malformed one are the same
 * "not found". The reference is an identifier, never a credential. Internal agent notes would live in their own collection and are
 * never part of any buyer answer.
 */
export interface AttachmentMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** The private storage reference (random file name); never sent to the browser. */
  ref: string;
}

export interface TicketEvent {
  type: "CREATED" | "STATUS_CHANGED" | "REOPENED" | "FEEDBACK_SUBMITTED";
  at: Date;
  actor: "buyer" | "support" | "system";
  status?: TicketStatus;
  from?: TicketStatus;
  /** An event only the support side may see: never part of any buyer answer. */
  internal?: true;
}

export interface TicketDoc {
  _id?: ObjectId;
  ticketReference: string;
  buyerId: ObjectId;
  categoryId: string;
  subject: string;
  description: string;
  related?: { type: RelatedType; reference: string; label: string; href: string | null };
  status: TicketStatus;
  /** Set by the server only (a buyer cannot choose a priority). */
  priority: "NORMAL";
  assignedAgentId: null;
  attachments: AttachmentMeta[];
  events: TicketEvent[];
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  closedAt?: Date;
  /** Set only by a support side (none exists yet) when it writes a buyer-visible reply; the page says "no support reply yet" while it is absent. */
  lastSupportReplyAt?: Date;
  /** What really happened to the optional alert to a configured support inbox. The in-app confirmation is the buyer's own notification. */
  notification: { supportEmail: "sent" | "failed" | "not_configured" | "pending" };
}

let indexReady: Promise<unknown> | undefined;
export async function ticketsCollection(): Promise<Collection<TicketDoc>> {
  const col = (await getDb()).collection<TicketDoc>("support_tickets");
  indexReady ??= Promise.all([
    col.createIndex({ ticketReference: 1 }, { unique: true, name: "ticket_reference" }),
    col.createIndex({ buyerId: 1, createdAt: -1, _id: -1 }, { name: "buyer_tickets_newest" }),
    col.createIndex({ buyerId: 1, status: 1, createdAt: -1, _id: -1 }, { name: "buyer_tickets_status_newest" }),
    col.createIndex({ buyerId: 1, status: 1, updatedAt: -1, _id: -1 }, { name: "buyer_tickets_status" }),
    col.createIndex({ buyerId: 1, updatedAt: -1, _id: -1 }, { name: "buyer_tickets_updated" }),
    col.createIndex({ buyerId: 1, categoryId: 1, createdAt: -1, _id: -1 }, { name: "buyer_tickets_category" }),
    // one ticket per submission: a retried or double-clicked submit finds the first one
    col.createIndex({ buyerId: 1, idempotencyKey: 1 }, { unique: true, name: "buyer_ticket_submission" }),
  ]);
  await indexReady;
  return col;
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** Server-side, random, month-stamped; a collision is caught by the unique index and retried. */
export function generateTicketReference(now = new Date()): string {
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHABET[bytes[i] % 32];
  return `FBM-SUP-${referenceMonth(now)}-${out}`;
}

// ---------- attachments ----------
export interface AttachmentLimits {
  maxFiles: number;
  maxBytes: number;
  maxMb: number;
  types: readonly string[];
}

/** Configurable (SUPPORT_ATTACH_MAX_FILES, SUPPORT_ATTACH_MAX_MB) within hard ceilings; a bad value falls back to the default. */
export function attachmentLimits(): AttachmentLimits {
  const num = (v: string | undefined, fallback: number, ceiling: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= ceiling ? n : fallback;
  };
  const maxFiles = num(process.env.SUPPORT_ATTACH_MAX_FILES, ATTACHMENT_DEFAULTS.maxFiles, ATTACHMENT_CEILING.maxFiles);
  const maxMb = num(process.env.SUPPORT_ATTACH_MAX_MB, ATTACHMENT_DEFAULTS.maxMb, ATTACHMENT_CEILING.maxMb);
  return { maxFiles, maxMb, maxBytes: maxMb * 1024 * 1024, types: ATTACHMENT_DEFAULTS.types };
}

export interface UploadedFile {
  name: string;
  bytes: Buffer;
}

type Checked = { ok: true; files: { name: string; bytes: Buffer; ext: "pdf" | "png" | "jpg"; mime: string }[] } | { ok: false; message: string };

/** Count, size, and what the bytes REALLY are (the first bytes are read, not the name or the declared type); the name's extension must agree. */
export function checkAttachments(files: UploadedFile[], limits = attachmentLimits()): Checked {
  if (files.length > limits.maxFiles) return { ok: false, message: `You can attach at most ${limits.maxFiles} files.` };
  const out: Extract<Checked, { ok: true }>["files"] = [];
  for (const f of files) {
    const label = displayFilename(f.name);
    if (f.bytes.length === 0) return { ok: false, message: `${label} is empty.` };
    if (f.bytes.length > limits.maxBytes) return { ok: false, message: `${label} is larger than ${limits.maxMb} MB.` };
    const type = detectType(f.bytes);
    if (!type) return { ok: false, message: `${label} is not a PDF, JPG or PNG file.` };
    const claimed = claimedExtension(f.name);
    if (claimed !== type.ext) return { ok: false, message: `${label}: the file name does not match its content.` };
    out.push({ name: label, bytes: f.bytes, ext: type.ext, mime: type.mime });
  }
  return { ok: true, files: out };
}

// ---------- related records ----------
/** Inquiry, quotation and order must belong to this buyer (a quotation must also be visible to them: never a draft); a product is a public catalogue record. */
async function resolveRelated(buyerId: ObjectId, related: { type: RelatedType; reference: string }): Promise<{ label: string; href: string | null } | null> {
  switch (related.type) {
    case "inquiry": {
      const doc = await (await inquiriesCollection()).findOne({ reference: related.reference, buyerId }, { projection: { supplierName: 1 } });
      return doc ? { label: `${related.reference} · ${doc.supplierName}`, href: `/buyer/inquiries/${related.reference}` } : null;
    }
    case "quotation": {
      const doc = await (await quotationsCollection()).findOne({ reference: related.reference, buyerId, isCurrent: true, status: { $ne: "DRAFT" } }, { projection: { supplierName: 1 } });
      return doc ? { label: `${related.reference} · ${doc.supplierName}`, href: `/buyer/quotations/${related.reference}` } : null;
    }
    case "order": {
      const doc = await (await ordersCollection()).findOne({ reference: related.reference, buyerId }, { projection: { supplierName: 1 } });
      return doc ? { label: `${related.reference} · ${doc.supplierName}`, href: `/buyer/orders/${related.reference}` } : null;
    }
    case "product": {
      const ref = resolveProduct(related.reference);
      const product = ref ? getPublicProductByKey(ref.key) : undefined;
      return product ? { label: product.name, href: product.url } : null;
    }
  }
}

export interface RelatedOption {
  reference: string;
  label: string;
}

/** The buyer's OWN records to choose from (at most 20, newest first); products come from their saved products. */
export async function listRelatedOptions(buyerIdText: string, type: RelatedType): Promise<RelatedOption[]> {
  const buyerId = new ObjectId(buyerIdText);
  switch (type) {
    case "inquiry": {
      const rows = await (await inquiriesCollection()).find({ buyerId, reference: { $exists: true } }, { projection: { reference: 1, supplierName: 1 } }).sort({ createdAt: -1, _id: -1 }).limit(20).toArray();
      return rows.map((r) => ({ reference: r.reference!, label: `${r.reference} · ${r.supplierName}` }));
    }
    case "quotation": {
      const rows = await (await quotationsCollection()).find({ buyerId, isCurrent: true, status: { $ne: "DRAFT" } }, { projection: { reference: 1, supplierName: 1 } }).sort({ sentAt: -1, _id: -1 }).limit(20).toArray();
      return rows.map((r) => ({ reference: r.reference, label: `${r.reference} · ${r.supplierName}` }));
    }
    case "order": {
      const rows = await (await ordersCollection()).find({ buyerId }, { projection: { reference: 1, supplierName: 1 } }).sort({ placedAt: -1, _id: -1 }).limit(20).toArray();
      return rows.map((r) => ({ reference: r.reference, label: `${r.reference} · ${r.supplierName}` }));
    }
    case "product": {
      const rows = await (await getDb()).collection("wishlists").find({ userId: buyerId }, { projection: { productKey: 1, productName: 1 } }).sort({ addedAt: -1, _id: -1 }).limit(20).toArray();
      return rows.flatMap((r) => (resolveProduct(String(r.productKey)) ? [{ reference: String(r.productKey), label: getPublicProductByKey(String(r.productKey))?.name ?? String(r.productName ?? r.productKey) }] : []));
    }
  }
}

// ---------- create ----------
export interface TicketDto {
  reference: string;
  subject: string;
  category: { id: string; label: string };
  related: { type: RelatedType; typeLabel: string; reference: string; label: string; href: string | null } | null;
  status: TicketStatus;
  statusLabel: string;
  statusGroup: StatusGroup;
  createdAt: string;
  updatedAt: string;
  detailHref: string;
}

function toDto(d: Pick<TicketDoc, "ticketReference" | "subject" | "categoryId" | "related" | "status" | "createdAt" | "updatedAt">): TicketDto {
  return {
    reference: d.ticketReference,
    subject: d.subject,
    category: { id: d.categoryId, label: categoryLabel(d.categoryId) },
    related: d.related ? { type: d.related.type, typeLabel: relatedLabel(d.related.type), reference: d.related.reference, label: d.related.label, href: d.related.href } : null,
    status: d.status,
    statusLabel: STATUS_LABEL[d.status],
    statusGroup: groupOf(d.status),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    detailHref: `/buyer/support/tickets/${d.ticketReference}`,
  };
}

export type CreateOutcome =
  | { ok: true; ticket: TicketDto; duplicate: boolean; attachments: number }
  | { ok: false; code: "INVALID_RELATED" | "INVALID_ATTACHMENT" | "STORAGE_UNAVAILABLE"; field: string; message: string };

const isDuplicateKey = (e: unknown) => (e as { code?: number }).code === 11000;

/**
 * Persists ONE ticket. Order: a retried submission returns the first ticket (nothing re-uploaded) -> the related record must be the
 * buyer's own -> attachments are checked by content -> files are written to the private store -> the ticket is inserted (a unique
 * reference, retried on a collision) -> only then is anything reported. If the insert fails the files are removed again. The
 * optional alert to a configured support inbox is sent AFTER the ticket exists and never delays or fails it.
 */
export async function createBuyerTicket(buyer: { id: string; name: string; email: string }, input: TicketInput, files: UploadedFile[], now = new Date()): Promise<CreateOutcome> {
  const col = await ticketsCollection();
  const buyerId = new ObjectId(buyer.id);

  const existing = await col.findOne({ buyerId, idempotencyKey: input.idempotencyKey });
  if (existing) return { ok: true, ticket: toDto(existing), duplicate: true, attachments: existing.attachments.length };

  let related: TicketDoc["related"];
  if (input.related) {
    const found = await resolveRelated(buyerId, input.related);
    if (!found) return { ok: false, code: "INVALID_RELATED", field: "related", message: "That record was not found among yours. Choose one from the list, or leave it empty." };
    related = { type: input.related.type, reference: input.related.reference, label: found.label, href: found.href };
  }

  const checked = checkAttachments(files);
  if (!checked.ok) return { ok: false, code: "INVALID_ATTACHMENT", field: "attachments", message: checked.message };
  if (checked.files.length > 0 && !storageConfigured()) return { ok: false, code: "STORAGE_UNAVAILABLE", field: "attachments", message: "File storage is not configured on this server, so files cannot be attached yet. You can submit the ticket without them." };

  const saved: AttachmentMeta[] = [];
  try {
    for (const f of checked.files) saved.push({ id: randomBytes(8).toString("hex"), name: f.name, mime: f.mime, size: f.bytes.length, ref: await saveFile(f.bytes, f.ext) });
  } catch (error) {
    await Promise.all(saved.map((s) => removeStored(s.ref)));
    throw error;
  }

  const base: Omit<TicketDoc, "ticketReference"> = {
    buyerId,
    categoryId: input.category,
    subject: input.subject,
    description: input.description,
    ...(related ? { related } : {}),
    status: "OPEN",
    priority: "NORMAL",
    assignedAgentId: null,
    attachments: saved,
    events: [{ type: "CREATED", at: now, actor: "buyer", status: "OPEN" }],
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    updatedAt: now,
    notification: { supportEmail: emailConfigured() && supportInbox() ? "pending" : "not_configured" },
  };

  let doc: TicketDoc | null = null;
  try {
    for (let attempt = 0; attempt < 5 && !doc; attempt++) {
      const candidate: TicketDoc = { ...base, ticketReference: generateTicketReference(now) };
      try {
        const { insertedId } = await col.insertOne(candidate);
        doc = { ...candidate, _id: insertedId };
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        // the same submission won a race: use its ticket; anything else is a reference collision: draw another
        const first = await col.findOne({ buyerId, idempotencyKey: input.idempotencyKey });
        if (first) {
          await Promise.all(saved.map((s) => removeStored(s.ref)));
          return { ok: true, ticket: toDto(first), duplicate: true, attachments: first.attachments.length };
        }
      }
    }
    if (!doc) throw new Error("could not generate a unique ticket reference");
  } catch (error) {
    await Promise.all(saved.map((s) => removeStored(s.ref)));
    throw error;
  }

  // after persistence: the buyer's own confirmation, and (only when configured) the alert to the support inbox. Neither can fail the ticket.
  await notifyTicketCreated(buyer.id, doc.ticketReference, doc.subject);
  void alertSupport(doc, buyer);
  return { ok: true, ticket: toDto(doc), duplicate: false, attachments: saved.length };
}

/** The configured support inbox (SUPPORT_EMAIL), or null. Never a default or an invented address. */
export const supportInbox = () => process.env.SUPPORT_EMAIL?.trim() || null;

async function alertSupport(doc: TicketDoc, buyer: { name: string; email: string }): Promise<void> {
  const inbox = supportInbox();
  if (!inbox || !emailConfigured()) return;
  let result: "sent" | "failed" = "failed";
  try {
    const sent = await sendEmail({ to: inbox, subject: `New support ticket ${doc.ticketReference}`, text: `Ticket ${doc.ticketReference}\nCategory: ${categoryLabel(doc.categoryId)}\nSubject: ${doc.subject}\nBuyer: ${buyer.name} <${buyer.email}>\nRelated: ${doc.related ? doc.related.label : "none"}\nAttachments: ${doc.attachments.length}\n\nThe description is in the ticket, not in this message.` });
    result = sent.status === "sent" ? "sent" : "failed";
  } catch {
    result = "failed";
  }
  await (await ticketsCollection()).updateOne({ _id: doc._id }, { $set: { "notification.supportEmail": result } }).catch(() => undefined);
}

// ---------- list, summary ----------
const PROJECTION = { ticketReference: 1, subject: 1, categoryId: 1, related: 1, status: 1, createdAt: 1, updatedAt: 1 } as const;

function filterFor(buyerId: string, q: TicketListQuery): Filter<TicketDoc> {
  const and: Filter<TicketDoc>[] = [{ buyerId: new ObjectId(buyerId) }];
  if (q.status !== "all") and.push({ status: q.status.toUpperCase() as TicketStatus });
  if (q.categoryId) and.push({ categoryId: q.categoryId });
  if (q.relatedEntityType) and.push({ "related.type": q.relatedEntityType });
  if (q.window) and.push({ createdAt: { $gte: q.window.start, $lt: q.window.end } });
  if (q.q) {
    // bounded to this buyer's own rows; the text is escaped, so it is matched literally (never as a pattern)
    const text = escapeRegex(q.q);
    and.push({ $or: [{ ticketReference: { $regex: `^${text}`, $options: "i" } }, { subject: { $regex: text, $options: "i" } }, { "related.reference": { $regex: `^${text}`, $options: "i" } }] });
  }
  return { $and: and };
}

const SORT: Record<TicketListQuery["sort"], Sort> = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  updated: { updatedAt: -1, _id: -1 },
};

export interface TicketPage {
  tickets: TicketDto[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export async function listBuyerTickets(buyerId: string, q: TicketListQuery): Promise<TicketPage> {
  const col = await ticketsCollection();
  const filter = filterFor(buyerId, q);
  const [docs, total] = await Promise.all([col.find(filter, { projection: PROJECTION }).sort(SORT[q.sort]).skip((q.page - 1) * q.limit).limit(q.limit).toArray(), col.countDocuments(filter)]);
  return { tickets: docs.filter((d) => isTicketStatus(d.status)).map(toDto), meta: { total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) } };
}

export interface TicketSummary {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
}

/** The four numbers over ALL of the buyer's tickets: one grouped read through the buyer's index. */
export async function getBuyerTicketSummary(buyerId: string): Promise<TicketSummary> {
  const rows = await (await ticketsCollection()).aggregate<{ _id: string; n: number }>([{ $match: { buyerId: new ObjectId(buyerId) } as Document }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray();
  const out: TicketSummary = { total: 0, open: 0, inProgress: 0, resolved: 0 };
  for (const r of rows) {
    if (!isTicketStatus(r._id)) continue;
    out.total += r.n;
    const g = groupOf(r._id);
    if (g === "open") out.open += r.n;
    else if (g === "in_progress") out.inProgress += r.n;
    else out.resolved += r.n;
  }
  return out;
}

// The ticket page (details, conversation, timeline, files, reopen, feedback) lives in conversationService.ts and ticketActions.ts (Page 37).
