import {
  ShieldCheck,
  BadgeCheck,
  Layers3,
  MessageSquare,
  Users,
  Boxes,
  Globe,
} from "lucide-react";
import type { TrustStat } from "@/types";

export const TRUST_BENEFITS: TrustStat[] = [
  { label: "Supplier Network", value: "Find suppliers across India", icon: BadgeCheck },
  { label: "Request Quotes", value: "Compare what suppliers offer", icon: ShieldCheck },
  { label: "Wide Range", value: "Products across many categories", icon: Layers3 },
  { label: "Easy Inquiries", value: "Directly connect with suppliers", icon: MessageSquare },
];

/** Hero highlight cards: descriptive, no business metrics (no verified supplier or product totals exist to quote). "All India" is approved owner wording. */
export const HERO_STATS: TrustStat[] = [
  { label: "Supplier Network", value: "All India", icon: Globe },
  { label: "Product Listings", value: "Browse by category", icon: Boxes },
  { label: "Quotes", value: "Request from suppliers", icon: Users },
  { label: "Business Inquiries", value: "Send directly", icon: ShieldCheck },
];
