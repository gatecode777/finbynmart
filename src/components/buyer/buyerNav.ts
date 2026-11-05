import { BadgeHelp, Building2, Heart, LayoutDashboard, LayoutGrid, MapPin, MessageSquareText, Package, Scale, Settings, Store, FileText, UserRound, type LucideIcon } from "lucide-react";

/**
 * The buyer workspace navigation, in one place. An item with no `href` has no page yet: it stays in the architecture but is
 * shown as unavailable (not a link, so it can never lead to a blank page). When a page is built, give it its `href` here.
 * Only counts that come from real data carry a badge (`badge: "activeInquiries"`).
 */
export interface BuyerNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string | null;
  /** What the missing page depends on (shown to the person as "Coming soon" and documented). */
  pending?: string;
  badge?: "activeInquiries";
}

export const BUYER_NAV: BuyerNavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/buyer/dashboard" },
  { key: "explorer", label: "Product Explorer", icon: LayoutGrid, href: "/products" },
  { key: "inquiries", label: "My Inquiries", icon: MessageSquareText, href: "/buyer/inquiries", badge: "activeInquiries" },
  { key: "quotations", label: "Quotations", icon: FileText, href: "/buyer/quotations" },
  { key: "orders", label: "Orders", icon: Package, href: "/buyer/orders" },
  { key: "saved-products", label: "Saved Products", icon: Heart, href: "/buyer/saved-products" },
  { key: "saved-suppliers", label: "Saved Suppliers", icon: Store, href: "/buyer/saved-suppliers" },
  { key: "compare", label: "Compare Products", icon: Scale, href: "/buyer/compare-products" },
  { key: "profile", label: "Profile & Company", icon: Building2, href: "/buyer/profile" },
  { key: "address-book", label: "Address Book", icon: MapPin, href: "/buyer/addresses" },
  { key: "settings", label: "Settings & Notifications", icon: Settings, href: "/buyer/settings" },
];

export const BUYER_NAV_FOOTER: BuyerNavItem[] = [{ key: "support", label: "Help & Support", icon: BadgeHelp, href: "/buyer/support" }];

export const PROFILE_ICON = UserRound;
