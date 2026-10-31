import {
  ShieldCheck,
  BadgeCheck,
  Layers3,
  MessageSquare,
  Users,
  Boxes,
  Building2,
  Globe,
} from "lucide-react";
import type { TrustStat } from "@/types";

export const TRUST_BENEFITS: TrustStat[] = [
  { label: "Verified Suppliers", value: "Trusted & reliable businesses", icon: BadgeCheck },
  { label: "Best Price", value: "Get competitive quotes", icon: ShieldCheck },
  { label: "Wide Range", value: "Millions of products & services", icon: Layers3 },
  { label: "Easy Inquiries", value: "Directly connect with suppliers", icon: MessageSquare },
];

/**
 * Placeholder business metrics — NOT verified figures. Replace with
 * approved marketing numbers before launch. See docs/MISSING_ASSETS.md.
 */
export const HERO_STATS: TrustStat[] = [
  { label: "Verified Suppliers", value: "10L+", icon: Users },
  { label: "Product Listings", value: "50L+", icon: Boxes },
  { label: "Supplier Network", value: "All India", icon: Globe },
  { label: "Business Inquiries", value: "Secure & Safe", icon: ShieldCheck },
];

export const NETWORK_STATS: TrustStat[] = [
  { label: "Verified Suppliers", value: "10L+", icon: Users },
  { label: "Products & Services", value: "50L+", icon: Boxes },
  { label: "Industries Served", value: "28+", icon: Building2 },
  { label: "Business Network", value: "All India", icon: Globe },
];
