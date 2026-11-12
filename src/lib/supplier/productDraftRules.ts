/**
 * Client-safe rules for the supplier Add Product draft (Page 40). One source for the form, the API and the tests.
 * Money is an integer in paise parsed from a decimal string (never a float). Only INR exists in the repo today.
 */
export const PRICING_MODES = ["FIXED", "ON_REQUEST"] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

/** Units stored as stable codes. No conversion between them is ever done: price unit and quantity unit must match. */
export const UNITS = [
  { code: "piece", label: "Piece" },
  { code: "metre", label: "Metre" },
  { code: "kg", label: "Kilogram" },
  { code: "tonne", label: "Tonne" },
  { code: "roll", label: "Roll" },
  { code: "box", label: "Box" },
  { code: "set", label: "Set" },
] as const;
const UNIT_CODES: readonly string[] = UNITS.map((u) => u.code);

export interface DraftImage { fileId: string; url: string; name: string }
export const IMAGE_LIMITS = { max: 8, maxBytes: 5 * 1024 * 1024 } as const;

export const LIMITS = { name: 120, sku: 40, description: 2000, priceMax: "999999999.99", moqMax: 1_000_000_000 } as const;

/** What the supplier types. Everything is text so nothing is rounded by the browser. */
export interface DraftInput {
  name: string;
  categoryId: string;
  sku: string;
  description: string;
  pricingMode: PricingMode;
  price: string;
  priceUnit: string;
  moq: string;
  quantityUnit: string;
}

export const EMPTY_DRAFT: DraftInput = { name: "", categoryId: "", sku: "", description: "", pricingMode: "FIXED", price: "", priceUnit: "", moq: "", quantityUnit: "" };

export type FieldErrors = Partial<Record<keyof DraftInput, string>>;

export function normalizeSku(value: string): string {
  return value.trim().replace(/\s+/g, "-").toUpperCase();
}

/** "120", "120.5", "120.50" → 12000 / 12050 / 12050 paise. Anything else (sign, exponent, 3 decimals, huge) → null. */
export function parsePaise(text: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}

export function formatPaise(paise: number): string {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

export function parseMoq(text: string): number | null {
  if (!/^\d{1,10}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= 1 && n <= LIMITS.moqMax ? n : null;
}

/** Shape rules that apply to a draft too: only what was supplied is checked. */
export function validateDraftShape(d: DraftInput): FieldErrors {
  const e: FieldErrors = {};
  if (d.name && d.name.length > LIMITS.name) e.name = `Use at most ${LIMITS.name} characters.`;
  if (d.sku) {
    const sku = normalizeSku(d.sku);
    if (!/^[A-Z0-9][A-Z0-9._\/-]{0,39}$/.test(sku)) e.sku = "Use letters, numbers, dot, dash, slash or underscore (max 40).";
  }
  if (d.description.length > LIMITS.description) e.description = `Use at most ${LIMITS.description} characters.`;
  if (/<[a-z!/][^>]*>/i.test(d.description) || /<[a-z!/][^>]*>/i.test(d.name)) {
    e.description = "Plain text only: remove HTML tags.";
  }
  if (!PRICING_MODES.includes(d.pricingMode)) e.pricingMode = "Choose a pricing type.";
  if (d.pricingMode === "FIXED" && d.price) {
    const p = parsePaise(d.price);
    if (p === null) e.price = "Enter an amount like 120 or 120.50 (max 2 decimals).";
    else if (p <= 0) e.price = "Price must be above zero. Use Price on request instead.";
  }
  if (d.priceUnit && !UNIT_CODES.includes(d.priceUnit)) e.priceUnit = "Choose a listed unit.";
  if (d.moq && parseMoq(d.moq) === null) e.moq = "Enter a whole number of at least 1.";
  if (d.quantityUnit && !UNIT_CODES.includes(d.quantityUnit)) e.quantityUnit = "Choose a listed unit.";
  return e;
}

export interface ChecklistItem {
  key: "basic" | "pricing" | "moq" | "images" | "specifications";
  label: string;
  /** done = supplier completed it; todo = supplier can still complete it; blocked = the platform cannot accept it yet. */
  state: "done" | "todo" | "blocked";
  detail?: string;
}

/** Review result. `missing` lists what the supplier can fix; `blockers` lists what the platform does not support yet. */
export interface Review {
  checklist: ChecklistItem[];
  missing: string[];
  blockers: string[];
  /** Always false until media, category specifications and a publication policy exist. */
  canPublish: false;
}

export const BLOCKERS = [
  "Category specifications: no approved attribute definitions exist yet.",
  "Publishing: no approved publication or moderation workflow exists yet, so a draft cannot go live.",
];

/** `categoryOk` is the server's answer (category exists and is active); the browser passes true when one is chosen. */
export function reviewDraft(d: DraftInput, categoryOk: boolean, imageCount = 0): Review {
  const missing: string[] = [];
  const shape = validateDraftShape(d);
  const basicMissing: string[] = [];
  if (!d.name.trim()) basicMissing.push("Product name");
  if (!categoryOk) basicMissing.push("Category");
  if (!d.description.trim()) basicMissing.push("Description");
  if (basicMissing.length || shape.name || shape.sku || shape.description) missing.push(...basicMissing, ...[shape.name, shape.sku, shape.description].filter((x): x is string => !!x));

  const pricingMissing: string[] = [];
  if (d.pricingMode === "FIXED") {
    if (!d.price || shape.price) pricingMissing.push("A valid unit price");
    if (!d.priceUnit) pricingMissing.push("Price unit");
  }
  const moqMissing: string[] = [];
  if (!d.moq || shape.moq) moqMissing.push("Minimum order quantity");
  if (!d.quantityUnit) moqMissing.push("Quantity unit");
  if (d.pricingMode === "FIXED" && d.priceUnit && d.quantityUnit && d.priceUnit !== d.quantityUnit) {
    moqMissing.push("Quantity unit must match the price unit (no unit conversion is done)");
  }
  if (imageCount < 1) missing.push("At least one product image");
  missing.push(...pricingMissing, ...moqMissing);

  const checklist: ChecklistItem[] = [
    { key: "basic", label: "Basic information", state: basicMissing.length || shape.name || shape.sku || shape.description ? "todo" : "done" },
    { key: "images", label: "Images", state: imageCount > 0 ? "done" : "todo" },
    { key: "pricing", label: "Pricing", state: pricingMissing.length ? "todo" : "done" },
    { key: "moq", label: "Minimum order", state: moqMissing.length ? "todo" : "done" },
    { key: "specifications", label: "Category specifications", state: "blocked", detail: "No approved specification fields exist yet." },
  ];
  return { checklist, missing, blockers: BLOCKERS, canPublish: false };
}
