import type { Collection, ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { notifyBuyer, type NewNotification } from "@/lib/buyer/notifications";
import { categoryEnabled } from "@/lib/buyer/settings";
import type { SupplierContext } from "./company";

/**
 * The supplier side's notification outbox (collection `notification_outbox`). One mechanism for every supplier action that must tell a buyer (a
 * quotation submitted, an inquiry response, a clarification question, later a revision or withdrawal): the row is written INSIDE the transaction that
 * records the action, so the action and "a notice is owed" commit or roll back together; the in-app notice itself is sent AFTER the commit, once.
 *
 * Facts kept apart: the action's success (its own record), the notice's delivery (this row's status: PENDING -> DONE, SKIPPED_PREFERENCE when the buyer
 * switched the category off, NOT_RECORDED after 3 failed attempts) and e-mail (never sent: no e-mail service exists, so nothing here claims it).
 * A failure to deliver never repeats or undoes the action. Recovery: `retryPendingNotices` runs when the supplier next opens a list page; a scheduled
 * processor would make delivery independent of a supplier returning (BLOCKED: no scheduler exists in this project).
 * `dedupeKey` is unique, so a retried action cannot owe two notices; the buyer notification is deduplicated again by the same key.
 */
export type OutboxType = "QUOTATION_SUBMITTED" | "QUOTATION_REVISED" | "QUOTATION_WITHDRAWN" | "INQUIRY_RESPONSE" | "INQUIRY_CLARIFICATION";
export const MAX_OUTBOX_ATTEMPTS = 3;

export interface OutboxRow {
  _id: ObjectId;
  type: OutboxType;
  supplierCompanyId: ObjectId;
  buyerId: ObjectId;
  dedupeKey: string;
  status: "PENDING" | "DONE" | "SKIPPED_PREFERENCE" | "NOT_RECORDED";
  attempts: number;
  createdAt: Date;
  supplierName: string;
  inquiryReference: string;
  /** Quotation notices */
  quotationReference?: string;
  version?: number;
  totalText?: string;
  /** Withdrawal: the supplier's optional reason, shown to the buyer. */
  reason?: string;
}

let indexReady: Promise<unknown> | undefined;
export async function outboxCollection(): Promise<Collection<OutboxRow>> {
  const col = (await getDb()).collection<OutboxRow>("notification_outbox");
  indexReady ??= Promise.all([
    col.createIndex({ dedupeKey: 1 }, { unique: true, name: "outbox_dedupe" }),
    col.createIndex({ supplierCompanyId: 1, status: 1, createdAt: 1 }, { name: "outbox_company_status" }),
  ]).catch((error) => {
    indexReady = undefined;
    throw error;
  });
  await indexReady;
  return col;
}

function notificationFor(item: OutboxRow): NewNotification {
  switch (item.type) {
    case "QUOTATION_SUBMITTED":
      return {
        category: "inquiries",
        type: "QUOTATION_RECEIVED",
        title: "New quotation received",
        body: `${item.supplierName} sent quotation ${item.quotationReference} for your inquiry ${item.inquiryReference}: total ${item.totalText}.`.slice(0, 400),
        link: `/buyer/quotations/${item.quotationReference}`,
        dedupeKey: item.dedupeKey,
      };
    case "QUOTATION_REVISED":
      return {
        category: "inquiries",
        type: "QUOTATION_REVISED",
        title: "A quotation was revised",
        body: `${item.supplierName} sent version ${item.version} of quotation ${item.quotationReference} for your inquiry ${item.inquiryReference}: total ${item.totalText}. The earlier version is no longer the current offer.`.slice(0, 400),
        link: `/buyer/quotations/${item.quotationReference}`,
        dedupeKey: item.dedupeKey,
      };
    case "QUOTATION_WITHDRAWN":
      return {
        category: "inquiries",
        type: "QUOTATION_WITHDRAWN",
        title: "Quotation withdrawn",
        body: `${item.supplierName} withdrew quotation ${item.quotationReference} for inquiry ${item.inquiryReference}.${item.reason ? ` Reason given: ${item.reason}` : ""}`.slice(0, 400),
        link: `/buyer/quotations/${item.quotationReference}`,
        dedupeKey: item.dedupeKey,
      };
    case "INQUIRY_RESPONSE":
      // the message text is NOT put in the notice: only that a reply exists and where to read it
      return { category: "inquiries", type: "INQUIRY_RESPONSE", title: "A supplier replied to your inquiry", body: `${item.supplierName} replied to your inquiry ${item.inquiryReference}. Open the inquiry to read the response.`.slice(0, 400), link: `/buyer/inquiries/${item.inquiryReference}`, dedupeKey: item.dedupeKey };
    case "INQUIRY_CLARIFICATION":
      return { category: "inquiries", type: "INQUIRY_CLARIFICATION", title: "A supplier asked you a question", body: `${item.supplierName} asked for clarification on your inquiry ${item.inquiryReference}. Open the inquiry to read the question.`.slice(0, 400), link: `/buyer/inquiries/${item.inquiryReference}`, dedupeKey: item.dedupeKey };
  }
}

export type NoticeState = "recorded" | "pending" | "not-recorded";

export async function noticeState(dedupeKey: string): Promise<NoticeState> {
  const row = await (await outboxCollection()).findOne({ dedupeKey }, { projection: { status: 1 } });
  return row?.status === "DONE" ? "recorded" : row?.status === "PENDING" ? "pending" : "not-recorded";
}

/** Sends the buyer's in-app notice for one outbox row (once). Never throws and never affects the action it belongs to. */
export async function deliverOutbox(id: ObjectId): Promise<boolean> {
  try {
    const outbox = await outboxCollection();
    const item = await outbox.findOneAndUpdate({ _id: id, status: "PENDING", attempts: { $lt: MAX_OUTBOX_ATTEMPTS } }, { $inc: { attempts: 1 }, $set: { lastAttemptAt: new Date() } as never }, { returnDocument: "after" });
    if (!item) return false;
    // a buyer who switched inquiry notices off gets none: a final, honest "not recorded", not something to queue and retry
    if (!(await categoryEnabled(String(item.buyerId), "inquiries"))) {
      await outbox.updateOne({ _id: id }, { $set: { status: "SKIPPED_PREFERENCE" } });
      return false;
    }
    const ok = await notifyBuyer(String(item.buyerId), notificationFor(item));
    if (ok) await outbox.updateOne({ _id: id }, { $set: { status: "DONE", deliveredAt: new Date() } as never });
    else if ((item.attempts ?? 0) >= MAX_OUTBOX_ATTEMPTS) await outbox.updateOne({ _id: id }, { $set: { status: "NOT_RECORDED" } });
    return ok;
  } catch {
    console.error("notification outbox delivery failed");
    return false;
  }
}

/** Picks up notices that were not delivered right after their action (a crash or error between commit and delivery). Bounded; called from list pages. */
export async function retryPendingNotices(context: SupplierContext, limit = 5): Promise<number> {
  const outbox = await outboxCollection();
  const pending = await outbox.find({ supplierCompanyId: context.companyId, status: "PENDING", attempts: { $lt: MAX_OUTBOX_ATTEMPTS } }, { projection: { _id: 1 } }).sort({ createdAt: 1 }).limit(limit).toArray();
  let n = 0;
  for (const p of pending) if (await deliverOutbox(p._id)) n++;
  return n;
}
