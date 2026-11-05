import { RANGE_PRESETS } from "./dateRange";

/**
 * Buyer settings that really take effect. Pure, shared by the form (instant feedback), the API and the node-run unit tests.
 *
 * Only two things a buyer can set are consumed by the application today:
 *  - which in-app notification categories are created for them (applied where the notification is created, not in the browser);
 *  - the dashboard period that opens when the URL names no range.
 * Everything else the PRD lists (email, SMS and WhatsApp delivery, two-step verification, login alerts, session list, language,
 * timezone, currency, date format, marketing consent, profile visibility, business preferences, integrations) has no
 * implementation behind it, so it is reported as not available instead of being offered as a toggle that does nothing.
 */
export const NOTIFICATION_CATEGORIES = [
  { value: "inquiries", label: "Inquiry updates", description: "When you send an inquiry." },
  { value: "company", label: "Company and documents", description: "When you upload or replace a company document." },
  { value: "account", label: "Account and security", description: "Password changes and sign-outs. Required: these cannot be switched off." },
  { value: "support", label: "Support tickets", description: "A confirmation when you raise a support ticket. Required: it confirms your own action and cannot be switched off." },
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]["value"];
/** Security notices are required, so they are always created (preferences cannot silence them). */
export const REQUIRED_CATEGORIES: readonly NotificationCategory[] = ["account", "support"];

export const DASHBOARD_RANGES = RANGE_PRESETS.filter((p) => p.value !== "custom");
export type DashboardRange = (typeof DASHBOARD_RANGES)[number]["value"];
export const DEFAULT_DASHBOARD_RANGE: DashboardRange = "30d";

export interface BuyerSettingsValue {
  notifications: Record<"inquiries" | "company", boolean>;
  dashboardRange: DashboardRange;
}

export const DEFAULT_SETTINGS: BuyerSettingsValue = { notifications: { inquiries: true, company: true }, dashboardRange: DEFAULT_DASHBOARD_RANGE };

export type SettingsResult = { ok: true; value: BuyerSettingsValue & { version: number } } | { ok: false; fields: Record<string, string> };

/** Full-body validation: every setting is sent, version is the one the form loaded (0 for a buyer who never saved). */
export function validateSettings(raw: unknown): SettingsResult {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};
  const known = ["notifications", "dashboardRange", "version"];
  for (const key of Object.keys(body)) if (!known.includes(key)) fields[key] = "This setting does not exist or cannot be changed here.";

  const n = body.notifications && typeof body.notifications === "object" && !Array.isArray(body.notifications) ? (body.notifications as Record<string, unknown>) : null;
  const notifications = { inquiries: DEFAULT_SETTINGS.notifications.inquiries, company: DEFAULT_SETTINGS.notifications.company };
  if (!n) fields.notifications = "Send the notification preferences.";
  else {
    for (const key of Object.keys(n)) if (key !== "inquiries" && key !== "company") fields[`notifications.${key}`] = key === "account" ? "Security notices are required and cannot be changed." : "Unknown notification category.";
    for (const key of ["inquiries", "company"] as const) {
      if (typeof n[key] !== "boolean") fields[`notifications.${key}`] = "Send true or false.";
      else notifications[key] = n[key] as boolean;
    }
  }

  const range = DASHBOARD_RANGES.find((r) => r.value === body.dashboardRange)?.value;
  if (!range) fields.dashboardRange = "Choose one of the listed periods.";

  let version = -1;
  if (typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 0) fields.version = "Reload the page and try again.";
  else version = body.version;

  if (Object.keys(fields).length > 0 || !range) return { ok: false, fields };
  return { ok: true, value: { notifications, dashboardRange: range, version } };
}
