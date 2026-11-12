import { BarChart3, BadgeHelp, Boxes, Building2, FileText, LayoutDashboard, MessageSquareText, Package, PackageSearch, Settings, type LucideIcon } from "lucide-react";

/**
 * The supplier workspace navigation, in one place (the buyer's is components/buyer/buyerNav.ts: the two portals never share a menu). An item with
 * no `href` has no page yet: it is shown as unavailable and is not a link, so it can never lead to a blank page. When a supplier page is built,
 * give it its `href` here.
 */
export interface SupplierNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string | null;
  /** The path prefix whose pages belong to this item even when the item itself is not a link yet (its list page is not built): it is highlighted there. */
  match?: string;
  pending?: string;
}

export const SUPPLIER_NAV: SupplierNavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/supplier/dashboard" },
  { key: "inquiries", label: "Inquiries & Leads", icon: MessageSquareText, href: null, match: "/supplier/inquiries", pending: "The supplier inquiries page is not built yet." },
  { key: "quotations", label: "Quotations", icon: FileText, href: "/supplier/quotations" },
  { key: "orders", label: "Orders", icon: Package, href: "/supplier/orders" },
  { key: "products", label: "My Products", icon: PackageSearch, href: "/supplier/products" },
  { key: "inventory", label: "Inventory", icon: Boxes, href: "/supplier/inventory" },
  { key: "analytics", label: "Analytics & Reports", icon: BarChart3, href: "/supplier/analytics" },
  { key: "company", label: "Company Profile", icon: Building2, href: "/supplier/company" },
  { key: "settings", label: "Settings", icon: Settings, href: "/supplier/settings" },
];

export const SUPPLIER_NAV_FOOTER: SupplierNavItem[] = [
  { key: "support", label: "Help & Support", icon: BadgeHelp, href: "/supplier/support" },
];
