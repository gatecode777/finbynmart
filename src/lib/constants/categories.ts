import {
  Factory,
  Zap,
  Shirt,
  Home,
  Package,
  UtensilsCrossed,
  Pill,
  Tractor,
  Building2,
  FlaskConical,
} from "lucide-react";
import type { TopCategory } from "@/types";

/**
 * Placeholder category list for visual development — reconcile with the
 * actual database categories before this goes to production.
 * See docs/MISSING_ASSETS.md.
 */
export const TOP_CATEGORIES: TopCategory[] = [
  { id: "industrial-machinery", name: "Industrial Machinery", href: "/categories/industrial-machinery", icon: Factory, tint: "navy" },
  { id: "electrical-electronics", name: "Electrical & Electronics", href: "/categories/electrical-electronics", icon: Zap, tint: "blue" },
  { id: "apparel-fashion", name: "Apparel & Fashion", href: "/categories/apparel-fashion", icon: Shirt, tint: "slate" },
  { id: "home-lifestyle", name: "Home & Lifestyle", href: "/categories/home-lifestyle", icon: Home, tint: "blue" },
  { id: "packaging-printing", name: "Packaging & Printing", href: "/categories/packaging-printing", icon: Package, tint: "navy" },
  { id: "food-beverages", name: "Food & Beverages", href: "/categories/food-beverages", icon: UtensilsCrossed, tint: "slate" },
  { id: "health-pharma", name: "Health & Pharma", href: "/categories/health-pharma", icon: Pill, tint: "blue" },
  { id: "agriculture", name: "Agriculture", href: "/categories/agriculture", icon: Tractor, tint: "navy" },
  { id: "construction-real-estate", name: "Construction & Real Estate", href: "/categories/construction-real-estate", icon: Building2, tint: "slate" },
  { id: "chemicals-dyes", name: "Chemicals & Dyes", href: "/categories/chemicals-dyes", icon: FlaskConical, tint: "blue" },
];
