import type { SearchParams } from "@/lib/utils/searchParams";

/**
 * Client-safe pieces of the certification list: the query shape, fixed option lists, URL parsing and URL building.
 * Shared by the page, the filter form and GET /api/public/suppliers/<slug>/certifications.
 */

export type CertSort = "newest" | "oldest" | "expiry-asc" | "expiry-desc" | "name";

/** "Verification Status" sort is left out: it would only matter to a viewer who can see non-public records. */
export const CERT_SORTS: { value: CertSort; label: string }[] = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "expiry-asc", label: "Expiry Date: Earliest First" },
  { value: "expiry-desc", label: "Expiry Date: Latest First" },
  { value: "name", label: "Certification Name A–Z" },
];

/** Public viewers see approved records only, which are either valid or past their expiry date. */
export const STATUS_OPTIONS = [
  { value: "verified", label: "Verified" },
  { value: "expired", label: "Expired" },
] as const;

export const EXPIRY_OPTIONS = [
  { value: "valid", label: "Currently Valid" },
  { value: "expiring", label: "Expiring Within 90 Days" },
  { value: "expired", label: "Expired" },
  { value: "none", label: "No Expiry Date" },
] as const;

export const CERT_PAGE_SIZE = 8;
export const CERT_MAX_PAGE_SIZE = 50;

export interface CertificationQuery {
  status: string[];
  type: string[];
  authority: string[];
  expiry: string[];
  sort: CertSort;
  page: number;
  limit?: number;
}

export const NO_CERT_FILTERS: Pick<CertificationQuery, "status" | "type" | "authority" | "expiry"> = { status: [], type: [], authority: [], expiry: [] };

export interface CertFacetOption {
  value: string;
  label: string;
  count: number;
}

const list = (value: string | string[] | undefined): string[] => {
  const raw = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return [...new Set(raw.map((item) => item.trim()).filter((item) => item && item.length <= 120))].slice(0, 30);
};

/** Lenient parsing for the page: unknown sorts and bad numbers fall back to the defaults. */
export function parseCertificationQuery(params: SearchParams): CertificationQuery {
  const sort = CERT_SORTS.find((option) => option.value === (Array.isArray(params.sort) ? params.sort[0] : params.sort))?.value ?? "newest";
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page);
  const limit = Number(Array.isArray(params.limit) ? params.limit[0] : params.limit);
  return {
    status: list(params.status),
    type: list(params.type),
    authority: list(params.authority),
    expiry: list(params.expiry),
    sort,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: Number.isInteger(limit) && limit >= 1 ? Math.min(limit, CERT_MAX_PAGE_SIZE) : undefined,
  };
}

/** The query as URL parameters; defaults are left out so the plain page keeps its plain URL. */
export function certificationParams(query: CertificationQuery, overrides: Partial<CertificationQuery> = {}): URLSearchParams {
  const merged = { ...query, ...overrides };
  const search = new URLSearchParams();
  for (const key of ["status", "type", "authority", "expiry"] as const) for (const value of merged[key]) search.append(key, value);
  if (merged.sort !== "newest") search.set("sort", merged.sort);
  if (merged.limit !== undefined) search.set("limit", String(merged.limit));
  if (merged.page > 1) search.set("page", String(merged.page));
  return search;
}

export function certificationHref(basePath: string, query: CertificationQuery, overrides: Partial<CertificationQuery> = {}): string {
  const search = certificationParams(query, overrides).toString();
  return search ? `${basePath}?${search}` : basePath;
}
