import { apiError, limitedResponse } from "@/lib/api/publicResponse";
import { CERT_MAX_PAGE_SIZE, CERT_SORTS, EXPIRY_OPTIONS, STATUS_OPTIONS, type CertSort, type CertificationQuery } from "./query";
import { CERT_TYPES } from "./types";

const ALLOWED = new Set(["status", "type", "authority", "expiry", "sort", "page", "limit"]);

export { apiError, limitedResponse };

/**
 * Strict parsing for the API: an unknown parameter, an unsupported value, a bad page or a limit above 50 is a 400 with
 * the offending parameter named, rather than being quietly ignored (the page itself is the lenient reader).
 * Status values other than the public ones are refused: pending and rejected records are not public.
 */
export function parsePublicCertificationQuery(search: URLSearchParams): { ok: true; query: CertificationQuery } | { ok: false; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  for (const key of new Set(search.keys())) if (!ALLOWED.has(key)) fields[key] = "This parameter is not supported.";

  const many = (name: string, allowed: readonly string[] | null) => {
    const values = [...new Set(search.getAll(name).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean))];
    const bad = values.find((value) => (allowed ? !allowed.includes(value) : value.length > 120));
    if (bad !== undefined) fields[name] = allowed ? `"${bad.slice(0, 40)}" is not a supported value. Use: ${allowed.join(", ")}.` : "Value is too long.";
    return values.slice(0, 30);
  };

  const status = many("status", STATUS_OPTIONS.map((option) => option.value));
  const type = many("type", CERT_TYPES.map((item) => item.value));
  const expiry = many("expiry", EXPIRY_OPTIONS.map((option) => option.value));
  const authority = many("authority", null);

  const sortRaw = search.get("sort");
  const sort = sortRaw === null || sortRaw === "" ? "newest" : (CERT_SORTS.find((option) => option.value === sortRaw)?.value as CertSort | undefined);
  if (!sort) fields.sort = `Use one of: ${CERT_SORTS.map((option) => option.value).join(", ")}.`;

  const integer = (name: string, min: number, max: number): number | undefined => {
    const raw = search.get(name);
    if (raw === null || raw === "") return undefined;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
      fields[name] = `Must be a whole number from ${min} to ${max}.`;
      return undefined;
    }
    return value;
  };
  const page = integer("page", 1, 100_000);
  const limit = integer("limit", 1, CERT_MAX_PAGE_SIZE);

  if (Object.keys(fields).length > 0 || !sort) return { ok: false, fields };
  return { ok: true, query: { status, type, authority, expiry, sort, page: page ?? 1, limit } };
}
