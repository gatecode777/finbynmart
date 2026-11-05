import { unitKey } from "./listingQuery";

/**
 * Quantity validation shared by the browser (instant feedback) and the server (authoritative: the
 * client value is never trusted). Used by inquiries and quote requests for a product.
 *
 * Rules: a whole number from 1 to MAX_QUANTITY; when the product has a MOQ the quantity must reach it;
 * a unit, when given, must be the unit the product is sold in (10 pieces is never compared with 10 kg);
 * a missing unit means the product's own unit. A product with no MOQ has no minimum beyond 1: a missing MOQ
 * is not read as any particular number.
 */
export const MAX_QUANTITY = 1_000_000;

export interface QuantityRules {
  /** Minimum order of the product, when the record has one. */
  moq?: { quantity: number; unit: string };
  /** The unit the product is priced and sold in, when known ("Piece"). */
  unit?: string;
}

export type QuantityResult = { ok: true; quantity: number; unit?: string } | { ok: false; message: string };

const plural = (unit: string) => {
  const key = unitKey(unit);
  return key === "kg" ? "kg" : key.endsWith("x") ? `${key}es` : `${key}s`;
};

export function validateQuantity(rawQuantity: unknown, rawUnit: unknown, rules: QuantityRules = {}): QuantityResult {
  const text = typeof rawQuantity === "number" && Number.isFinite(rawQuantity) ? String(rawQuantity) : typeof rawQuantity === "string" ? rawQuantity.trim() : "";
  if (!/^\d{1,12}$/.test(text)) return { ok: false, message: "Enter the quantity as a whole number." };
  const quantity = Number(text);
  if (quantity < 1) return { ok: false, message: "Quantity must be at least 1." };
  if (quantity > MAX_QUANTITY) return { ok: false, message: `Quantity can be at most ${MAX_QUANTITY.toLocaleString("en-IN")}.` };

  const productUnit = rules.moq?.unit ?? rules.unit;
  const given = typeof rawUnit === "string" ? rawUnit.trim() : "";
  if (given && productUnit && unitKey(given) !== unitKey(productUnit)) {
    return { ok: false, message: `This product is sold in ${plural(productUnit)}. Choose ${plural(productUnit)} as the unit.` };
  }
  if (rules.moq && quantity < rules.moq.quantity) {
    return { ok: false, message: `The minimum order is ${rules.moq.quantity.toLocaleString("en-IN")} ${rules.moq.quantity === 1 ? unitKey(rules.moq.unit) : plural(rules.moq.unit)}.` };
  }
  return { ok: true, quantity, unit: given || productUnit };
}
