/**
 * Client-safe inventory rules (Page 42 / "Page 50" request). Quantities are integers in thousandths ("milli") of the product's own unit,
 * parsed from decimal text, so balances never touch binary floating point. Units are never converted or added across products.
 *
 * Definitions: on hand = physical stock the supplier recorded. Reserved = not supported (nothing creates orders or reservations yet), so
 * it is never shown as a number. Available = on hand until a reservation workflow exists. A product with no position is UNTRACKED, not zero.
 * Policy: negative stock is refused; there is no backorder.
 */
export const MILLI = 1000;
export const QTY_MAX_MILLI = 1_000_000_000 * MILLI;

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

/** "12", "12.5", "0.125" → milli; more than 3 decimals, signs, exponents or huge values → null. */
export function parseQtyMilli(text: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * MILLI + Number((m[2] ?? "").padEnd(3, "0") || "0");
}

export function formatQty(milli: number): string {
  const whole = Math.floor(milli / MILLI);
  const frac = String(milli % MILLI).padStart(3, "0").replace(/0+$/, "");
  return (frac ? `${whole.toLocaleString("en-IN")}.${frac}` : whole.toLocaleString("en-IN"));
}

/** Out of stock at zero (takes precedence); low when a reorder level is set and on hand is at or below it (inclusive). No level → never low. */
export function stockStatus(onHandMilli: number, reorderMilli: number | null): StockStatus {
  if (onHandMilli <= 0) return "OUT_OF_STOCK";
  if (reorderMilli !== null && onHandMilli <= reorderMilli) return "LOW_STOCK";
  return "IN_STOCK";
}

export const REASONS = [
  { code: "COUNT_CORRECTION", label: "Stock count correction" },
  { code: "RECEIPT", label: "Goods received" },
  { code: "DAMAGE", label: "Damaged or spoiled" },
  { code: "LOSS", label: "Lost or missing" },
  { code: "OTHER", label: "Other (explain below)" },
] as const;
const REASON_CODES: readonly string[] = REASONS.map((r) => r.code);

export const KINDS = [
  { code: "OPENING", label: "Set opening balance" },
  { code: "ADD", label: "Add stock" },
  { code: "REMOVE", label: "Remove stock" },
] as const;
export type AdjustKind = (typeof KINDS)[number]["code"];

export interface AdjustInput {
  productRef: string;
  kind: AdjustKind;
  quantity: string;
  reason: string;
  note: string;
  /** Optional. Empty = leave the level as it is (none by default). */
  reorderLevel: string;
}
export type AdjustErrors = Partial<Record<keyof AdjustInput, string>>;

export function validateAdjust(i: AdjustInput): AdjustErrors {
  const e: AdjustErrors = {};
  if (!i.productRef) e.productRef = "Choose a product.";
  if (!KINDS.some((k) => k.code === i.kind)) e.kind = "Choose an adjustment type.";
  const q = parseQtyMilli(i.quantity);
  if (q === null) e.quantity = "Enter a number with at most 3 decimals.";
  else if (q === 0 && i.kind !== "OPENING") e.quantity = "Quantity must be above zero.";
  if (!REASON_CODES.includes(i.reason)) e.reason = "Choose a reason.";
  if (i.reason === "OTHER" && i.note.trim().length < 3) e.note = "Explain the reason.";
  if (i.note.length > 300) e.note = "Use at most 300 characters.";
  if (i.reorderLevel && parseQtyMilli(i.reorderLevel) === null) e.reorderLevel = "Enter a number with at most 3 decimals.";
  return e;
}

/** The only place a movement's effect is computed: delta in milli, or null when it would leave negative stock. */
export function movementEffect(kind: AdjustKind, qtyMilli: number, currentMilli: number | null): { delta: number; result: number } | { error: string } {
  if (kind === "OPENING") return currentMilli === null ? { delta: qtyMilli, result: qtyMilli } : { error: "This product already has a balance. Use Add or Remove stock." };
  if (currentMilli === null) return { error: "Set an opening balance first. This product is not tracked yet." };
  const delta = kind === "ADD" ? qtyMilli : -qtyMilli;
  const result = currentMilli + delta;
  if (result < 0) return { error: "That would make stock negative. Negative stock is not allowed." };
  if (result > QTY_MAX_MILLI) return { error: "Resulting stock is above the supported maximum." };
  return { delta, result };
}
