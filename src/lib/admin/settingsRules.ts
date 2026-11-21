/**
 * Client-safe rules of Admin Settings (Page 64): the administrator's OWN account only. Editable: the display name (the same rule as the buyer and supplier sign-up: `checkFullName`). Read-only:
 * the sign-in e-mail (no verified change-e-mail flow exists) and the role (permissions are managed outside this page). Personal in-app notification preferences: which categories the
 * administrator sees in their own inbox. Nothing else: no admin creation, role or permission editing, platform configuration, payment, tax, provider or credential settings.
 */
import { checkFullName } from "@/lib/auth/buyerRegistration";
import { FORBIDDEN_PROFILE_FIELDS } from "@/lib/buyer/profileRules";

export const ROLE_LABEL = "Administrator";

type Fields = Record<string, string>;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** `PATCH .../profile` accepts exactly one field. A privilege or identity field, the e-mail or anything unknown is refused by name (never silently ignored, never applied). */
export function validateProfileBody(raw: unknown): { ok: true; name: string } | { ok: false; fields: Fields } {
  if (!isObject(raw)) return { ok: false, fields: { body: "Send the display name." } };
  const fields: Fields = {};
  for (const k of Object.keys(raw)) {
    if (k === "name") continue;
    fields[k] = k === "email" ? "Your sign-in e-mail cannot be changed here." : (FORBIDDEN_PROFILE_FIELDS as readonly string[]).includes(k) ? "This value is set by the server and cannot be sent." : "This field cannot be changed here.";
  }
  const name = checkFullName(raw.name);
  if (!name.ok) fields.name = name.error;
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, name: (name as { ok: true; value: string }).value };
}

/** `PATCH .../notifications` accepts exactly `categories`: the list of category keys to SHOW. The service refuses any key the administrator does not hold the capability for. */
export function validatePreferencesBody(raw: unknown): { ok: true; categories: unknown } | { ok: false; fields: Fields } {
  if (!isObject(raw)) return { ok: false, fields: { body: "Send the categories to show." } };
  const fields: Fields = {};
  for (const k of Object.keys(raw)) if (k !== "categories") fields[k] = "This field cannot be changed here.";
  if (!Array.isArray(raw.categories)) fields.categories = "Send the list of categories to show.";
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, categories: raw.categories };
}

/** The wording shown beside the preference switches (the exact behaviour implemented in `notifications.ts`). */
export const PREFERENCE_NOTES = [
  "A category you turn off is hidden from your own notification list, your unread count and the header bell. Nothing is deleted, nothing is marked as read, and the events are still recorded for everyone who is authorized.",
  "Turning it back on shows its existing events again, with the read state they already had.",
  "A preference never gives you access to a category: you only see categories for work you are authorized to review, and you can turn off any of them.",
] as const;
