import { ObjectId, type Collection, type Document } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { DEFAULT_SETTINGS, type BuyerSettingsValue, type NotificationCategory, REQUIRED_CATEGORIES } from "./settingsRules";

/**
 * One settings document per buyer (`buyer_settings`, unique on `buyerId`). It is a separate collection, not fields on `users`,
 * because `users` holds credentials and session state and is read on every request: settings change independently, are saved
 * with their own version, and a failed or racing settings save can never touch the account. A buyer who never saved has no
 * document: the defaults apply and the version is 0.
 */
interface SettingsRow extends Document {
  buyerId: ObjectId;
  notifications: { inquiries: boolean; company: boolean };
  dashboardRange: BuyerSettingsValue["dashboardRange"];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SettingsDto extends BuyerSettingsValue {
  version: number;
  updatedAt: string | null;
}

let indexReady: Promise<unknown> | undefined;
async function settingsCollection(): Promise<Collection<SettingsRow>> {
  const col = (await getDb()).collection<SettingsRow>("buyer_settings");
  indexReady ??= col.createIndex({ buyerId: 1 }, { unique: true, name: "one_settings_per_buyer" });
  await indexReady;
  return col;
}

const toDto = (row: SettingsRow | null): SettingsDto =>
  row ? { notifications: { inquiries: row.notifications.inquiries !== false, company: row.notifications.company !== false }, dashboardRange: row.dashboardRange, version: row.version, updatedAt: row.updatedAt.toISOString() } : { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications }, version: 0, updatedAt: null };

export async function getBuyerSettings(buyerId: string): Promise<SettingsDto> {
  const col = await settingsCollection();
  return toDto(await col.findOne({ buyerId: new ObjectId(buyerId) }));
}

/** Whether a notification of this category should be created for the buyer (required categories always are). One indexed read. */
export async function categoryEnabled(buyerId: string, category: NotificationCategory): Promise<boolean> {
  if (REQUIRED_CATEGORIES.includes(category)) return true;
  const col = await settingsCollection();
  const row = await col.findOne({ buyerId: new ObjectId(buyerId) }, { projection: { notifications: 1 } });
  if (!row) return true;
  return (row.notifications as Record<string, boolean>)[category] !== false;
}

export type SaveResult = { ok: true; settings: SettingsDto } | { ok: false; code: "CONFLICT" };

/** Saves all settings. Version 0 creates the document (a racing second create loses to the unique index); otherwise the version must match. */
export async function saveBuyerSettings(buyerId: string, value: BuyerSettingsValue, version: number): Promise<SaveResult> {
  const col = await settingsCollection();
  const owner = new ObjectId(buyerId);
  const now = new Date();
  if (version === 0) {
    try {
      await col.insertOne({ buyerId: owner, notifications: value.notifications, dashboardRange: value.dashboardRange, version: 1, createdAt: now, updatedAt: now } as SettingsRow);
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return { ok: false, code: "CONFLICT" };
      throw error;
    }
    return { ok: true, settings: toDto(await col.findOne({ buyerId: owner })) };
  }
  const updated = await col.findOneAndUpdate({ buyerId: owner, version }, { $set: { notifications: value.notifications, dashboardRange: value.dashboardRange, updatedAt: now }, $inc: { version: 1 } }, { returnDocument: "after" });
  return updated ? { ok: true, settings: toDto(updated) } : { ok: false, code: "CONFLICT" };
}
