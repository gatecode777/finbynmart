import { formatDecimal } from "./decimal";
import { priceBreakdown, type Discount } from "./money";

/**
 * Comparing two versions of one quotation (Page 44). Pure: the same functions serve the API, the page and the node-run unit tests, and nothing here reads or
 * writes a database, so a comparison can never change either version.
 *
 * A version is first turned into a flat, display-ready `VersionView` from ITS OWN stored data (the submitted snapshot when there is one, otherwise the stored
 * fields of an older record); today's catalogue, tax configuration and company profile are never consulted. Line items are matched by their stable id
 * (never by name or position). Every difference is a text row with a Before and an After; a numeric difference is given only between amounts of the SAME
 * currency, and a currency change is reported as a change in its own right.
 */
export interface VersionSource {
  version: number;
  status: string;
  currency: string;
  unit: string | null;
  quantity: number;
  unitPriceMinor: number;
  productName: string;
  productKey?: string;
  discount?: Discount | null;
  tax?: { label: string; bp: number } | null;
  charges?: { label: string; minor: number }[];
  moq?: { quantity: number; unit: string } | null;
  terms?: { deliveryMinDays?: number | null; deliveryMaxDays?: number | null; deliveryLocation?: string | null; incoterms?: string | null; paymentTerms?: string | null; packaging?: string | null; warranty?: string | null; qualityTerms?: string | null; remarks?: string | null };
  productSnapshot?: { description?: string | null; specs: { label: string; value: string }[]; features: string[] };
  attachments?: { name: string }[];
  validUntil: Date;
  snapshot?: { input?: unknown; amounts: { subtotal: string; discount: string; taxable: string; tax: string | null; freight: string; otherCharges: string; total: string } };
}

export interface VersionAmounts {
  subtotal: string;
  discount: string;
  taxable: string;
  tax: string | null;
  charges: string;
  total: string;
}

export interface VersionView {
  version: number;
  status: string;
  currency: string;
  lines: { id: string; name: string; specs: string[]; quantity: string; unitPrice: string; moq: string | null; discount: string | null }[];
  taxText: string | null;
  charges: { label: string; amount: string }[];
  amounts: VersionAmounts | null;
  /** "snapshot": the amounts stored at submission; "stored": worked out from the version's own stored fields (an older record); "unavailable": they cannot be worked out. */
  amountsSource: "snapshot" | "stored" | "unavailable";
  terms: { key: string; label: string; value: string | null }[];
  validUntil: string;
  notes: string | null;
  attachments: string[];
}

const percentText = (bp: number) => `${Math.floor(bp / 100)}${bp % 100 === 0 ? "" : `.${String(bp % 100).padStart(2, "0").replace(/0$/, "")}`}%`;
const dayText = (min?: number | null, max?: number | null) => (min && max && min !== max ? `${min} - ${max} days` : min || max ? `${min ?? max} days` : null);

/** The line's stable id: the one the create workflow stored on the snapshot, else the single legacy line is "line-1". */
function lineIdOf(src: VersionSource): string {
  const input = src.snapshot?.input as { lines?: { id?: unknown }[] } | undefined;
  const id = input?.lines?.[0]?.id;
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : "line-1";
}

export function buildVersionView(src: VersionSource): VersionView {
  let amounts: VersionAmounts | null = null;
  let source: VersionView["amountsSource"] = "unavailable";
  if (src.snapshot?.amounts) {
    const a = src.snapshot.amounts;
    amounts = { subtotal: a.subtotal, discount: a.discount, taxable: a.taxable, tax: a.tax, charges: addDecimals(a.freight, a.otherCharges), total: a.total };
    source = "snapshot";
  } else {
    const r = priceBreakdown({ unitPriceMinor: src.unitPriceMinor, quantity: src.quantity, discount: src.discount ?? null, tax: src.tax ?? null, charges: src.charges ?? [] });
    if (r.ok) {
      amounts = { subtotal: formatDecimal(r.value.subtotalMinor), discount: formatDecimal(r.value.discountMinor), taxable: formatDecimal(r.value.taxableMinor), tax: r.value.taxMinor === null ? null : formatDecimal(r.value.taxMinor), charges: formatDecimal(r.value.chargesMinor), total: formatDecimal(r.value.totalMinor) };
      source = "stored";
    }
  }
  const t = src.terms ?? {};
  const specs = [...(src.productSnapshot?.specs ?? []).map((s) => `${s.label}: ${s.value}`), ...(src.productSnapshot?.features ?? [])];
  return {
    version: src.version,
    status: src.status,
    currency: src.currency,
    lines: [
      {
        id: lineIdOf(src),
        name: src.productName,
        specs,
        quantity: `${src.quantity}${src.unit ? ` ${src.unit}` : ""}`,
        unitPrice: formatDecimal(src.unitPriceMinor),
        moq: src.moq ? `${src.moq.quantity} ${src.moq.unit}` : null,
        discount: src.discount ? (src.discount.kind === "PERCENT" ? percentText(src.discount.bp) : formatDecimal(src.discount.minor)) : null,
      },
    ],
    taxText: src.tax ? `${src.tax.label} (${percentText(src.tax.bp)})` : null,
    charges: (src.charges ?? []).map((c) => ({ label: c.label, amount: formatDecimal(c.minor) })),
    amounts,
    amountsSource: source,
    terms: [
      { key: "lead", label: "Lead time", value: dayText(t.deliveryMinDays, t.deliveryMaxDays) },
      { key: "location", label: "Delivery location", value: t.deliveryLocation ?? null },
      { key: "incoterms", label: "Delivery terms", value: t.incoterms ?? null },
      { key: "payment", label: "Payment terms", value: t.paymentTerms ?? null },
      { key: "packaging", label: "Packaging", value: t.packaging ?? null },
      { key: "warranty", label: "Warranty", value: t.warranty ?? null },
      { key: "quality", label: "Quality terms", value: t.qualityTerms ?? null },
    ],
    validUntil: src.validUntil.toISOString(),
    notes: t.remarks ?? null,
    attachments: (src.attachments ?? []).map((a) => a.name),
  };
}

function addDecimals(a: string, b: string): string {
  return formatDecimal(Number(a.replace(".", "")) + Number(b.replace(".", "")));
}

// ---------- the comparison ----------
export type ChangeGroup = "Currency" | "Item" | "Pricing" | "Terms" | "Validity" | "Notes" | "Attachments";
export interface Change {
  key: string;
  group: ChangeGroup;
  label: string;
  before: string | null;
  after: string | null;
  kind: "added" | "removed" | "changed";
  /** false when only spacing or letter case differs (a formatting-only difference); true for a real change. */
  commercial: boolean;
  /** Signed difference ("+1500.00") only for amounts in the SAME currency; null otherwise. */
  delta: string | null;
}
export interface Comparison {
  from: number;
  to: number;
  currencyChanged: boolean;
  identical: boolean;
  commercialChanges: number;
  formattingOnly: number;
  changes: Change[];
}

const norm = (s: string | null) => (s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
const minorOf = (decimal: string): bigint => BigInt(decimal.replace(".", ""));
const signed = (a: string, b: string): string => {
  const d = minorOf(b) - minorOf(a);
  const abs = d < BigInt(0) ? -d : d;
  const text = `${abs / BigInt(100)}.${String(abs % BigInt(100)).padStart(2, "0")}`;
  return d === BigInt(0) ? "0.00" : `${d < BigInt(0) ? "-" : "+"}${text}`;
};

export function compareViews(a: VersionView, b: VersionView): Comparison {
  const changes: Change[] = [];
  const sameCurrency = a.currency === b.currency;
  const push = (group: ChangeGroup, key: string, label: string, before: string | null, after: string | null, opts: { money?: boolean } = {}) => {
    if ((before ?? null) === (after ?? null)) return;
    const kind: Change["kind"] = before === null ? "added" : after === null ? "removed" : "changed";
    const commercial = !(before !== null && after !== null && norm(before) === norm(after));
    const delta = opts.money && sameCurrency && before !== null && after !== null && /^-?\d+\.\d\d$/.test(before) && /^-?\d+\.\d\d$/.test(after) ? signed(before, after) : null;
    changes.push({ key, group, label, before, after, kind, commercial, delta });
  };

  if (!sameCurrency) push("Currency", "currency", "Currency", a.currency, b.currency);

  // line items: matched by stable id, never by name or position
  const ids = [...new Set([...a.lines.map((l) => l.id), ...b.lines.map((l) => l.id)])];
  for (const id of ids) {
    const la = a.lines.find((l) => l.id === id);
    const lb = b.lines.find((l) => l.id === id);
    if (la && !lb) {
      push("Item", `line:${id}`, `Line item "${la.name}"`, `${la.name} · ${la.quantity} at ${la.unitPrice}`, null);
      continue;
    }
    if (!la && lb) {
      push("Item", `line:${id}`, `Line item "${lb.name}"`, null, `${lb.name} · ${lb.quantity} at ${lb.unitPrice}`);
      continue;
    }
    if (!la || !lb) continue;
    const L = `Line "${lb.name}"`;
    push("Item", `${id}:name`, `${L}: product name`, la.name, lb.name);
    push("Item", `${id}:specs`, `${L}: specifications`, la.specs.join("; ") || null, lb.specs.join("; ") || null);
    push("Item", `${id}:qty`, `${L}: quantity and unit`, la.quantity, lb.quantity);
    push("Pricing", `${id}:price`, `${L}: unit price`, la.unitPrice, lb.unitPrice, { money: true });
    push("Pricing", `${id}:moq`, `${L}: minimum order quantity`, la.moq, lb.moq);
    push("Pricing", `${id}:discount`, `${L}: discount`, la.discount, lb.discount);
  }
  push("Pricing", "tax", "Tax", a.taxText, b.taxText);
  const chargeKeys = [...new Set([...a.charges.map((c) => c.label), ...b.charges.map((c) => c.label)])];
  for (const label of chargeKeys) push("Pricing", `charge:${label}`, label, a.charges.find((c) => c.label === label)?.amount ?? null, b.charges.find((c) => c.label === label)?.amount ?? null, { money: true });
  if (a.amounts && b.amounts) {
    push("Pricing", "subtotal", "Subtotal", a.amounts.subtotal, b.amounts.subtotal, { money: true });
    push("Pricing", "taxamount", "Tax amount", a.amounts.tax, b.amounts.tax, { money: true });
    push("Pricing", "total", "Total", a.amounts.total, b.amounts.total, { money: true });
  } else if (a.amounts?.total !== b.amounts?.total) push("Pricing", "total", "Total", a.amounts?.total ?? null, b.amounts?.total ?? null, { money: true });
  for (const t of a.terms) push("Terms", `term:${t.key}`, t.label, t.value, b.terms.find((x) => x.key === t.key)?.value ?? null);
  push("Validity", "valid", "Valid until", a.validUntil.slice(0, 10), b.validUntil.slice(0, 10));
  push("Notes", "notes", "Notes", a.notes, b.notes);
  const names = [...new Set([...a.attachments, ...b.attachments])];
  for (const n of names) push("Attachments", `att:${n}`, `Attachment "${n}"`, a.attachments.includes(n) ? "Attached" : null, b.attachments.includes(n) ? "Attached" : null);

  const commercialChanges = changes.filter((c) => c.commercial).length;
  return { from: a.version, to: b.version, currencyChanged: !sameCurrency, identical: changes.length === 0, commercialChanges, formattingOnly: changes.length - commercialChanges, changes };
}
