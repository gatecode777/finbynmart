/** Client-safe inbox constants (the service is server-only and must not be imported by components). */
export const INBOX_TABS = [
  { key: "all", label: "All", statuses: null },
  { key: "new", label: "New", statuses: ["new", "NEW", "NOTIFIED"] },
  { key: "active", label: "In progress", statuses: ["IN_PROGRESS", "REPLIED", "QUOTED"] },
  { key: "closed", label: "Closed or ended", statuses: ["CLOSED", "CANCELLED", "REJECTED"] },
] as const;
export type InboxTab = (typeof INBOX_TABS)[number]["key"];
export const INBOX_PAGE = 20;
export const INBOX_MAX = 50;

/** Which relationship the list shows: inquiries addressed to the company (DIRECT) or automatic matching leads (MATCHED). */
export const INBOX_KINDS = [
  { key: "all", label: "All", badge: "Direct inquiries (the buyer selected your company) and matching leads (the requirement matches products your company supplies), newest first. Each row says which it is." },
  { key: "direct", label: "Direct inquiries", badge: "Buyer selected your company." },
  { key: "matched", label: "Matching leads", badge: "Matches products your company supplies." },
] as const;
export type InboxKind = (typeof INBOX_KINDS)[number]["key"];
