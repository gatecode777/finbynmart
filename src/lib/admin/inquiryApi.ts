import { defaultRange, parseRange } from "@/lib/supplier/analyticsRules";
import type { AdminCapability } from "./permissions";
import { DISTRIBUTION_KEYS, GROUP_KEYS, SEARCH_MAX, SOURCE_KEYS, type AdminStatusGroup, type DistributionFilter, type SourceFilter } from "./inquiryRules";
import type { AdminInquiryQuery, AdminInquiryCaps } from "./inquiryService";

/** Every capability flag comes from the account record (the guard's permissions), never from the request. */
export const capsOf = (permissions: readonly AdminCapability[]): AdminInquiryCaps => ({
  requirements: permissions.includes("inquiries.requirements"),
  recipients: permissions.includes("inquiries.recipients"),
  responses: permissions.includes("inquiries.responses"),
  routing: permissions.includes("inquiries.routing"),
  distribution: permissions.includes("inquiries.distribution"),
  audit: permissions.includes("inquiries.audit"),
});

/** Validated list / export filters. An unknown enum value or a bad date is a 422, never silently ignored; the search text is clipped and escaped by the service. */
export function parseQueryParams(get: (k: string) => string | null | undefined): { ok: true; query: AdminInquiryQuery } | { ok: false; message: string; fields: Record<string, string> } {
  const d = defaultRange();
  const range = parseRange(get("start") || d.startDay, get("end") || d.endDay);
  const fields: Record<string, string> = {};
  if (!range.ok) fields.range = range.message;
  const enumOf = <T extends string>(k: string, allowed: readonly string[], fallback: T): T => {
    const v = get(k);
    if (!v) return fallback;
    if (!allowed.includes(v)) { fields[k] = "Unknown filter value."; return fallback; }
    return v as T;
  };
  const source = enumOf<SourceFilter>("source", SOURCE_KEYS, "all");
  const group = enumOf<AdminStatusGroup>("group", GROUP_KEYS, "all");
  const dist = enumOf<DistributionFilter>("dist", DISTRIBUTION_KEYS, "all");
  const buyerRaw = get("buyer");
  if (buyerRaw && !/^[a-f0-9]{24}$/.test(buyerRaw)) fields.buyer = "Unknown buyer reference.";
  const q = (get("q") ?? "").replace(/[\u0000-\u001f]/g, " ").trim();
  if (q.length > SEARCH_MAX) fields.q = `Use at most ${SEARCH_MAX} characters.`;
  if (!range.ok || Object.keys(fields).length) return { ok: false, message: "Check the filters.", fields };
  return { ok: true, query: { q: q || undefined, ...(buyerRaw ? { buyer: buyerRaw } : {}), source, group, dist, range: range.range, page: Number(get("page")) || 1, limit: Number(get("limit")) || undefined } };
}

