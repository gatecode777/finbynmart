/** Client-safe supplier notification preference rules. One source for the page, the API and the notification service. */
export interface SupplierNotificationSettings {
  inquiryAlerts: boolean;
  quotationAlerts: boolean;
  orderAlerts: boolean;
  marketingEmails: boolean;
}
export type PrefKey = keyof SupplierNotificationSettings;

/** Missing data means these defaults. Marketing is never on by default: a missing value is not consent. */
export const DEFAULT_SUPPLIER_SETTINGS: SupplierNotificationSettings = { inquiryAlerts: true, quotationAlerts: true, orderAlerts: true, marketingEmails: false };
export const PREF_KEYS = Object.keys(DEFAULT_SUPPLIER_SETTINGS) as PrefKey[];

export interface PrefMeta {
  key: PrefKey;
  label: string;
  description: string;
  /** false = nothing in the system produces this notice for a supplier (or no channel exists), so the control is not offered. */
  available: boolean;
  reason: string;
}

/** What the backend really supports today (rechecked in the repository): the only supplier notice produced is the welcome message. */
export const PREF_META: PrefMeta[] = [
  { key: "inquiryAlerts", label: "Buyer inquiry alerts", description: "A notice when a buyer sends an inquiry to one of your sellers.", available: false, reason: "No notice is produced for new inquiries yet. Your dashboard shows inquiries." },
  { key: "quotationAlerts", label: "Quotation decisions", description: "A notice when a buyer accepts, rejects or asks to revise a quotation.", available: false, reason: "No notice is produced for quotation decisions yet. The quotation list shows the current status." },
  { key: "orderAlerts", label: "Order updates", description: "A notice when an order changes.", available: false, reason: "Orders are not created yet, so there are no order notices." },
  { key: "marketingEmails", label: "Marketplace news by e-mail", description: "Occasional product and marketplace updates.", available: false, reason: "E-mail delivery does not exist yet, so nothing is sent. You are not subscribed." },
];

export const CHANNELS = [
  { key: "inApp", label: "In-app notifications (bell)", available: true },
  { key: "email", label: "E-mail", available: false },
  { key: "sms", label: "SMS", available: false },
] as const;

/** Which notification categories a preference can switch off. Account and system notices are mandatory and always shown in-app. */
export const CATEGORY_PREF: Partial<Record<"inquiries" | "quotations" | "orders", PrefKey>> = { inquiries: "inquiryAlerts", quotations: "quotationAlerts", orders: "orderAlerts" };
