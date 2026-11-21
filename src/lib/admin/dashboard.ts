import type { ObjectId } from "mongodb";
import type { AdminCapability } from "./permissions";
import { countPending } from "./productReview";
import { unreadCount } from "./notifications";
import { submissions } from "@/lib/verification/service";
import { ticketsCollection } from "@/lib/support/ticketService";
import { distributionCollections } from "@/lib/leads/distribution";

/**
 * Admin dashboard (Page 50): the work waiting for THIS administrator. Every count has ONE definition below, is shown only to an administrator holding the capability that opens the queue behind it,
 * is read from the database (no cache, no estimate) and fails alone: a count that could not be read is `null` ("could not be loaded"), never zero. No revenue, trend, ranking or forecast exists
 * (no source), so none is shown.
 */
export interface DashboardStat { key: string; label: string; value: number | null; href: string; note: string }

type Def = { key: string; label: string; needs: AdminCapability; href: string; note: string; read: () => Promise<number> };

/** Tickets that need a staff action: new, reopened, or waiting for support (not waiting for the buyer, not resolved, not closed). */
export const SUPPORT_AWAITING = ["OPEN", "WAITING_FOR_SUPPORT", "REOPENED"] as const;

export async function getDashboardStats(adminId: ObjectId, permissions: readonly AdminCapability[]): Promise<DashboardStat[]> {
  const defs: Def[] = [
    { key: "product-review", label: "Products awaiting review", needs: "products.review", href: "/admin/product-review", note: "Submitted by suppliers, not yet decided", read: countPending },
    { key: "verification", label: "Verifications awaiting review", needs: "verification.read", href: "/admin/verification", note: "Latest submission per company, pending review", read: async () => (await submissions()).countDocuments({ latest: true, state: "PENDING_REVIEW" }) },
    { key: "support", label: "Support tickets awaiting support", needs: "support.manage", href: "/admin/support", note: "New, reopened or waiting for support", read: async () => (await ticketsCollection()).countDocuments({ status: { $in: [...SUPPORT_AWAITING] } }) },
    { key: "distribution", label: "Inquiries needing attention", needs: "inquiries.read", href: "/admin/inquiries", note: "Distribution failed, or partial with an error", read: async () => (await distributionCollections()).jobs.countDocuments({ $or: [{ state: "FAILED" }, { state: "PARTIAL", lastError: { $exists: true } }] }) },
    { key: "notifications", label: "Unread notifications", needs: "notifications.read", href: "/admin/notifications", note: "Yours only", read: () => unreadCount(adminId, permissions) },
  ];
  const mine = defs.filter((d) => permissions.includes(d.needs));
  return Promise.all(mine.map(async (d) => {
    let value: number | null;
    try { value = await d.read(); } catch (error) { console.error("admin dashboard count failed", d.key, (error as Error).message); value = null; }
    return { key: d.key, label: d.label, value, href: d.href, note: d.note };
  }));
}

export interface DashboardTool { href: string; title: string; text: string; needs: AdminCapability | AdminCapability[] | null }

/** Every built admin page, in the sidebar's order, with the capability that opens it (null = any administrator). Kept next to AdminShell's navigation; a test compares the two. */
export const DASHBOARD_TOOLS: DashboardTool[] = [
  { href: "/admin/inquiries", title: "Inquiries", text: "Review inquiries and general requirements, and export them.", needs: "inquiries.read" },
  { href: "/admin/products", title: "Products", text: "Review live product listings and restrict public visibility.", needs: "products.read" },
  { href: "/admin/buyers", title: "Buyers", text: "Review buyer accounts and their status.", needs: "buyers.read" },
  { href: "/admin/suppliers", title: "Suppliers", text: "Review supplier companies, catalogue links and access status.", needs: "suppliers.read" },
  { href: "/admin/verification", title: "Supplier verification", text: "Review submitted company evidence and record decisions.", needs: "verification.read" },
  { href: "/admin/categories", title: "Categories", text: "Review the category hierarchy and manage marketplace availability.", needs: "categories.read" },
  { href: "/admin/company-links", title: "Company links", text: "Link a catalogue seller to the supplier company that owns it.", needs: "sellers.map" },
  { href: "/admin/product-review", title: "Product review", text: "Approve or reject submitted supplier products.", needs: "products.review" },
  { href: "/admin/support", title: "Support", text: "Answer support tickets from buyers and suppliers.", needs: "support.manage" },
  { href: "/admin/quotations", title: "Quotations", text: "Review submitted quotations (read-only).", needs: "quotations.read" },
  { href: "/admin/reports", title: "Reports", text: "Counts of buyers, suppliers, inquiries, quotations and orders over a date range.", needs: ["reports.buyers", "reports.suppliers", "reports.requirements", "reports.quotations", "reports.orders"] },
  { href: "/admin/notifications", title: "Notifications", text: "Staff alerts for work that needs attention.", needs: "notifications.read" },
  { href: "/admin/audit-logs", title: "Audit logs", text: "Recorded administrative actions you are allowed to see.", needs: "audit.read" },
  { href: "/admin/settings", title: "Settings", text: "Your own display name, password and notification preferences.", needs: null },
];

export const toolsFor = (permissions: readonly AdminCapability[]): DashboardTool[] =>
  DASHBOARD_TOOLS.filter((t) => t.needs === null || (Array.isArray(t.needs) ? t.needs.some((c) => permissions.includes(c)) : permissions.includes(t.needs)));
