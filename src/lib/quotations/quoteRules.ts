import { priceBreakdown, type Discount } from "./money";
import { MAX_AMOUNT_MINOR, MAX_SAFE_MINOR, formatDecimal, parseMoney, parsePercent, parseQuantity } from "./decimal";

/**
 * Create-quotation rules (Page 43). Pure, shared by the API, the server page, the browser preview and the node-run unit tests: the preview the
 * supplier sees and the amount the server stores come from the SAME functions (`computeQuote`).
 *
 * Calculation contract (docs/backend/PAGE_43_QUOTATION_CALCULATION_POLICY.md): subtotal = unit price x quantity; discount (percent of the subtotal, or
 * an amount not above it); taxable = subtotal - discount; tax = the CONFIGURED rule's rate on the taxable amount (half up to the minor unit); freight and
 * other charges are added AFTER tax and are not taxed; total = taxable + tax + charges. Amounts are decimal strings at the boundary, 2 decimals, exact.
 * No tax rate is built in: with no selected configured rule the total is "pending tax review", never a guess.
 */
export const CALC_POLICY_VERSION = "2026-11-12.1";
export const MAX_LINES = 1; // the buyer's quotation pages show one product, quantity and unit price per quotation, so one line is the configured maximum
export const QUOTE_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"] as const;
export const DEFAULT_VALIDITY_DAYS = 14;
export const MAX_VALIDITY_DAYS = 90;
export const MAX_LEAD_DAYS = 365;
export const MAX_EXTRA_CHARGES = 3;
export const LIMITS = { name: 120, unit: 20, label: 40, notes: 500, key: 80, id: 40, taxRuleId: 60 } as const;

export const DELIVERY_TERMS = [
  { value: "EXW", label: "Ex Works (EXW)" },
  { value: "FCA", label: "Free Carrier (FCA)" },
  { value: "FOB", label: "Free on Board (FOB)" },
  { value: "CIF", label: "Cost, Insurance and Freight (CIF)" },
  { value: "DAP", label: "Delivered at Place (DAP)" },
  { value: "DDP", label: "Delivered Duty Paid (DDP)" },
] as const;

export const PAYMENT_TYPES = [
  { value: "ADVANCE", label: "Advance payment (percentage)" },
  { value: "ON_DELIVERY", label: "Payment on delivery" },
  { value: "NET_DAYS", label: "Payment within a number of days" },
] as const;

export const LINE_SOURCES = ["INQUIRY", "CATALOGUE", "MANUAL"] as const;
export type LineSource = (typeof LINE_SOURCES)[number];
export const LINE_SOURCE_LABEL: Record<LineSource, string> = { INQUIRY: "As requested in the inquiry", CATALOGUE: "From your catalogue", MANUAL: "Manual item / substitution" };

export interface QuoteLine {
  id: string;
  source: LineSource;
  productKey: string;
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  moq: string;
  discountKind: "NONE" | "PERCENT" | "AMOUNT";
  discountValue: string;
}

export interface QuoteInput {
  currency: string;
  /** YYYY-MM-DD, the last day the offer is valid; it ends at 23:59:59.999 India time (Asia/Kolkata, UTC+05:30). */
  validUntil: string;
  lines: QuoteLine[];
  taxRuleId: string;
  freight: string;
  charges: { label: string; amount: string }[];
  leadTimeDays: string;
  deliveryTerms: string;
  paymentType: string;
  advancePercent: string;
  netDays: string;
  notes: string;
}

/** A tax treatment configured by the platform (never invented in code). RATE has a percentage; EXEMPT and NOT_APPLICABLE are explicit zero treatments. */
export interface TaxRule {
  id: string;
  version: string;
  label: string;
  kind: "RATE" | "EXEMPT" | "NOT_APPLICABLE";
  bp: number | null;
}

export const emptyLine = (id = "line-1"): QuoteLine => ({ id, source: "MANUAL", productKey: "", name: "", quantity: "", unit: "", unitPrice: "", moq: "", discountKind: "NONE", discountValue: "" });

// ---------- India-time validity ----------
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
export const istDateText = (ms: number) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
/** The instant an offer valid until `text` ends: 23:59:59.999 India time that day. null for anything that is not a real calendar date. */
export function validityEnd(text: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = Date.UTC(y, mo - 1, d, 23, 59, 59, 999);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return new Date(utc - IST_OFFSET_MS);
}
export const defaultValidity = (now = Date.now()) => istDateText(now + DEFAULT_VALIDITY_DAYS * DAY_MS);

// ---------- normalising what a client sent (types, lengths, number formats; never business completeness) ----------
const text = (v: unknown, max: number, fields: Record<string, string>, key: string): string => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") {
    fields[key] = "Send text for this field.";
    return "";
  }
  const clean = v.normalize("NFKC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim();
  if (clean.length > max) {
    fields[key] = `At most ${max} characters.`;
    return clean.slice(0, max);
  }
  return clean;
};
const oneLine = (v: string) => v.replace(/\s+/g, " ");

/**
 * Allow-list normaliser. Only the fields of QuoteInput are read (anything else, such as totals, supplierKey, buyerId, status or createdBy, is dropped).
 * Non-empty amounts, percentages and quantities must be well formed even in a draft; an EMPTY one is simply "not filled in yet".
 */
export function normaliseInput(raw: unknown): { value: QuoteInput; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const linesRaw = Array.isArray(r.lines) ? r.lines : r.lines === undefined ? [] : null;
  if (linesRaw === null) fields.lines = "Send a list of line items.";
  if (linesRaw && linesRaw.length > MAX_LINES) fields.lines = `At most ${MAX_LINES} line item${MAX_LINES === 1 ? "" : "s"} can be quoted.`;
  const lines: QuoteLine[] = (linesRaw ?? []).slice(0, MAX_LINES).map((item, i) => {
    const l = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const k = (f: string) => `lines.${i}.${f}`;
    const idRaw = text(l.id, LIMITS.id, fields, k("id"));
    const source = (LINE_SOURCES as readonly string[]).includes(String(l.source)) ? (l.source as LineSource) : "MANUAL";
    const quantity = text(l.quantity, 10, fields, k("quantity"));
    if (quantity && !fields[k("quantity")]) {
      const q = parseQuantity(quantity);
      if (!q.ok) fields[k("quantity")] = q.error;
    }
    const unitPrice = text(l.unitPrice, 16, fields, k("unitPrice"));
    if (unitPrice && !fields[k("unitPrice")]) {
      const p = parseMoney(unitPrice, "The unit price");
      if (!p.ok) fields[k("unitPrice")] = p.error;
    }
    const moq = text(l.moq, 10, fields, k("moq"));
    if (moq && !fields[k("moq")]) {
      const q = parseQuantity(moq, "The minimum order quantity");
      if (!q.ok) fields[k("moq")] = q.error;
    }
    const discountKind = l.discountKind === "PERCENT" || l.discountKind === "AMOUNT" ? l.discountKind : "NONE";
    if (l.discountKind !== undefined && l.discountKind !== "NONE" && l.discountKind !== "PERCENT" && l.discountKind !== "AMOUNT") fields[k("discountKind")] = "Choose none, percent or amount.";
    const discountValue = discountKind === "NONE" ? "" : text(l.discountValue, 16, fields, k("discountValue"));
    if (discountValue && !fields[k("discountValue")]) {
      const d = discountKind === "PERCENT" ? parsePercent(discountValue, "The discount") : parseMoney(discountValue, "The discount");
      if (!d.ok) fields[k("discountValue")] = d.error;
    }
    return {
      id: /^[A-Za-z0-9_-]{1,40}$/.test(idRaw) ? idRaw : `line-${i + 1}`,
      source,
      productKey: text(l.productKey, LIMITS.key, fields, k("productKey")),
      name: oneLine(text(l.name, LIMITS.name, fields, k("name"))),
      quantity,
      unit: oneLine(text(l.unit, LIMITS.unit, fields, k("unit"))),
      unitPrice,
      moq,
      discountKind,
      discountValue,
    };
  });

  const money = (key: string, value: unknown, label: string) => {
    const v = text(value, 16, fields, key);
    if (v && !fields[key]) {
      const p = parseMoney(v, label);
      if (!p.ok) fields[key] = p.error;
    }
    return v;
  };
  const chargesRaw = Array.isArray(r.charges) ? r.charges : r.charges === undefined ? [] : null;
  if (chargesRaw === null) fields.charges = "Send a list of charges.";
  if (chargesRaw && chargesRaw.length > MAX_EXTRA_CHARGES) fields.charges = `At most ${MAX_EXTRA_CHARGES} additional charges.`;
  const charges = (chargesRaw ?? []).slice(0, MAX_EXTRA_CHARGES).map((c, i) => {
    const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    return { label: oneLine(text(o.label, LIMITS.label, fields, `charges.${i}.label`)), amount: money(`charges.${i}.amount`, o.amount, "The charge") };
  });

  const percent = (key: string, value: unknown, label: string) => {
    const v = text(value, 7, fields, key);
    if (v && !fields[key]) {
      const p = parsePercent(v, label);
      if (!p.ok) fields[key] = p.error;
    }
    return v;
  };
  const whole = (key: string, value: unknown, max: number, label: string) => {
    const v = text(value, 4, fields, key);
    if (v && !fields[key] && (!/^\d{1,4}$/.test(v) || Number(v) > max)) fields[key] = `${label} must be a whole number up to ${max}.`;
    return v;
  };
  const currency = text(r.currency, 3, fields, "currency").toUpperCase();
  if (currency && !(QUOTE_CURRENCIES as readonly string[]).includes(currency)) fields.currency = `Choose one of: ${QUOTE_CURRENCIES.join(", ")}.`;
  const validUntil = text(r.validUntil, 10, fields, "validUntil");
  if (validUntil && !fields.validUntil && !validityEnd(validUntil)) fields.validUntil = "Enter a real date.";
  const deliveryTerms = text(r.deliveryTerms, 8, fields, "deliveryTerms");
  if (deliveryTerms && !DELIVERY_TERMS.some((d) => d.value === deliveryTerms)) fields.deliveryTerms = "Choose one of the listed delivery terms.";
  const paymentType = text(r.paymentType, 12, fields, "paymentType");
  if (paymentType && !PAYMENT_TYPES.some((p) => p.value === paymentType)) fields.paymentType = "Choose one of the listed payment terms.";

  return {
    fields,
    value: {
      currency,
      validUntil,
      lines,
      taxRuleId: text(r.taxRuleId, LIMITS.taxRuleId, fields, "taxRuleId"),
      freight: money("freight", r.freight, "The freight charge"),
      charges,
      leadTimeDays: whole("leadTimeDays", r.leadTimeDays, MAX_LEAD_DAYS, "The lead time"),
      deliveryTerms,
      paymentType,
      advancePercent: percent("advancePercent", r.advancePercent, "The advance percentage"),
      netDays: whole("netDays", r.netDays, 180, "The number of days"),
      notes: text(r.notes, LIMITS.notes, fields, "notes"),
    },
  };
}

// ---------- tax ----------
export const taxOf = (rule: TaxRule): { label: string; bp: number } => ({ label: rule.label, bp: rule.kind === "RATE" ? (rule.bp ?? 0) : 0 });

// ---------- calculation ----------
export interface Calculation {
  /** false while something needed for the amount is missing or invalid; the numbers below are then only what could be worked out. */
  priced: boolean;
  issues: string[];
  currency: string;
  subtotal: string | null;
  discount: string | null;
  taxable: string | null;
  tax: string | null;
  taxLabel: string | null;
  freight: string;
  otherCharges: string;
  /** subtotal - discount + freight + other charges, BEFORE tax: shown as the provisional amount while tax is unresolved. */
  provisional: string | null;
  /** The final total, only when a configured tax rule is selected and everything is priced. Otherwise null ("Pending tax review"). */
  total: string | null;
  taxResolved: boolean;
}

const parsedLine = (input: QuoteInput) => {
  const line = input.lines[0];
  if (!line) return { error: "Add a line item." as string | null, line: null, qty: 0, price: 0, discount: null as Discount | null };
  const q = parseQuantity(line.quantity);
  const p = parseMoney(line.unitPrice, "The unit price");
  if (!q.ok) return { error: q.error, line, qty: 0, price: 0, discount: null as Discount | null };
  if (!p.ok) return { error: p.error, line, qty: 0, price: 0, discount: null as Discount | null };
  let discount: Discount | null = null;
  if (line.discountKind !== "NONE" && line.discountValue) {
    const d = line.discountKind === "PERCENT" ? parsePercent(line.discountValue, "The discount") : parseMoney(line.discountValue, "The discount");
    if (!d.ok) return { error: d.error, line, qty: 0, price: 0, discount: null };
    discount = line.discountKind === "PERCENT" ? { kind: "PERCENT", bp: d.value } : { kind: "AMOUNT", minor: d.value };
  }
  return { error: null, line, qty: q.value, price: p.value, discount };
};

/** The one calculation. Exact integer arithmetic through money.ts; never throws; never returns a final total without a resolved tax rule. */
export function computeQuote(input: QuoteInput, rule: TaxRule | null): Calculation {
  const issues: string[] = [];
  const currency = input.currency || "INR";
  const blank: Calculation = { priced: false, issues, currency, subtotal: null, discount: null, taxable: null, tax: null, taxLabel: null, freight: "0.00", otherCharges: "0.00", provisional: null, total: null, taxResolved: Boolean(rule) };
  const freight = input.freight ? parseMoney(input.freight, "The freight charge") : { ok: true as const, value: 0 };
  if (!freight.ok) issues.push(freight.error);
  const extra: { label: string; minor: number }[] = [];
  let extraTotal = 0;
  input.charges.forEach((c, i) => {
    if (!c.amount) return;
    const a = parseMoney(c.amount, "The charge");
    if (!a.ok) issues.push(a.error);
    else {
      extra.push({ label: c.label || `Charge ${i + 1}`, minor: a.value });
      extraTotal += a.value;
    }
  });
  const pl = parsedLine(input);
  if (pl.error) {
    issues.push(pl.error);
    return { ...blank, freight: freight.ok ? formatDecimal(freight.value) : "0.00", otherCharges: formatDecimal(extraTotal) };
  }
  if (BigInt(pl.price) * BigInt(pl.qty) > BigInt(MAX_SAFE_MINOR) / BigInt(2) || extraTotal + (freight.ok ? freight.value : 0) > MAX_AMOUNT_MINOR * 4) {
    issues.push("The amount is too large.");
    return blank;
  }
  const freightMinor = freight.ok ? freight.value : 0;
  const charges = [...(freightMinor > 0 ? [{ label: "Freight", minor: freightMinor }] : []), ...extra];
  const tax = rule ? taxOf(rule) : null;
  const result = priceBreakdown({ unitPriceMinor: pl.price, quantity: pl.qty, discount: pl.discount, tax, charges });
  if (!result.ok) {
    issues.push(result.error);
    return blank;
  }
  const b = result.value;
  return {
    priced: issues.length === 0,
    issues,
    currency,
    subtotal: formatDecimal(b.subtotalMinor),
    discount: formatDecimal(b.discountMinor),
    taxable: formatDecimal(b.taxableMinor),
    tax: b.taxMinor === null ? null : formatDecimal(b.taxMinor),
    taxLabel: rule ? (rule.kind === "RATE" ? `${rule.label}` : rule.label) : null,
    freight: formatDecimal(freightMinor),
    otherCharges: formatDecimal(extraTotal),
    provisional: formatDecimal(b.taxableMinor + b.chargesMinor),
    total: rule && issues.length === 0 ? formatDecimal(b.totalMinor) : null,
    taxResolved: Boolean(rule),
  };
}

// ---------- submission checks ----------
export interface InquiryFacts {
  quantity: number;
  unit: string | null;
  productName: string | null;
}

/** Everything a quotation must have before it can be sent. Field keys match the form ids; messages are in words. Drafts are NOT held to this. */
export function validateForSubmit(input: QuoteInput, ctx: { inquiry: InquiryFacts; taxRules: TaxRule[]; now?: Date }): Record<string, string> {
  const f: Record<string, string> = {};
  const now = ctx.now ?? new Date();
  if (!(QUOTE_CURRENCIES as readonly string[]).includes(input.currency)) f.currency = "Choose the currency of the offer.";
  const end = validityEnd(input.validUntil);
  if (!end) f.validUntil = "Choose the last day the offer is valid.";
  else if (end.getTime() <= now.getTime()) f.validUntil = "The validity date has already passed.";
  else if (end.getTime() > now.getTime() + (MAX_VALIDITY_DAYS + 1) * DAY_MS) f.validUntil = `An offer can be valid for at most ${MAX_VALIDITY_DAYS} days.`;

  const line = input.lines[0];
  if (!line) f.lines = "Add a line item.";
  else {
    const k = (n: string) => `lines.0.${n}`;
    if (!line.name) f[k("name")] = "Enter the product or item name.";
    const qty = parseQuantity(line.quantity);
    if (!line.quantity) f[k("quantity")] = "Enter the quantity you can supply.";
    else if (!qty.ok) f[k("quantity")] = qty.error;
    if (!line.unit) f[k("unit")] = "Enter the unit.";
    else if (ctx.inquiry.unit && line.unit.toLowerCase() !== ctx.inquiry.unit.toLowerCase()) f[k("unit")] = `The buyer asked for ${ctx.inquiry.unit}. Units are not converted: quote in ${ctx.inquiry.unit}.`;
    const price = parseMoney(line.unitPrice, "The unit price");
    if (!line.unitPrice) f[k("unitPrice")] = "Enter the unit price.";
    else if (!price.ok) f[k("unitPrice")] = price.error;
    else if (price.value === 0) f[k("unitPrice")] = "A zero price is not accepted.";
    if (line.moq && qty.ok) {
      const moq = parseQuantity(line.moq, "The minimum order quantity");
      if (moq.ok && qty.value < moq.value) f[k("quantity")] = `The quantity is below your own minimum order quantity (${moq.value} ${line.unit}).`;
    }
    if (line.discountKind !== "NONE") {
      if (!line.discountValue) f[k("discountValue")] = "Enter the discount, or choose no discount.";
      else if (line.discountKind === "AMOUNT" && qty.ok && price.ok) {
        const d = parseMoney(line.discountValue, "The discount");
        if (d.ok && BigInt(d.value) > BigInt(qty.value) * BigInt(price.value)) f[k("discountValue")] = "The discount cannot be more than the item subtotal.";
      }
    }
    if (qty.ok && price.ok && BigInt(qty.value) * BigInt(price.value) > BigInt(MAX_SAFE_MINOR) / BigInt(2)) f[k("unitPrice")] = "The amount is too large.";
  }

  if (ctx.taxRules.length === 0) f.taxRuleId = "No tax treatment is configured on this platform yet, so a quotation cannot be submitted.";
  else if (!input.taxRuleId) f.taxRuleId = "Select the approved tax treatment.";
  else if (!ctx.taxRules.some((r) => r.id === input.taxRuleId)) f.taxRuleId = "This tax treatment is not available (it may have been changed). Select one from the list.";

  input.charges.forEach((c, i) => {
    if (c.amount && !c.label) f[`charges.${i}.label`] = "Name this charge.";
  });
  const lead = Number(input.leadTimeDays);
  if (!input.leadTimeDays) f.leadTimeDays = "Enter the lead time in days.";
  else if (!Number.isInteger(lead) || lead < 1) f.leadTimeDays = "The lead time must be at least 1 day.";
  if (!input.deliveryTerms) f.deliveryTerms = "Choose the delivery terms.";
  if (!input.paymentType) f.paymentType = "Choose the payment terms.";
  else if (input.paymentType === "ADVANCE") {
    const a = parsePercent(input.advancePercent, "The advance percentage");
    if (!input.advancePercent) f.advancePercent = "Enter the advance percentage.";
    else if (!a.ok) f.advancePercent = a.error;
    else if (a.value < 100) f.advancePercent = "The advance must be at least 1%.";
  } else if (input.paymentType === "NET_DAYS") {
    if (!input.netDays || Number(input.netDays) < 1) f.netDays = "Enter the number of days (1 to 180).";
  }
  return f;
}

export const paymentText = (i: Pick<QuoteInput, "paymentType" | "advancePercent" | "netDays">): string | null => {
  if (i.paymentType === "ADVANCE") return i.advancePercent ? `${i.advancePercent}% advance, balance as agreed` : null;
  if (i.paymentType === "ON_DELIVERY") return "Payment on delivery";
  if (i.paymentType === "NET_DAYS") return i.netDays ? `Payment within ${i.netDays} days` : null;
  return null;
};

export const emptyInput = (now = Date.now()): QuoteInput => ({ currency: "INR", validUntil: defaultValidity(now), lines: [emptyLine()], taxRuleId: "", freight: "", charges: [], leadTimeDays: "", deliveryTerms: "", paymentType: "", advancePercent: "", netDays: "", notes: "" });

export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;
