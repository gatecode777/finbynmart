import {
  Package,
  ShoppingBag,
  Archive,
  Boxes,
  Tag,
  FileText,
  TreePine,
  Layers3,
  Shirt,
  Scissors,
  Factory,
  Zap,
  Pill,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Lookup for product tiles (B2BProduct.tile), which store the icon by name
 * instead of a function reference — see SerializableTile in src/types.
 */
export const ICON_REGISTRY: Record<string, LucideIcon> = {
  Package,
  ShoppingBag,
  Archive,
  Boxes,
  Tag,
  FileText,
  TreePine,
  Layers3,
  Shirt,
  Scissors,
  Factory,
  Zap,
  Pill,
};
