/**
 * Exact money arithmetic for quotations. Pure (no imports), shared by the server, the pages and the node-run unit tests.
 *
 * Amounts are whole minor units (paise for INR) held as integers and calculated with BigInt, so no floating-point rounding ever
 * touches a price. Percentages are basis points (18% = 1800). A percentage of an amount is rounded half up to the minor unit.
 *
 * The model follows the saved quotation, nothing is assumed:
 *   subtotal  = unit price x quantity
 *   discount  = the saved percent of the subtotal, or the saved amount (never more than the subtotal)
 *   taxable   = subtotal - discount
 *   tax       = the saved rate of the taxable amount, ONLY when the quotation names a tax; otherwise it is "not specified"
 *   charges   = the saved additional charges, added after tax
 *   total     = taxable + tax + charges
 * When no tax is saved the total is reported as "before tax" (taxSpecified: false): a tax is never invented, and the page never
 * calls an untaxed sum the final payable amount.
 */
export type Discount = { kind: "PERCENT"; bp: number } | { kind: "AMOUNT"; minor: number };

export interface PriceInput {
  unitPriceMinor: number;
  quantity: number;
  discount?: Discount | null;
  tax?: { label: string; bp: number } | null;
  charges?: { label: string; minor: number }[];
}

export interface PriceBreakdown {
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  /** null when the quotation names no tax. */
  taxMinor: number | null;
  chargesMinor: number;
  totalMinor: number;
  taxSpecified: boolean;
}

const MAX_MINOR = Number.MAX_SAFE_INTEGER;
const isMinor = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_MINOR;
// BigInt literals (0n) need a newer compile target than this project uses, so the constants are made with BigInt()
const B0 = BigInt(0);
const B100 = BigInt(100);
const B5000 = BigInt(5000);
const B10000 = BigInt(10000);
const halfUp = (amount: bigint, bp: bigint) => (amount * bp + B5000) / B10000;

export type PriceResult = { ok: true; value: PriceBreakdown } | { ok: false; error: string };

export function priceBreakdown(input: PriceInput): PriceResult {
  if (!isMinor(input.unitPriceMinor)) return { ok: false, error: "The unit price must be a whole number of minor units." };
  if (typeof input.quantity !== "number" || !Number.isInteger(input.quantity) || input.quantity < 1) return { ok: false, error: "The quantity must be a whole number of at least 1." };
  const subtotal = BigInt(input.unitPriceMinor) * BigInt(input.quantity);

  let discount = B0;
  if (input.discount) {
    if (input.discount.kind === "PERCENT") {
      if (!Number.isInteger(input.discount.bp) || input.discount.bp < 0 || input.discount.bp > 10000) return { ok: false, error: "The discount percentage must be between 0 and 100." };
      discount = halfUp(subtotal, BigInt(input.discount.bp));
    } else {
      if (!isMinor(input.discount.minor)) return { ok: false, error: "The discount amount must be a whole number of minor units." };
      discount = BigInt(input.discount.minor);
      if (discount > subtotal) return { ok: false, error: "The discount cannot be more than the subtotal." };
    }
  }
  const taxable = subtotal - discount;

  let tax: bigint | null = null;
  if (input.tax) {
    if (!Number.isInteger(input.tax.bp) || input.tax.bp < 0 || input.tax.bp > 10000) return { ok: false, error: "The tax rate must be between 0 and 100 percent." };
    tax = halfUp(taxable, BigInt(input.tax.bp));
  }

  let charges = B0;
  for (const charge of input.charges ?? []) {
    if (!isMinor(charge.minor)) return { ok: false, error: "A charge must be a whole number of minor units." };
    charges += BigInt(charge.minor);
  }

  const total = taxable + (tax ?? B0) + charges;
  if (total > BigInt(MAX_MINOR)) return { ok: false, error: "The amount is too large." };
  return { ok: true, value: { subtotalMinor: Number(subtotal), discountMinor: Number(discount), taxableMinor: Number(taxable), taxMinor: tax === null ? null : Number(tax), chargesMinor: Number(charges), totalMinor: Number(total), taxSpecified: tax !== null } };
}

const SYMBOLS: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "AED ", SGD: "S$" };

/** "₹7,40,000.00": the whole part is grouped (Indian grouping for INR) from the integer, so no float is involved. */
export function formatMoney(minor: number, currency: string): string {
  const negative = minor < 0;
  const abs = BigInt(Math.abs(minor));
  const whole = abs / B100;
  const frac = String(abs % B100).padStart(2, "0");
  const grouped = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US").format(whole);
  return `${negative ? "-" : ""}${SYMBOLS[currency] ?? `${currency} `}${grouped}.${frac}`;
}

/** "18%" or "2.5%" from basis points. */
export const formatPercent = (bp: number) => `${bp % 100 === 0 ? bp / 100 : (bp / 100).toFixed(2).replace(/0$/, "")}%`;
