/**
 * Category-driven product attributes (pure and client-safe: the supplier form, the requirement form, the server and the node tests share this file).
 *
 * An attribute set belongs to a MAIN category (`CATEGORY_SET`); a category with no set has no specification fields and its supplier products carry no attributes
 * (they are never given defaults and cannot be matched). Today the only set is "textile", used by Apparel & Fashion, with the attributes a fabric or garment
 * buyer really specifies. Nothing here is inferred from a title or an image: an attribute is present only when a supplier entered it, and an absent attribute stays absent.
 *
 * Matching semantics (policy match-2, docs/leads/MATCHING_POLICY.md):
 *  - "equal": enumerations by approved value, text by normalised equality. An option flagged `matchable: false` ("other") never equals anything, not even itself.
 *  - "range": numbers are converted to the attribute's base unit by a DEFINED factor (cm to inch is exactly 2.54) and compared with a documented tolerance.
 *  - units without a defined conversion are never compared; a candidate missing an attribute the requirement specifies is never a match.
 */
export type AttrType = "enum" | "number" | "text";
export interface AttrOption { value: string; label: string; matchable?: boolean }
export interface AttrUnit { code: string; label: string; /** multiply a value in this unit by this factor to get the base unit */ toBase: number }
export interface AttrDef {
  id: string;
  label: string;
  type: AttrType;
  options?: AttrOption[];
  units?: AttrUnit[];
  min?: number;
  max?: number;
  maxDecimals?: number;
  textMin?: number;
  textMax?: number;
  /** A supplier must give it to submit a product, and a requirement always carries it. */
  required: boolean;
  matching: "equal" | "range";
  /** range only: |candidate - requested| <= requested * tolerancePct / 100, both in the base unit. */
  tolerancePct?: number;
  /** order on a product card (lower first); only the first three present values are shown there */
  cardPriority: number;
}
export interface AttrValue { value: string | number; unit?: string }
export type AttrMap = Record<string, AttrValue>;

const opt = (value: string, label: string, matchable = true): AttrOption => ({ value, label, matchable });

export const TEXTILE_TYPES: AttrOption[] = [opt("fabric", "Fabric"), opt("t-shirt", "T-shirt"), opt("shirt", "Shirt"), opt("trousers", "Trousers"), opt("jacket", "Jacket"), opt("dress", "Dress"), opt("uniform", "Uniform"), opt("other", "Other (not matched automatically)", false)];

export const ATTRIBUTE_SETS: Record<string, AttrDef[]> = {
  textile: [
    { id: "type", label: "Product type", type: "enum", options: TEXTILE_TYPES, required: true, matching: "equal", cardPriority: 7 },
    { id: "composition", label: "Composition", type: "enum", options: [opt("cotton", "Cotton"), opt("polyester", "Polyester"), opt("viscose", "Viscose"), opt("linen", "Linen"), opt("wool", "Wool"), opt("silk", "Silk"), opt("nylon", "Nylon"), opt("cotton-polyester", "Cotton-polyester blend"), opt("polyester-viscose", "Polyester-viscose blend"), opt("other", "Other (not matched automatically)", false)], required: true, matching: "equal", cardPriority: 1 },
    { id: "colour", label: "Colour", type: "text", textMin: 2, textMax: 30, required: true, matching: "equal", cardPriority: 4 },
    { id: "gsm", label: "Weight (GSM)", type: "number", units: [{ code: "gsm", label: "g/m²", toBase: 1 }], min: 20, max: 1000, maxDecimals: 0, required: false, matching: "range", tolerancePct: 10, cardPriority: 2 },
    { id: "width", label: "Width", type: "number", units: [{ code: "cm", label: "cm", toBase: 1 }, { code: "inch", label: "inch", toBase: 2.54 }], min: 10, max: 400, maxDecimals: 1, required: false, matching: "range", tolerancePct: 3, cardPriority: 3 },
    { id: "weave", label: "Weave", type: "enum", options: [opt("plain", "Plain"), opt("twill", "Twill"), opt("satin", "Satin"), opt("jersey", "Jersey"), opt("rib", "Rib"), opt("denim", "Denim"), opt("other", "Other (not matched automatically)", false)], required: false, matching: "equal", cardPriority: 5 },
    { id: "finish", label: "Finish", type: "enum", options: [opt("none", "None"), opt("mercerised", "Mercerised"), opt("brushed", "Brushed"), opt("water-repellent", "Water-repellent"), opt("other", "Other (not matched automatically)", false)], required: false, matching: "equal", cardPriority: 6 },
  ],
};

/** Main category id -> attribute set id. A main category absent here has no specification fields (and no automatic matching of supplier products). */
export const CATEGORY_SET: Record<string, string> = { "apparel-fashion": "textile" };

export const mainCategoryOf = (nodeId: string): string => nodeId.split("/")[0];
export function attributeSetFor(nodeId: string): { id: string; defs: AttrDef[] } | null {
  const id = CATEGORY_SET[mainCategoryOf(nodeId)];
  return id ? { id, defs: ATTRIBUTE_SETS[id] } : null;
}
export const supportedMainCategories = (): string[] => Object.keys(CATEGORY_SET);

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const decimals = (n: number) => (String(n).split(".")[1] ?? "").length;

export type AttributeErrors = Record<string, string>;
export type ParsedAttributes = { ok: true; value: AttrMap } | { ok: false; errors: AttributeErrors };

/**
 * Validates raw input ({ id: { value, unit } } with strings from a form, or already-typed values) against the category's set. Unknown attributes are an error
 * (no hidden attributes), an empty value means "not given". `requireRequired` is true for submission and for a requirement.
 */
export function validateAttributes(nodeId: string, raw: unknown, opts: { requireRequired: boolean }): ParsedAttributes {
  const set = attributeSetFor(nodeId);
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const errors: AttributeErrors = {};
  const out: AttrMap = {};
  if (!set) {
    for (const [k, v] of Object.entries(input)) if (cellText(v) !== "") errors[k] = "This category has no specification fields.";
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: {} };
  }
  const defs = new Map(set.defs.map((d) => [d.id, d]));
  for (const k of Object.keys(input)) if (!defs.has(k)) errors[k] = "This is not a specification of this category.";
  for (const d of set.defs) {
    const cell = input[d.id];
    const text = cellText(cell);
    if (text === "") {
      if (d.required && opts.requireRequired) errors[d.id] = `${d.label} is required.`;
      continue;
    }
    if (d.type === "enum") {
      if (!d.options!.some((o) => o.value === text)) errors[d.id] = "Choose one of the listed values.";
      else out[d.id] = { value: text };
    } else if (d.type === "text") {
      const t = text.replace(/\s+/g, " ").trim();
      if (t.length < (d.textMin ?? 1) || t.length > (d.textMax ?? 60) || !/^[\p{L}][\p{L}\p{N} \-/]*$/u.test(t)) errors[d.id] = `Use ${d.textMin ?? 1} to ${d.textMax ?? 60} letters or digits, starting with a letter.`;
      else out[d.id] = { value: t };
    } else {
      const unitRaw = cellUnit(cell);
      const unit = d.units!.find((u) => u.code === (unitRaw || d.units![0].code));
      if (!unit || (d.units!.length > 1 && !unitRaw)) { errors[d.id] = "Choose a listed unit."; continue; }
      if (!/^\d{1,6}(\.\d{1,3})?$/.test(text)) { errors[d.id] = "Enter a plain positive number."; continue; }
      const n = Number(text);
      const base = n * unit.toBase;
      if (decimals(n) > (d.maxDecimals ?? 0)) errors[d.id] = `Use at most ${d.maxDecimals ?? 0} decimal places.`;
      else if (base < (d.min ?? 0) || base > (d.max ?? Infinity)) errors[d.id] = `Enter a value between ${d.min} and ${d.max} ${d.units![0].label} (or its equivalent).`;
      else out[d.id] = { value: n, unit: unit.code };
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: out };
}

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string") return cell.trim();
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
  if (typeof cell === "object") return cellText((cell as { value?: unknown }).value);
  return "";
}
function cellUnit(cell: unknown): string {
  return cell && typeof cell === "object" && typeof (cell as { unit?: unknown }).unit === "string" ? ((cell as { unit: string }).unit).trim() : "";
}

const toBase = (d: AttrDef, v: AttrValue): number | null => {
  if (typeof v.value !== "number") return null;
  const unit = d.units?.find((u) => u.code === (v.unit ?? d.units![0].code));
  return unit ? v.value * unit.toBase : null;
};

/** One attribute: does `candidate` satisfy what the requirement asks for? A missing or incomparable value is never a match. */
export function attributeCompatible(def: AttrDef, required: AttrValue | undefined, candidate: AttrValue | undefined): boolean {
  if (!required) return true;
  if (!candidate) return false;
  if (def.type === "enum") {
    const o = def.options!.find((x) => x.value === required.value);
    return Boolean(o && o.matchable !== false && required.value === candidate.value);
  }
  if (def.type === "text") return typeof required.value === "string" && typeof candidate.value === "string" && norm(required.value) !== "" && norm(required.value) === norm(candidate.value);
  const r = toBase(def, required), c = toBase(def, candidate);
  if (r === null || c === null || r <= 0) return false;
  return Math.abs(c - r) <= (r * (def.tolerancePct ?? 0)) / 100 + 1e-9;
}

/** Every attribute of the requirement must be present and compatible in the candidate (attributes the requirement leaves out are not required of the candidate). */
export function attributesMatch(nodeId: string, required: AttrMap, candidate: AttrMap): boolean {
  const set = attributeSetFor(nodeId);
  if (!set) return false;
  const ids = Object.keys(required);
  if (ids.length === 0) return false;
  return ids.every((id) => {
    const def = set.defs.find((d) => d.id === id);
    return def ? attributeCompatible(def, required[id], candidate[id]) : false;
  });
}

export const attributeLabel = (def: AttrDef, v: AttrValue): string => {
  if (def.type === "enum") return def.options!.find((o) => o.value === v.value)?.label ?? String(v.value);
  if (def.type === "number") return `${v.value} ${def.units?.find((u) => u.code === (v.unit ?? def.units![0].code))?.label ?? ""}`.trim();
  return String(v.value);
};

/** Genuine attributes for display, in the set's priority order, at most `max` (a product card shows three). Unknown ids are dropped, never shown. */
export function displayAttributes(nodeId: string, attrs: AttrMap | undefined, max = 99): { id: string; label: string; value: string }[] {
  const set = attributeSetFor(nodeId);
  if (!set || !attrs) return [];
  return set.defs
    .filter((d) => attrs[d.id] !== undefined)
    .sort((a, b) => a.cardPriority - b.cardPriority)
    .slice(0, max)
    .map((d) => ({ id: d.id, label: d.label, value: attributeLabel(d, attrs[d.id]) }));
}
