import { ObjectId, type ClientSession, type Collection, type Document } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import type { AdminCapability } from "./permissions";
import { EVENT_TYPES, capabilityOf, destinationOf, eventKey, eventOf, splitKey, visibleTypes, type EventType, type NotificationQuery } from "./notificationRules";

/**
 * Admin Notifications (Page 62). Extends nothing foreign: its own three small collections.
 *  - `admin_notifications`: ONE event per real workflow event (unique `sourceKey`), holding only the type, the capability required to see it, the record reference and the recorded time.
 *    Written by `recordAdminEvent` INSIDE the producing workflow's own transaction, so an event exists exactly when the business write committed: a rolled-back write leaves none, a retry
 *    of the same submission cannot add a second (the upsert is a no-op on the same key), and no GET ever creates one. No worker or scheduler is involved.
 *  - `admin_notification_reads`: one receipt per (admin, event): the personal read state. One admin reading an event changes nothing for another.
 *  - `admin_notification_state`: one document per admin holding the mark-all cutoff `readKey` (a sortable key of the newest event that existed and was authorized when "Mark all as read" ran).
 * An event is UNREAD for an admin when the admin currently holds its capability AND its key is above that admin's cutoff AND no receipt exists. Permissions are re-read on every request, so a
 * revoked capability removes its events from the list and the count at once; a newly granted capability makes the existing events of that type visible (no copy or backfill exists) and unread
 * unless they are at or below the cutoff.
 */
interface EventDoc { _id: ObjectId; type: EventType; sourceKey: string; capability: AdminCapability; reference: string; recordedAt: Date }
interface ReceiptDoc { _id: ObjectId; adminId: ObjectId; eventId: ObjectId; capability: AdminCapability; recordedAt: Date; readAt: Date }
interface StateDoc { _id: ObjectId; readKey?: string; updatedAt?: Date; /** Event types this admin has chosen to hide from their own inbox (Page 64). Default: none. */ muted?: EventType[]; mutedAt?: Date }

let indexReady: Promise<unknown> | undefined;
async function cols() {
  const db = await getDb();
  const events = db.collection<EventDoc>("admin_notifications");
  const reads = db.collection<ReceiptDoc>("admin_notification_reads");
  const state = db.collection<StateDoc>("admin_notification_state");
  indexReady ??= Promise.all([
    events.createIndex({ sourceKey: 1 }, { unique: true, name: "admin_event_source_unique" }),
    events.createIndex({ capability: 1, recordedAt: -1, _id: -1 }, { name: "admin_event_newest" }),
    reads.createIndex({ adminId: 1, eventId: 1 }, { unique: true, name: "admin_read_unique" }),
    reads.createIndex({ adminId: 1, capability: 1, recordedAt: -1, eventId: -1 }, { name: "admin_read_scope" }),
  ]).catch((e) => { indexReady = undefined; throw e; });
  await indexReady;
  return { events, reads, state };
}

/**
 * Called by a producer with its transaction session. Idempotent on `sourceKey` (a retry of the same real event is a no-op) and free of any user-authored text. Pass the producer's session so
 * the event commits or aborts together with the business write.
 */
export async function recordAdminEvent(session: ClientSession | undefined, input: { type: EventType; sourceKey: string; reference: string }, now = new Date()): Promise<void> {
  const { events } = await cols();
  await events.updateOne(
    { sourceKey: input.sourceKey },
    { $setOnInsert: { _id: new ObjectId(), type: input.type, sourceKey: input.sourceKey, capability: capabilityOf(input.type), reference: input.reference.slice(0, 60), recordedAt: now } },
    { upsert: true, ...(session ? { session } : {}) },
  );
}

const bound = (readKey: string | null): Document | null => {
  if (!readKey) return null;
  const { ms, id } = splitKey(readKey);
  return { $or: [{ recordedAt: { $gt: new Date(ms) } }, { recordedAt: new Date(ms), _id: { $gt: new ObjectId(id) } }] };
};
const boundReceipts = (readKey: string | null): Document | null => {
  if (!readKey) return null;
  const { ms, id } = splitKey(readKey);
  return { $or: [{ recordedAt: { $gt: new Date(ms) } }, { recordedAt: new Date(ms), eventId: { $gt: new ObjectId(id) } }] };
};
const and = (...parts: (Document | null)[]): Document => { const p = parts.filter(Boolean) as Document[]; return p.length === 1 ? p[0] : { $and: p }; };

/** The event types this admin sees: those whose capability is held NOW, minus the categories they chose to hide (a personal inbox preference: it never stops an event being recorded and never grants anything). */
async function allowedTypes(admin: ObjectId, permissions: readonly AdminCapability[]): Promise<EventType[]> {
  const types = visibleTypes(permissions);
  if (types.length === 0) return types;
  const { state } = await cols();
  const muted = (await state.findOne({ _id: admin }, { projection: { muted: 1 } }))?.muted ?? [];
  return types.filter((t) => !muted.includes(t));
}

async function cutoffOf(admin: ObjectId): Promise<string | null> {
  const { state } = await cols();
  return (await state.findOne({ _id: admin }, { projection: { readKey: 1 } }))?.readKey ?? null;
}

/** The unread count under the SAME authorization and read rules as the list: authorized events above the cutoff, minus this admin's receipts for such events. Independent of any tab or type filter. */
export async function unreadCount(admin: ObjectId, permissions: readonly AdminCapability[]): Promise<number> {
  const types = await allowedTypes(admin, permissions);
  if (types.length === 0) return 0;
  const { events, reads } = await cols();
  const caps = types.map(capabilityOf);
  const cut = await cutoffOf(admin);
  const [total, read] = await Promise.all([
    events.countDocuments(and({ capability: { $in: caps } }, bound(cut))),
    reads.countDocuments(and({ adminId: admin, capability: { $in: caps } }, boundReceipts(cut))),
  ]);
  return Math.max(0, total - read);
}

export interface NotificationItem { id: string; type: EventType; label: string; title: string; description: string; linkLabel: string; link: string; occurredAt: string; read: boolean }
export interface NotificationPage { items: NotificationItem[]; nextCursor: string | null; unreadCount: number; supportedTypes: { key: EventType; label: string }[] }

function toItem(d: EventDoc, read: boolean): NotificationItem {
  const e = eventOf(d.type)!;
  return { id: d._id.toHexString(), type: d.type, label: e.label, title: e.title, description: e.description, linkLabel: e.linkLabel, link: destinationOf(d.type, d.reference), occurredAt: d.recordedAt.toISOString(), read };
}

/** One bounded page, newest first (recorded time, then id), authorized by the CURRENT permissions. Unread tab: events above the cutoff with no receipt (receipts joined for that page only). */
export async function listNotifications(admin: ObjectId, permissions: readonly AdminCapability[], q: NotificationQuery): Promise<NotificationPage> {
  const types = await allowedTypes(admin, permissions);
  const supportedTypes = EVENT_TYPES.filter((e) => types.includes(e.key)).map((e) => ({ key: e.key, label: e.label }));
  const unread = await unreadCount(admin, permissions);
  if (types.length === 0) return { items: [], nextCursor: null, unreadCount: 0, supportedTypes };
  const { events, reads } = await cols();
  const cut = await cutoffOf(admin);
  const wanted = q.type === "all" ? types : types.filter((t) => t === q.type);
  if (wanted.length === 0) return { items: [], nextCursor: null, unreadCount: unread, supportedTypes };
  const cursorCond: Document | null = q.cursor ? { $or: [{ recordedAt: { $lt: new Date(q.cursor.ms) } }, { recordedAt: new Date(q.cursor.ms), _id: { $lt: new ObjectId(q.cursor.id) } }] } : null;
  const match = and({ type: { $in: wanted }, capability: { $in: wanted.map(capabilityOf) } }, cursorCond, q.tab === "unread" ? bound(cut) : null);
  let rows: EventDoc[];
  let readIds = new Set<string>();
  if (q.tab === "unread") {
    rows = await events.aggregate<EventDoc>([
      { $match: match }, { $sort: { recordedAt: -1, _id: -1 } },
      { $lookup: { from: "admin_notification_reads", let: { id: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$eventId", "$$id"] }, { $eq: ["$adminId", admin] }] } } }, { $project: { _id: 1 } }], as: "r" } },
      { $match: { r: { $size: 0 } } }, { $limit: q.limit + 1 }, { $project: { r: 0 } },
    ]).toArray();
  } else {
    rows = await events.find(match).sort({ recordedAt: -1, _id: -1 }).limit(q.limit + 1).toArray();
    const ids = rows.slice(0, q.limit).map((r) => r._id);
    if (ids.length) readIds = new Set((await reads.find({ adminId: admin, eventId: { $in: ids } }, { projection: { eventId: 1 } }).toArray()).map((r) => r.eventId.toHexString()));
  }
  const page = rows.slice(0, q.limit);
  const cutParts = cut ? splitKey(cut) : null;
  const isRead = (d: EventDoc) => q.tab === "unread" ? false : readIds.has(d._id.toHexString()) || (cutParts !== null && (d.recordedAt.getTime() < cutParts.ms || (d.recordedAt.getTime() === cutParts.ms && d._id.toHexString() <= cutParts.id)));
  const last = page[page.length - 1];
  return { items: page.map((d) => toItem(d, isRead(d))), nextCursor: rows.length > q.limit && last ? `${last.recordedAt.getTime()}_${last._id.toHexString()}` : null, unreadCount: unread, supportedTypes };
}

export type MarkResult = { ok: true; unreadCount: number } | { ok: false; status: 404 };

/** One personal receipt: idempotent (`$setOnInsert`, server time), only for an event the admin is CURRENTLY authorized to see; unknown, malformed and unauthorized ids are the same 404. */
export async function markRead(admin: ObjectId, permissions: readonly AdminCapability[], eventId: string, now = new Date()): Promise<MarkResult> {
  const { events, reads } = await cols();
  const types = await allowedTypes(admin, permissions);
  const ev = types.length && ObjectId.isValid(eventId) ? await events.findOne({ _id: new ObjectId(eventId), type: { $in: types }, capability: { $in: types.map(capabilityOf) } }) : null;
  if (!ev) return { ok: false, status: 404 };
  await reads.updateOne({ adminId: admin, eventId: ev._id }, { $setOnInsert: { _id: new ObjectId(), adminId: admin, eventId: ev._id, capability: ev.capability, recordedAt: ev.recordedAt, readAt: now } }, { upsert: true });
  return { ok: true, unreadCount: await unreadCount(admin, permissions) };
}

/**
 * "Mark all currently authorized notifications as read": the cutoff is the key of the NEWEST event that exists and is authorized at this moment (a server-side read), stored with `$max` so it
 * only moves forward and a repeat is a no-op. Events recorded after that key stay unread. It is this admin's cutoff only and is independent of any tab or type filter. A concurrent insert with
 * the same millisecond and a smaller id than the cutoff event would count as read (accepted, documented).
 */
export async function markAllRead(admin: ObjectId, permissions: readonly AdminCapability[]): Promise<{ unreadCount: number }> {
  const types = await allowedTypes(admin, permissions);
  if (types.length) {
    const { events, state } = await cols();
    const newest = await events.find({ capability: { $in: types.map(capabilityOf) } }, { projection: { recordedAt: 1 } }).sort({ recordedAt: -1, _id: -1 }).limit(1).toArray();
    if (newest[0]) await state.updateOne({ _id: admin }, { $max: { readKey: eventKey(newest[0].recordedAt.getTime(), newest[0]._id.toHexString()) }, $set: { updatedAt: new Date() } }, { upsert: true });
  }
  return { unreadCount: await unreadCount(admin, permissions) };
}

export interface NotificationCategory { key: EventType; label: string; description: string; enabled: boolean }

/** The categories this admin may see (capability held now) with their personal on/off state. Default: all on. */
export async function getPreferences(admin: ObjectId, permissions: readonly AdminCapability[]): Promise<NotificationCategory[]> {
  const { state } = await cols();
  const muted = (await state.findOne({ _id: admin }, { projection: { muted: 1 } }))?.muted ?? [];
  return EVENT_TYPES.filter((e) => visibleTypes(permissions).includes(e.key)).map((e) => ({ key: e.key, label: e.label, description: e.description, enabled: !muted.includes(e.key) }));
}

export type PrefResult = { ok: true; categories: NotificationCategory[]; unreadCount: number } | { ok: false; fields: Record<string, string> };

/**
 * Saves THIS admin's choice of which categories to show in their own inbox, list, unread count and header bell. Only categories whose capability is held now can be named (anything else is refused:
 * a preference never grants access); the state of a category the admin does not currently hold is left as it was. Nothing is deleted or marked read, events keep being recorded for everyone, and
 * turning a category back on shows its existing events again with their receipts and cutoff unchanged. No category is mandatory.
 */
export async function savePreferences(admin: ObjectId, permissions: readonly AdminCapability[], enabled: unknown): Promise<PrefResult> {
  const authorized = visibleTypes(permissions);
  if (!Array.isArray(enabled) || enabled.some((k) => typeof k !== "string") || new Set(enabled).size !== enabled.length) return { ok: false, fields: { categories: "Send the list of categories to show." } };
  const bad = (enabled as string[]).filter((k) => !authorized.includes(k as EventType));
  if (bad.length) return { ok: false, fields: { categories: "One of these categories is not available to you." } };
  const { state } = await cols();
  const prev = (await state.findOne({ _id: admin }, { projection: { muted: 1 } }))?.muted ?? [];
  const muted = [...prev.filter((t) => !authorized.includes(t)), ...authorized.filter((t) => !(enabled as string[]).includes(t))];
  await state.updateOne({ _id: admin }, { $set: { muted, mutedAt: new Date() } }, { upsert: true });
  return { ok: true, categories: await getPreferences(admin, permissions), unreadCount: await unreadCount(admin, permissions) };
}

export type { Collection };
