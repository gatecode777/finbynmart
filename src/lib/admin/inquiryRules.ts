/** Client-safe admin inquiry rules. One row of the central `inquiries` collection = one inquiry sent to one supplier (recipient). */
export const ADMIN_STATUS_GROUPS = [
  { key: "all", label: "All inquiries", statuses: null },
  { key: "awaiting", label: "Awaiting supplier", statuses: ["new", "NEW", "NOTIFIED"] },
  { key: "active", label: "In progress", statuses: ["IN_PROGRESS", "REPLIED", "QUOTED"] },
  { key: "ended", label: "Closed or ended", statuses: ["CLOSED", "CANCELLED", "REJECTED"] },
] as const;
export type AdminStatusGroup = (typeof ADMIN_STATUS_GROUPS)[number]["key"];
export const GROUP_KEYS = ADMIN_STATUS_GROUPS.map((g) => g.key) as readonly string[];

export const STATUS_LABEL: Record<string, string> = { new: "New", NEW: "New", NOTIFIED: "Awaiting supplier", IN_PROGRESS: "In progress", REPLIED: "Replied", QUOTED: "Quoted", CLOSED: "Closed", CANCELLED: "Cancelled", REJECTED: "Rejected" };

export const ADMIN_PAGE_SIZE = 20;
export const ADMIN_MAX_PAGE_SIZE = 50;
export const ADMIN_EXPORT_MAX = 5000;
