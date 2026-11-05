import { CERT_TYPES } from "./types";
import type { PublicCertification } from "./types";
import { CERT_MAX_PAGE_SIZE, CERT_PAGE_SIZE, EXPIRY_OPTIONS, STATUS_OPTIONS, type CertFacetOption, type CertificationQuery } from "./query";

/**
 * Filters, facets, statistics, sorting and pagination over ONE supplier's public certifications. The set is small and
 * already scoped by supplier in the database query, so the work is done here on plain data (and is deterministic).
 */

export interface CertificationStats {
  total: number;
  verified: number;
  expiringSoon: number;
  expired: number;
  noExpiry: number;
}

export interface CertificationView {
  stats: CertificationStats;
  facets: { status: CertFacetOption[]; type: CertFacetOption[]; authority: CertFacetOption[]; expiry: CertFacetOption[] };
  results: { items: PublicCertification[]; total: number; page: number; pageSize: number; totalPages: number };
  /** The query actually applied: values that match nothing the supplier has are dropped and listed in `ignored`. */
  applied: CertificationQuery;
  ignored: { param: string; value: string }[];
  activeFilters: number;
}

type Group = "status" | "type" | "authority" | "expiry";

const lower = (value: string) => value.toLowerCase();

const matchers: Record<Group, (item: PublicCertification, selected: string[]) => boolean> = {
  status: (item, selected) => selected.includes(item.status),
  type: (item, selected) => selected.includes(item.type.value),
  authority: (item, selected) => selected.map(lower).includes(lower(item.authority)),
  expiry: (item, selected) =>
    selected.some((value) => {
      if (value === "valid") return item.expiry.state !== "expired";
      return item.expiry.state === value;
    }),
};

const byName = (a: PublicCertification, b: PublicCertification) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
/** Dates are YYYY-MM-DD text, so text order is date order. A missing expiry date sorts last in both directions. */
const byExpiry = (direction: 1 | -1) => (a: PublicCertification, b: PublicCertification) => {
  if (a.expiryDate === b.expiryDate) return 0;
  if (a.expiryDate === null) return 1;
  if (b.expiryDate === null) return -1;
  return a.expiryDate < b.expiryDate ? -direction : direction;
};

/** Ties always fall back to the name and then the id, so the order never changes between requests. */
function compare(sort: CertificationQuery["sort"]) {
  const primary = {
    newest: (a: PublicCertification, b: PublicCertification) => (a.issueDate === b.issueDate ? 0 : a.issueDate < b.issueDate ? 1 : -1),
    oldest: (a: PublicCertification, b: PublicCertification) => (a.issueDate === b.issueDate ? 0 : a.issueDate < b.issueDate ? -1 : 1),
    "expiry-asc": byExpiry(1),
    "expiry-desc": byExpiry(-1),
    name: byName,
  }[sort];
  return (a: PublicCertification, b: PublicCertification) => primary(a, b) || byName(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function certificationStats(all: PublicCertification[]): CertificationStats {
  return {
    total: all.length,
    verified: all.filter((item) => item.status === "verified").length,
    expiringSoon: all.filter((item) => item.expiry.state === "expiring").length,
    expired: all.filter((item) => item.status === "expired").length,
    noExpiry: all.filter((item) => item.expiry.state === "none").length,
  };
}

export function buildCertificationView(all: PublicCertification[], requested: CertificationQuery): CertificationView {
  // Only values the supplier's records can match are applied; the rest are reported, never silently honoured.
  const ignored: CertificationView["ignored"] = [];
  const known: Record<Group, Set<string>> = {
    status: new Set(STATUS_OPTIONS.map((option) => option.value)),
    type: new Set(CERT_TYPES.map((type) => type.value)),
    authority: new Set(all.map((item) => lower(item.authority))),
    expiry: new Set(EXPIRY_OPTIONS.map((option) => option.value)),
  };
  const applied: CertificationQuery = { ...requested, status: [], type: [], authority: [], expiry: [] };
  for (const group of ["status", "type", "authority", "expiry"] as const) {
    for (const value of requested[group]) {
      if (known[group].has(group === "authority" ? lower(value) : value)) applied[group].push(value);
      else ignored.push({ param: group, value });
    }
  }

  const selected = (group: Group) => applied[group];
  const passes = (item: PublicCertification, skip?: Group) =>
    (["status", "type", "authority", "expiry"] as const).every((group) => group === skip || selected(group).length === 0 || matchers[group](item, selected(group)));

  // Counts for one group ignore that group's own selection, so ticking a box never hides its siblings.
  const count = (group: Group, test: (item: PublicCertification) => boolean) => all.filter((item) => passes(item, group) && test(item)).length;
  const authorities = [...new Map(all.map((item) => [lower(item.authority), item.authority])).values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  const presentTypes = new Set(all.map((item) => item.type.value));

  const facets: CertificationView["facets"] = {
    status: STATUS_OPTIONS.map((option) => ({ ...option, count: count("status", (item) => item.status === option.value) })),
    type: CERT_TYPES.filter((type) => presentTypes.has(type.value)).map((type) => ({ value: type.value, label: type.label, count: count("type", (item) => item.type.value === type.value) })),
    authority: authorities.map((name) => ({ value: name, label: name, count: count("authority", (item) => lower(item.authority) === lower(name)) })),
    expiry: EXPIRY_OPTIONS.map((option) => ({ ...option, count: count("expiry", (item) => matchers.expiry(item, [option.value])) })),
  };

  const matching = all.filter((item) => passes(item)).sort(compare(applied.sort));
  const pageSize = Math.min(Math.max(applied.limit ?? CERT_PAGE_SIZE, 1), CERT_MAX_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.max(1, applied.page);
  const start = (page - 1) * pageSize;

  return {
    stats: certificationStats(all),
    facets,
    results: { items: matching.slice(start, start + pageSize), total: matching.length, page, pageSize, totalPages },
    applied,
    ignored,
    activeFilters: applied.status.length + applied.type.length + applied.authority.length + applied.expiry.length,
  };
}
