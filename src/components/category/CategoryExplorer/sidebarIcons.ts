import {
  Building2,
  FlaskConical,
  Factory,
  Home,
  LayoutGrid,
  Package,
  Pill,
  Shirt,
  Tractor,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Sidebar icon per main category id (the same icons the homepage tiles use). */
export const SIDEBAR_ICONS: Record<string, LucideIcon> = {
  "industrial-machinery": Factory,
  "electrical-electronics": Zap,
  "apparel-fashion": Shirt,
  "home-lifestyle": Home,
  "packaging-printing": Package,
  "food-beverages": UtensilsCrossed,
  "health-pharma": Pill,
  agriculture: Tractor,
  "construction-real-estate": Building2,
  "chemicals-dyes": FlaskConical,
};

export const FALLBACK_ICON: LucideIcon = LayoutGrid;
