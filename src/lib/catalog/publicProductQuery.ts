import { MAX_PAGE_SIZE, MAX_QUERY_LENGTH, SORT_OPTIONS, emptyListingQuery, unitKey, type ListingQuery, type ListingSort } from "./listingQuery";

/**
 * Strict parsing of the query string of GET /api/public/products. Unlike the page (which falls back to
 * defaults so a hand-edited link still renders), the API answers 400 with a message per bad parameter.
 * Only plain values are read: the client can never pass an operator, an object or a database field name.
 *
 * Parameter names follow the page PRD; `subcategory`, `supplierType`, `minMOQ` and `maxMOQ` are accepted
 * for `sub`, `type`, `minMoq` and `maxMoq`.
 */
export type PublicQueryResult = { ok: true; query: ListingQuery } | { ok: false; fields: Record<string, string> };

/** Parameters the PRD names that the data cannot support. They fail loudly instead of being ignored. */
const UNSUPPORTED: Record<string, string> = {
  brand: "Brand filtering is not available: the catalog has no brand data.",
  availability: "Availability filtering is not available: the catalog has no stock or availability data.",
  attributes: "Attribute filtering is not available: use colour, which is the only product attribute in the data.",
  country: "Country filtering is not available: the data has no country field (state and city are supported).",
};

const MAX_VALUES = 60;
const MAX_VALUE_LENGTH = 80;

export function parsePublicProductQuery(params: URLSearchParams): PublicQueryResult {
  const fields: Record<string, string> = {};
  const query = emptyListingQuery();

  for (const [name, message] of Object.entries(UNSUPPORTED)) if (params.has(name)) fields[name] = message;
  const currency = params.get("currency");
  if (currency !== null && currency.toUpperCase() !== "INR") fields.currency = "Only INR prices exist in the catalog.";

  const text = (name: string): string | undefined => {
    const value = params.get(name);
    return value === null ? undefined : value;
  };

  const q = text("q");
  if (q !== undefined) {
    const cleaned = q.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (cleaned.length > MAX_QUERY_LENGTH) fields.q = `Search text can be at most ${MAX_QUERY_LENGTH} characters.`;
    else query.q = cleaned;
  }

  const list = (names: string[]): string[] => {
    const values = names.flatMap((name) => params.getAll(name)).map((v) => v.trim()).filter(Boolean);
    if (values.length > MAX_VALUES) fields[names[0]] = `At most ${MAX_VALUES} values are allowed.`;
    if (values.some((v) => v.length > MAX_VALUE_LENGTH)) fields[names[0]] = `Each value can be at most ${MAX_VALUE_LENGTH} characters.`;
    return [...new Set(values)].slice(0, MAX_VALUES);
  };
  query.category = list(["category"]);
  query.sub = list(["sub", "subcategory"]);
  query.department = list(["department"]);
  query.type = list(["type", "supplierType"]);
  query.state = list(["state"]);
  query.city = list(["city"]);
  query.colour = list(["colour"]);

  const seller = text("seller")?.trim().toLowerCase();
  if (seller) {
    if (/^[a-z0-9-]{1,80}$/.test(seller)) query.seller = seller;
    else fields.seller = "Supplier must be a supplier slug.";
  }

  const integer = (name: string, min: number, max: number): number | undefined => {
    const raw = text(name);
    if (raw === undefined || raw === "") return undefined;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
      fields[name] = `Must be a whole number from ${min} to ${max}.`;
      return undefined;
    }
    return value;
  };
  const amount = (names: string[]): number | undefined => {
    const name = names.find((n) => params.has(n));
    if (!name) return undefined;
    const raw = params.get(name) ?? "";
    if (raw === "") return undefined;
    const value = Number(raw);
    if (!/^\d+(\.\d+)?$/.test(raw) || !Number.isFinite(value)) {
      fields[names[0]] = "Must be a non-negative number.";
      return undefined;
    }
    return value;
  };

  query.page = integer("page", 1, 1_000_000) ?? 1;
  query.limit = integer("limit", 1, MAX_PAGE_SIZE);
  query.minPrice = amount(["minPrice"]);
  query.maxPrice = amount(["maxPrice"]);
  if (query.minPrice !== undefined && query.maxPrice !== undefined && query.minPrice > query.maxPrice) {
    fields.minPrice = "minPrice cannot be greater than maxPrice.";
  }

  query.minMoq = amount(["minMoq", "minMOQ"]);
  query.maxMoq = amount(["maxMoq", "maxMOQ"]);
  const unit = text("moqUnit");
  if (unit !== undefined && unit !== "") {
    if (/^[A-Za-z ]{1,20}$/.test(unit)) query.moqUnit = unitKey(unit);
    else fields.moqUnit = "Unit must be letters only, for example piece, box or kg.";
  }
  if ((query.minMoq !== undefined || query.maxMoq !== undefined) && !query.moqUnit) {
    fields.moqUnit = "moqUnit is required with minMOQ or maxMOQ: quantities in different units are never compared.";
  }
  if (query.minMoq !== undefined && query.maxMoq !== undefined && query.minMoq > query.maxMoq) {
    fields.minMOQ = "minMOQ cannot be greater than maxMOQ.";
  }

  const sort = text("sort");
  if (sort !== undefined && sort !== "") {
    if (SORT_OPTIONS.some((o) => o.value === sort)) query.sort = sort as ListingSort;
    else fields.sort = `Sort must be one of: ${SORT_OPTIONS.map((o) => o.value).join(", ")}. Newest and popularity are not available: the data has no dates or popularity.`;
  }

  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, query };
}
