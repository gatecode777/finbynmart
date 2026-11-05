/**
 * Rules of the buyer's product comparison (Page 35). Pure (no database), shared by the service, the page and the node-run unit tests.
 *
 * Limits: two to four products. Fewer than two is "comparison incomplete" (shown, with Add More Products); a fifth product is refused
 * (409), never swapped for another one silently.
 *
 * Nothing here ranks or scores. The only emphasis is NEUTRAL and only where the numbers are genuinely comparable: the lowest listed
 * price among products with the same currency and the same price unit, and the lowest minimum order among products that state it
 * in the same unit. It is labelled for what it is ("Lowest listed price"), never "best".
 */
export const COMPARE_PRODUCTS_MIN = 2;
export const COMPARE_PRODUCTS_MAX = 4;
export const MAX_SPEC_ROWS = 16;

/**
 * How one row of the table reads across the products.
 *   same        every product states the same value
 *   differs     at least two products state different values (missing values are not counted as a value)
 *   incomplete  the products that state a value agree, but at least one product does not state it: shown as Not Provided, never as zero
 *   empty       no product states it
 */
export type RowStatus = "same" | "differs" | "incomplete" | "empty";

const norm = (v: string) => v.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

export function rowStatus(values: (string | null | undefined)[]): RowStatus {
  const present = values.filter((v): v is string => typeof v === "string" && v.trim() !== "").map(norm);
  if (present.length === 0) return "empty";
  const distinct = new Set(present);
  if (distinct.size > 1) return "differs";
  return present.length < values.length ? "incomplete" : "same";
}

/** Indexes of the smallest numbers, only when EVERY product has a usable number (a missing one is never treated as zero) and there are at least two. */
export function lowestIndexes(nums: (number | null | undefined)[]): number[] {
  if (nums.length < 2 || nums.some((n) => typeof n !== "number" || !Number.isFinite(n) || n <= 0)) return [];
  const min = Math.min(...(nums as number[]));
  return nums.flatMap((n, i) => (n === min ? [i] : []));
}

export interface PriceInput {
  currency: string;
  unit: string;
  min: number | null;
}

export interface PriceCompatibility {
  currencyCompatible: boolean;
  unitCompatible: boolean;
  /** Indexes of the lowest listed price, or [] when the prices are not comparable (different currency or unit, or a price is missing). */
  lowest: number[];
}

/** Prices are comparable only in the same currency AND the same price unit; there is no conversion service, so nothing is ever converted. */
export function priceCompatibility(items: PriceInput[]): PriceCompatibility {
  const currencyCompatible = new Set(items.map((i) => i.currency)).size <= 1;
  const unitCompatible = new Set(items.map((i) => norm(i.unit))).size <= 1;
  return { currencyCompatible, unitCompatible, lowest: currencyCompatible && unitCompatible ? lowestIndexes(items.map((i) => i.min)) : [] };
}

export interface MoqInput {
  quantity: number;
  unit: string;
}

/** Minimum orders are comparable only when every product states one, in the same unit. */
export function moqCompatibility(items: (MoqInput | null)[]): { comparable: boolean; lowest: number[] } {
  if (items.length < 2 || items.some((m) => !m)) return { comparable: false, lowest: [] };
  const units = new Set((items as MoqInput[]).map((m) => norm(m.unit)));
  if (units.size > 1) return { comparable: false, lowest: [] };
  return { comparable: true, lowest: lowestIndexes((items as MoqInput[]).map((m) => m.quantity)) };
}

export interface SpecInput {
  group: string;
  label: string;
}

export interface SpecRowPlan {
  key: string;
  label: string;
  group: string;
  /** True when only ONE of the compared products has this attribute (typically a different category): listed apart, not forced onto the others. */
  specific: boolean;
}

export const specKey = (s: SpecInput) => `spec:${s.group}|${s.label}`;

/**
 * Which specification rows the table shows. An attribute that two or more products have is a shared row (grouped by the attribute's own
 * group); one that only a single product has is listed under "specific to one product", so unrelated attributes of different categories
 * are not forced into one uniform grid. With a single live product every attribute is shown as it is.
 */
export function planSpecRows(perProduct: SpecInput[][], max = MAX_SPEC_ROWS): SpecRowPlan[] {
  const live = perProduct.length;
  const counts = new Map<string, { plan: SpecRowPlan; n: number }>();
  for (const specs of perProduct) {
    for (const k of new Set(specs.map(specKey))) {
      const s = specs.find((x) => specKey(x) === k)!;
      const e = counts.get(k) ?? { plan: { key: k, label: s.label, group: s.group, specific: false }, n: 0 };
      e.n += 1;
      counts.set(k, e);
    }
  }
  const rows = [...counts.values()].map(({ plan, n }) => ({ ...plan, specific: live >= 2 && n === 1, n }));
  rows.sort((a, b) => Number(a.specific) - Number(b.specific) || b.n - a.n || a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  return rows.slice(0, max).map(({ n, ...plan }) => (void n, plan));
}
