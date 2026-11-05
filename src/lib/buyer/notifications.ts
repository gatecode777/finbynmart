import { ObjectId, type Collection, type Document, type Filter } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { categoryEnabled } from "./settings";
import { NOTIFICATION_RETENTION_DAYS, UNREAD_COUNT_CAP, MAX_BODY, MAX_TITLE, isSafeNotificationLink, type NotificationQuery } from "./notificationRules";
import type { NotificationCategory } from "./settingsRules";

/**
 * In-app notifications of one buyer (`notifications`). A notification exists only because a real event happened in this
 * application (see `PAGE_26_NOTIFICATION_EVENT_RULES.md`); nothing is generated for a guess, a schedule or a demo. Every read and
 * write names `buyerId` taken from the verified session, and a single id is always looked up together with it.
 *
 * Creation is idempotent: `dedupeKey` (one per real event, e.g. `inquiry:FBM-INQ-...`) is unique per buyer, so a retried or
 * duplicated event cannot create a second notice. Creating one can never fail the action that caused it.
 */
interface NotificationRow extends Document {
  _id: ObjectId;
  buyerId: ObjectId;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  link: string | null;
  dedupeKey: string;
  /** The read state used by every filter (an equality an index can sort after); readAt only says when. Always set together. */
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
  purgeAt: Date;
}

export interface NotificationDto {
  id: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

let indexReady: Promise<unknown> | undefined;
async function notificationsCollection(): Promise<Collection<NotificationRow>> {
  const col = (await getDb()).collection<NotificationRow>("notifications");
  // Every list is "this buyer, optionally one category, optionally read or unread, newest first": equality on the leading fields and the
  // sort fields last, so no query needs a sort stage. `_id` is the tie-breaker of the sort, so it is part of each index.
  indexReady ??= (async () => {
    for (const old of ["buyer_newest", "buyer_unread_newest", "buyer_category_newest"]) await col.dropIndex(old).catch(() => undefined); // earlier definitions without isRead/_id
    await Promise.all([
      col.createIndex({ buyerId: 1, createdAt: -1, _id: -1 }, { name: "nf_buyer_newest" }),
      col.createIndex({ buyerId: 1, isRead: 1, createdAt: -1, _id: -1 }, { name: "nf_buyer_status_newest" }),
      col.createIndex({ buyerId: 1, category: 1, createdAt: -1, _id: -1 }, { name: "nf_buyer_category_newest" }),
      col.createIndex({ buyerId: 1, category: 1, isRead: 1, createdAt: -1, _id: -1 }, { name: "nf_buyer_category_status_newest" }),
      col.createIndex({ buyerId: 1, dedupeKey: 1 }, { unique: true, name: "one_notification_per_event" }),
      col.createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0, name: "retention_ttl" }),
    ]);
  })();
  await indexReady;
  return col;
}

const toDto = (n: NotificationRow): NotificationDto => ({
  id: n._id.toString(),
  category: n.category,
  type: n.type,
  title: n.title,
  body: n.body,
  link: isSafeNotificationLink(n.link) ? n.link : null,
  read: n.isRead === true,
  readAt: n.readAt ? n.readAt.toISOString() : null,
  createdAt: n.createdAt.toISOString(),
});

export interface NewNotification {
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  /** One value per real event for this buyer (the reference, a document id, a session version...). */
  dedupeKey: string;
}

/**
 * Records a notification for a real event. Returns whether a new one was created (false: the buyer switched the category off,
 * it already existed, or storage failed). Never throws; logs only the event type, never any personal text.
 */
export async function notifyBuyer(buyerId: string, event: NewNotification): Promise<boolean> {
  try {
    if (!ObjectId.isValid(buyerId) || !(await categoryEnabled(buyerId, event.category))) return false;
    const link = event.link && isSafeNotificationLink(event.link) ? event.link : null;
    const col = await notificationsCollection();
    const now = new Date();
    await col.insertOne({
      _id: new ObjectId(),
      buyerId: new ObjectId(buyerId),
      category: event.category,
      type: event.type,
      title: event.title.slice(0, MAX_TITLE),
      body: event.body.slice(0, MAX_BODY),
      link,
      dedupeKey: event.dedupeKey.slice(0, 120),
      isRead: false,
      readAt: null,
      createdAt: now,
      purgeAt: new Date(now.getTime() + NOTIFICATION_RETENTION_DAYS * 86_400_000),
    });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) console.error("notification not recorded", event.type);
    return false;
  }
}

export interface NotificationList {
  notifications: NotificationDto[];
  unread: number;
  meta: { total: number; page: number; limit: number; totalPages: number };
}

function filterOf(buyerId: string, query: Pick<NotificationQuery, "category" | "status">): Filter<NotificationRow> {
  const filter: Filter<NotificationRow> = { buyerId: new ObjectId(buyerId) };
  if (query.category !== "all") filter.category = query.category;
  if (query.status === "unread") filter.isRead = false;
  if (query.status === "read") filter.isRead = true;
  return filter;
}

export async function listNotifications(buyerId: string, query: NotificationQuery): Promise<NotificationList> {
  const col = await notificationsCollection();
  const filter = filterOf(buyerId, query);
  const [rows, total, unread] = await Promise.all([
    col.find(filter).sort({ createdAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).toArray(),
    col.countDocuments(filter),
    countUnread(buyerId),
  ]);
  return { notifications: rows.map(toDto), unread, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
}

/** Unread notifications of the buyer, counted up to UNREAD_COUNT_CAP (the badge shows "99+" beyond). */
export async function countUnread(buyerId: string): Promise<number> {
  const col = await notificationsCollection();
  return col.countDocuments({ buyerId: new ObjectId(buyerId), isRead: false }, { limit: UNREAD_COUNT_CAP });
}

/** Marks one notification of this buyer as read. null when it is not theirs or does not exist (the same answer for both). Idempotent. */
export async function markRead(buyerId: string, id: string): Promise<{ notification: NotificationDto; unread: number } | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await notificationsCollection();
  const _id = new ObjectId(id);
  const owner = new ObjectId(buyerId);
  await col.updateOne({ _id, buyerId: owner, isRead: false }, { $set: { isRead: true, readAt: new Date() } });
  const row = await col.findOne({ _id, buyerId: owner });
  return row ? { notification: toDto(row), unread: await countUnread(buyerId) } : null;
}

/** The most notifications one "mark all as read" request changes. Measured on the test cluster: about 65 ms to find a batch and 90 ms to update 250 rows (four indexes are rewritten for every row), so a bigger batch would not stay under the 500 ms write target. The rest is done by repeating the request while `more` is true. */
export const MARK_ALL_BATCH = 200;

/**
 * Marks up to MARK_ALL_BATCH unread notifications of the buyer (optionally of one category), newest first, as read. Returns how many
 * changed, whether more unread ones of that filter remain (the caller repeats), and the buyer's unread count.
 */
export async function markAllRead(buyerId: string, category: NotificationQuery["category"]): Promise<{ changed: number; more: boolean; unread: number }> {
  const col = await notificationsCollection();
  const filter = filterOf(buyerId, { category, status: "unread" });
  const ids = (await col.find(filter, { projection: { _id: 1 } }).sort({ createdAt: -1 }).limit(MARK_ALL_BATCH).toArray()).map((row) => row._id);
  let changed = 0;
  if (ids.length > 0) changed = (await col.updateMany({ _id: { $in: ids }, buyerId: new ObjectId(buyerId), isRead: false }, { $set: { isRead: true, readAt: new Date() } }, { hint: { _id: 1 } })).modifiedCount;
  // a full batch means there may be more (at worst one extra, empty request); an unsorted lookup here would scan the already-read rows
  const more = ids.length === MARK_ALL_BATCH;
  return { changed, more, unread: await countUnread(buyerId) };
}

// ---------- the real events (one place, so the wording and dedupe keys are reviewable) ----------

export const notifyInquirySubmitted = (buyerId: string, reference: string, supplierName: string) =>
  notifyBuyer(buyerId, { category: "inquiries", type: "INQUIRY_SUBMITTED", title: "Inquiry saved", body: `Your inquiry ${reference} to ${supplierName} was saved. The supplier is not notified automatically yet, so no reply can be expected through this site.`, link: "/buyer/inquiries", dedupeKey: `inquiry:${reference}` });

export const notifyDocumentUploaded = (buyerId: string, documentId: string, documentLabel: string, replaced: boolean) =>
  notifyBuyer(buyerId, { category: "company", type: replaced ? "DOCUMENT_REPLACED" : "DOCUMENT_UPLOADED", title: replaced ? "Company document replaced" : "Company document uploaded", body: `${documentLabel} was ${replaced ? "replaced" : "uploaded"}. Its status is Pending: no review process exists yet, so it is not verified.`, link: "/buyer/profile?tab=documents", dedupeKey: `document:${documentId}` });

export const notifyTicketCreated = (buyerId: string, reference: string, subject: string) =>
  notifyBuyer(buyerId, { category: "support", type: "TICKET_CREATED", title: "Support ticket raised", body: `Your ticket ${reference} was saved (${subject.slice(0, 80)}). No support team replies through this site yet, so keep the reference.`, link: `/buyer/support/tickets/${reference}`, dedupeKey: `ticket:${reference}` });

export const notifyPasswordChanged = (buyerId: string, sessionVersion: number) =>
  notifyBuyer(buyerId, { category: "account", type: "PASSWORD_CHANGED", title: "Password changed", body: "Your password was changed and your other devices were signed out. If this was not you, contact support.", link: "/buyer/settings?tab=settings", dedupeKey: `password:${sessionVersion}` });

export const notifySignedOutEverywhere = (buyerId: string, sessionVersion: number) =>
  notifyBuyer(buyerId, { category: "account", type: "SIGNED_OUT_EVERYWHERE", title: "Signed out of all devices", body: "You signed out of every device. Other devices must sign in again.", link: "/buyer/settings?tab=settings", dedupeKey: `signout:${sessionVersion}` });
