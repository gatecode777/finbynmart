import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { CATEGORY_PREF, DEFAULT_SUPPLIER_SETTINGS, PREF_KEYS, PREF_META, type PrefKey, type SupplierNotificationSettings } from "./settingsRules";

export { DEFAULT_SUPPLIER_SETTINGS };
export type { SupplierNotificationSettings };

type UserDoc = { _id: ObjectId; supplierSettings?: Partial<SupplierNotificationSettings> & { revision?: number } };
const users = async () => (await getDb()).collection<UserDoc>("users");

export interface SettingsView {
  settings: SupplierNotificationSettings;
  /** 0 until the first save. The next save must send it back. */
  revision: number;
}

export async function getSupplierSettingsView(userId: string): Promise<SettingsView> {
  if (!ObjectId.isValid(userId)) return { settings: DEFAULT_SUPPLIER_SETTINGS, revision: 0 };
  const u = await (await users()).findOne({ _id: new ObjectId(userId) }, { projection: { supplierSettings: 1 } });
  const s = u?.supplierSettings ?? {};
  const settings = { ...DEFAULT_SUPPLIER_SETTINGS };
  for (const k of PREF_KEYS) if (typeof s[k] === "boolean") settings[k] = s[k] as boolean;
  return { settings, revision: s.revision ?? 0 };
}

export const getSupplierSettings = async (userId: string) => (await getSupplierSettingsView(userId)).settings;

export type UpdateResult = { ok: true; view: SettingsView } | { ok: false; status: 404 | 409 | 422; message: string };

/** Revision-guarded and allow-listed. Only preferences whose notice source really exists may be changed. */
export async function updateSupplierSettings(userId: string, expectedRevision: number, patch: Record<string, unknown>): Promise<UpdateResult> {
  if (!ObjectId.isValid(userId)) return { ok: false, status: 404, message: "Account not found." };
  const keys = Object.keys(patch);
  if (keys.length === 0) return { ok: false, status: 422, message: "Nothing to change." };
  const set: Record<string, boolean> = {};
  for (const k of keys) {
    if (!(PREF_KEYS as string[]).includes(k)) return { ok: false, status: 422, message: `Unknown setting: ${k.slice(0, 30)}.` };
    const meta = PREF_META.find((m) => m.key === k)!;
    if (!meta.available) return { ok: false, status: 422, message: `${meta.label} cannot be changed: ${meta.reason}` };
    if (typeof patch[k] !== "boolean") return { ok: false, status: 422, message: `${meta.label} must be on or off.` };
    set[`supplierSettings.${k}`] = patch[k] as boolean;
  }
  const col = await users();
  // one atomic conditional update: a stale revision matches nothing
  const filter =
    expectedRevision === 0
      ? { _id: new ObjectId(userId), $or: [{ "supplierSettings.revision": { $exists: false } }, { "supplierSettings.revision": 0 }] }
      : { _id: new ObjectId(userId), "supplierSettings.revision": expectedRevision };
  const res = await col.updateOne(filter as never, { $set: { ...set, updatedAt: new Date() } as never, $inc: { "supplierSettings.revision": 1 } as never });
  if (res.matchedCount === 0) return { ok: false, status: 409, message: "Your settings changed elsewhere. Reload to continue." };
  return { ok: true, view: await getSupplierSettingsView(userId) };
}

/** Used by the notification service: is an optional notice of this category wanted? Mandatory categories (account, system) are always delivered. */
export async function isSupplierCategoryEnabled(userId: string, category: string): Promise<boolean> {
  const pref: PrefKey | undefined = CATEGORY_PREF[category as keyof typeof CATEGORY_PREF];
  if (!pref) return true;
  return (await getSupplierSettingsView(userId)).settings[pref];
}
