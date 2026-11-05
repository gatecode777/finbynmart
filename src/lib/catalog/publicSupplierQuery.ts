import { MAX_PAGE_SIZE, MAX_QUERY_LENGTH } from "./listingQuery";
import { SUPPLIER_SORT_OPTIONS, emptySupplierQuery, type SupplierQuery, type SupplierSort } from "./supplierQuery";

/**
 * Strict parsing of the query string of GET /api/public/suppliers: a bad value answers 400 with a message per
 * parameter. Only plain strings are read, so no operator or object can reach the engine.
 * `specialization` and `industry` are the same filter; `verificationStatus` is accepted for `verification`.
 */
export type PublicSupplierQueryResult = { ok: true; query: SupplierQuery } | { ok: false; fields: Record<string, string> };

/** Filters the PRD names that the supplier data cannot support. They fail loudly instead of being ignored. */
const UNSUPPORTED: Record<string, string> = {
  supplierType: "Supplier type filtering is not available: no supplier record carries a type.",
  businessType: "Business type filtering is not available: no supplier record carries a business type.",
  yearsInBusiness: "Years in business is not available: the data has no company history (only a membership date).",
  turnover: "Annual turnover is not available: it is not collected.",
  annualTurnover: "Annual turnover is not available: it is not collected.",
  certification: "Certification filtering is not available: no certification data exists yet.",
  country: "Country filtering is not available: the data has no country field (state and city are supported).",
};

const MAX_VALUES = 60;
const MAX_VALUE_LENGTH = 80;

export function parsePublicSupplierQuery(params: URLSearchParams): PublicSupplierQueryResult {
  const fields: Record<string, string> = {};
  const query = emptySupplierQuery();
  for (const [name, message] of Object.entries(UNSUPPORTED)) if (params.has(name)) fields[name] = message;

  const q = params.get("q");
  if (q !== null) {
    const cleaned = q.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (cleaned.length > MAX_QUERY_LENGTH) fields.q = `Search text can be at most ${MAX_QUERY_LENGTH} characters.`;
    else query.q = cleaned;
  }

  const list = (names: string[]): string[] => {
    const values = names.flatMap((n) => params.getAll(n)).map((v) => v.trim()).filter(Boolean);
    if (values.length > MAX_VALUES) fields[names[0]] = `At most ${MAX_VALUES} values are allowed.`;
    if (values.some((v) => v.length > MAX_VALUE_LENGTH)) fields[names[0]] = `Each value can be at most ${MAX_VALUE_LENGTH} characters.`;
    return [...new Set(values)].slice(0, MAX_VALUES);
  };
  query.industry = list(["industry", "specialization"]);
  query.state = list(["state"]);
  query.city = list(["city"]);
  query.category = list(["category"]);

  const verification = list(["verificationStatus", "verification"]);
  if (verification.some((v) => v !== "verified" && v !== "unverified")) fields.verificationStatus = "Must be verified or unverified.";
  query.verification = verification.filter((v): v is "verified" | "unverified" => v === "verified" || v === "unverified");

  const integer = (name: string, min: number, max: number): number | undefined => {
    const raw = params.get(name);
    if (raw === null || raw === "") return undefined;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
      fields[name] = `Must be a whole number from ${min} to ${max}.`;
      return undefined;
    }
    return value;
  };
  query.page = integer("page", 1, 1_000_000) ?? 1;
  query.limit = integer("limit", 1, MAX_PAGE_SIZE);

  const sort = params.get("sort");
  if (sort !== null && sort !== "") {
    if (SUPPLIER_SORT_OPTIONS.some((o) => o.value === sort)) query.sort = sort as SupplierSort;
    else fields.sort = `Sort must be one of: ${SUPPLIER_SORT_OPTIONS.map((o) => o.value).join(", ")}. Rating, years in business and verified-first are not available: the data has none.`;
  }

  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, query };
}
