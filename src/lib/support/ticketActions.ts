import { ObjectId } from "mongodb";
import { formatSubmitted } from "@/lib/inquiries/confirmation";
import { feedbackState, reopenState } from "./conversationRules";
import { alertSupportOfReply, feedbackCollection, loadOwnTicket, messagesCollection, reopenCountOf, resolvedAtOf, type MessageDoc } from "./conversationService";
import { ticketsCollection } from "./ticketService";
import { STATUS_LABEL, type TicketStatus, canTransition } from "./ticketRules";

/**
 * The buyer's two actions on a resolved or closed ticket (Page 37): reopen it and give feedback. Both name the buyer from the session,
 * both are decided by the policy functions in conversationRules.ts (never by anything the browser sends), and both report success only
 * after the database holds the result. A buyer can never set any other status: reopening is the single transition a buyer performs, and
 * it is checked against the same transition table a support side will use.
 */
export type ReopenOutcome =
  | { ok: true; status: TicketStatus; statusLabel: string; updatedLabel: string }
  | { ok: false; code: "NOT_FOUND" | "NOT_ELIGIBLE" | "CONFLICT"; message: string };

const isDuplicateKey = (e: unknown) => (e as { code?: number }).code === 11000;

export async function reopenBuyerTicket(buyer: { id: string; name: string; email: string }, reference: string, reason: string, now = new Date()): Promise<ReopenOutcome> {
  const t = await loadOwnTicket(buyer.id, reference);
  if (!t) return { ok: false, code: "NOT_FOUND", message: "That ticket was not found." };
  const reopens = reopenCountOf(t);
  const state = reopenState(t.status, resolvedAtOf(t) ?? t.updatedAt, reopens, now);
  if (!state.allowed || !canTransition(t.status, "REOPENED")) return { ok: false, code: "NOT_ELIGIBLE", message: state.reason ?? "This ticket cannot be reopened." };

  // The reason is saved first under a key that exists once per reopening: two simultaneous requests cannot both pass. If the status
  // change then loses a race, the reason is removed again, so nothing is half done.
  const messages = await messagesCollection();
  const doc: MessageDoc = { ticketId: t._id, ticketReference: t.ticketReference, buyerId: t.buyerId, senderRole: "buyer", kind: "reopen", visibility: "buyer", body: reason, attachments: [], idempotencyKey: `reopen-${reopens + 1}`, createdAt: now };
  let messageId: ObjectId;
  try {
    messageId = (await messages.insertOne(doc)).insertedId;
  } catch (error) {
    if (isDuplicateKey(error)) return { ok: false, code: "CONFLICT", message: "This ticket was just reopened." };
    throw error;
  }

  const from = t.status;
  const res = await (await ticketsCollection()).updateOne(
    { _id: t._id, buyerId: t.buyerId, status: from },
    { $set: { status: "REOPENED", updatedAt: now }, $unset: { resolvedAt: "", closedAt: "" }, $push: { events: { type: "REOPENED", at: now, actor: "buyer", from, status: "REOPENED" } } },
  );
  if (res.modifiedCount !== 1) {
    await messages.deleteOne({ _id: messageId }).catch(() => undefined);
    return { ok: false, code: "CONFLICT", message: "This ticket changed while you were reopening it. Reload the page and check its status." };
  }
  void alertSupportOfReply({ ...doc, _id: messageId }, t.ticketReference, buyer, "A buyer reopened");
  return { ok: true, status: "REOPENED", statusLabel: STATUS_LABEL.REOPENED, updatedLabel: formatSubmitted(now.toISOString()) };
}

export type FeedbackOutcome =
  | { ok: true; rating: number; submittedLabel: string }
  | { ok: false; code: "NOT_FOUND" | "NOT_ELIGIBLE" | "ALREADY_SUBMITTED"; message: string };

/** One feedback per ticket (a unique index): a second one, from a double click or a race, is refused and the first is kept. */
export async function submitBuyerFeedback(buyer: { id: string }, reference: string, input: { rating: number; feedbackText: string }, now = new Date()): Promise<FeedbackOutcome> {
  const t = await loadOwnTicket(buyer.id, reference);
  if (!t) return { ok: false, code: "NOT_FOUND", message: "That ticket was not found." };
  const col = await feedbackCollection();
  const existing = await col.findOne({ ticketId: t._id }, { projection: { _id: 1 } });
  const state = feedbackState(t.status, Boolean(existing));
  if (!state.allowed) return { ok: false, code: existing ? "ALREADY_SUBMITTED" : "NOT_ELIGIBLE", message: state.reason ?? "Feedback cannot be sent for this ticket." };
  try {
    await col.insertOne({ ticketId: t._id, ticketReference: t.ticketReference, buyerId: t.buyerId, rating: input.rating, feedbackText: input.feedbackText, createdAt: now });
  } catch (error) {
    if (isDuplicateKey(error)) return { ok: false, code: "ALREADY_SUBMITTED", message: "You already sent feedback for this ticket." };
    throw error;
  }
  await (await ticketsCollection()).updateOne({ _id: t._id }, { $push: { events: { type: "FEEDBACK_SUBMITTED", at: now, actor: "buyer" } } });
  return { ok: true, rating: input.rating, submittedLabel: formatSubmitted(now.toISOString()) };
}
