import { FEATURED_SUPPLIERS } from "./suppliers";
import type { SupplierProfile } from "@/types";

/**
 * Supplier profile page (`/suppliers/[slug]`) data. Only one supplier has a
 * full profile filled in so far (Shree Textiles, built from the approved
 * reference design) — this is sample/placeholder content for visual
 * development, not a confirmed business record. See docs/MISSING_ASSETS.md.
 * Real company description, certifications, and gallery photography must
 * replace this before launch; nothing here should be presented as verified
 * fact beyond what FEATURED_SUPPLIERS already asserts.
 */
const SUPPLIER_PROFILES: Record<string, SupplierProfile> = {
  "shree-textiles": {
    ...FEATURED_SUPPLIERS.find((s) => s.id === "shree-textiles")!,
    businessType: "Manufacturer",
    description:
      "Shree Textiles is a manufacturer and supplier of fabrics, garments and textile products. Based in Surat, Gujarat, the company focuses on providing a range of textile materials for businesses across domestic and international markets.",
    mainCategories: ["Fabrics", "Garments", "Textile Materials", "Custom Manufacturing"],
    supplyType: ["Bulk Supply", "Custom Orders"],
    heroImageSrc: "/images/categories/apparel-fashion.png",
    // No dedicated factory/gallery photography exists for this supplier yet —
    // left empty rather than filled with unrelated stock photos represented
    // as this company's own facility. SupplierGallery hides itself when empty.
    galleryImages: [],
  },
};

export function getSupplierProfile(slug: string): SupplierProfile | undefined {
  return SUPPLIER_PROFILES[slug];
}
