import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { canTransition, TICKET_STATUSES, type TicketStatus } from "@/lib/support/ticketRules";
import { messagesCollection, type MessageDoc } from "@/lib/support/conversationService";
import { ticketsCollection } from "@/lib/support/ticketService";
import { notifySupplier } from "@/lib/supplier/notifications";

/**
 * Minimal support-staff workflow on the CENTRAL tickets and messages (capability support.manage). Public replies are `visibility: "buyer"` messages with
 * senderRole "support" (the ticket owner reads them through the existing, ownership-checked routes); internal notes are `visibility: "internal"`, which
 * every owner-facing query already excludes. The staff identity comes from the session, never from a client field. No SLA or availability is promised.
 */
const PAGE = 20;
const MSG_MIN = 2;
const MSG_MAX = 2000;

export interface StaffTicketRow { reference: string; subject: string; status: TicketStatus; updatedAt: string; hasSupportReply: boolean }

export async function listStaffTickets(q: { status?: string; page?: number }): Promise<{ items: StaffTicketRow[]; hasMore: boolean }> {
  const filter: Record<string, unknown> = {};
  if (q.status && (TICKET_STATUSES as readonly string[]).includes(q.status)) filter.status = q.status;
  const docs = await (await ticketsCollection())
    .find(filter as never, { projection: { ticketReference: 1, subject: 1, status: 1, updatedAt: 1, lastSupportReplyAt: 1 } })
    .sort({ updatedAt: -1, _id: -1 })
    .skip((Math.max(1, Math.min(500, Math.floor(q.page ?? 1))) - 1) * PAGE)
    .limit(PAGE + 1)
    .toArray();
  return { hasMore: docs.length > PAGE, items: docs.slice(0, PAGE).map((d) => ({ reference: d.ticketReference, subject: d.subject, status: d.status, updatedAt: d.updatedAt.toISOString(), hasSupportReply: !!d.lastSupportReplyAt })) };
}

export interface StaffMessage { id: string; role: "buyer" | "support" | "system"; internal: boolean; body: string; at: string }
export interface StaffTicket { reference: string; subject: string; description: string; status: TicketStatus; allowedNext: TicketStatus[]; messages: StaffMessage[] }

export async function getStaffTicket(reference: string): Promise<StaffTicket | null> {
  if (!/^FBM-SUP-\d{6}-[A-Z0-9]{6}$/.test(reference)) return null;
  const t = await (await ticketsCollection()).findOne({ ticketReference: reference });
  if (!t?._id) return null;
  const msgs = await (await messagesCollection()).find({ ticketId: t._id }, { projection: { senderRole: 1, visibility: 1, body: 1, createdAt: 1 } }).sort({ createdAt: -1, _id: -1 }).limit(50).toArray();
  return {
    reference, subject: t.subject, description: t.description, status: t.status,
    allowedNext: TICKET_STATUSES.filter((s) => canTransition(t.status, s)),
    messages: msgs.reverse().map((m) => ({ id: String((m as MessageDoc & { _id: ObjectId })._id), role: m.senderRole, internal: m.visibility === "internal", body: m.body, at: m.createdAt.toISOString() })),
  };
}

export type StaffResult = { ok: true; status: TicketStatus; duplicate: boolean } | { ok: false; status: 404 | 409 | 422; message: string };

/** One staff action: a public reply, an internal note, or both with an approved status transition. Idempotent per (ticket, key). */
export async function staffAct(staffId: ObjectId, reference: string, input: { kind: "reply" | "note"; message: string; idempotencyKey: string; nextStatus?: string }): Promise<StaffResult> {
  const body = input.message.replace(/\r\n/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim();
  if (body.length < MSG_MIN || body.length > MSG_MAX) return { ok: false, status: 422, message: `Write between ${MSG_MIN} and ${MSG_MAX} characters.` };
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(input.idempotencyKey)) return { ok: false, status: 422, message: "A valid idempotencyKey is required." };
  const tickets = await ticketsCollection();
  const t = await tickets.findOne({ ticketReference: reference });
  if (!t?._id) return { ok: false, status: 404, message: "Ticket not found." };
  const msgs = await messagesCollection();
  const key = `staff:${createHash("sha256").update(`${staffId.toHexString()}:${input.idempotencyKey}`).digest("hex").slice(0, 32)}`;
  if (await msgs.findOne({ ticketId: t._id, idempotencyKey: key })) return { ok: true, status: t.status, duplicate: true };

  const to = input.nextStatus as TicketStatus | undefined;
  if (to && !canTransition(t.status, to)) return { ok: false, status: 409, message: "That status change is not allowed from the current status." };
  const now = new Date();
  try {
    await msgs.insertOne({ ticketId: t._id, ticketReference: reference, buyerId: t.buyerId, senderRole: "support", kind: "reply", visibility: input.kind === "note" ? "internal" : "buyer", body, attachments: [], idempotencyKey: key, authorStaffId: staffId, createdAt: now } as MessageDoc);
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return { ok: true, status: t.status, duplicate: true };
    throw e;
  }
  let status = t.status;
  const set: Record<string, unknown> = { updatedAt: now };
  if (input.kind === "reply") set.lastSupportReplyAt = now;
  if (to) {
    // conditional on the status we read: a change made meanwhile is never overwritten
    const upd = await tickets.updateOne({ _id: t._id, status: t.status }, { $set: { ...set, status: to, ...(to === "RESOLVED" ? { resolvedAt: now } : {}), ...(to === "CLOSED" ? { closedAt: now } : {}) }, $push: { events: { type: "STATUS_CHANGED", at: now, actor: "support", from: t.status, status: to } } });
    if (upd.modifiedCount === 1) status = to;
    else return { ok: false, status: 409, message: "The ticket changed while you were writing. Your message was saved; reload and set the status again." };
  } else {
    await tickets.updateOne({ _id: t._id }, { $max: { updatedAt: now }, ...(input.kind === "reply" ? { $set: { lastSupportReplyAt: now } } : {}) });
  }
  // a PUBLIC reply notifies a supplier-owned ticket in the portal (no message text in the notice); never for internal notes
  if (input.kind === "reply") {
    const owner = await (await getDb()).collection<{ _id: ObjectId; role?: string }>("users").findOne({ _id: t.buyerId }, { projection: { role: 1 } });
    if (owner?.role === "supplier") await notifySupplier(t.buyerId.toHexString(), { category: "system", type: "SUPPORT_REPLY", title: "Support replied to your ticket", body: `There is a new reply on ticket ${reference}.`, link: `/supplier/support/tickets/${reference}`, dedupeKey: `support:${reference}:${key}` });
  }
  return { ok: true, status, duplicate: false };
}
