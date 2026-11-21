/**
 * Admin Category Management: the PURE rules (no server imports).
 *
 * Source of truth: categories are CODE-defined (the curated main categories in `constants/categories.ts`, their sample listings, and the apparel catalogue departments and product
 * categories derived from the catalogue files). They are NOT database records and are never mutated from a request. What an administrator controls is an ACTIVATION OVERLAY for MAIN
 * categories (`category_overrides`), applied by the one central directory, so there is one effective model for the whole platform:
 *   effectiveActive(node) = its main category is not deactivated by an administrator (every node below a main category follows it);
 *   discoverable(node)    = effectiveActive AND it has eligible public products or an eligible child.
 * A category's eligible product count is therefore counted WITHOUT the activation gate (an inactive category can show products while staying hidden, and is labelled so).
 *
 * Not supported, and why (the operation is disabled in the UI and absent from the API):
 *  - create a category: public routes, product references, supplier forms and the attribute and matching definitions are keyed to code-defined ids; a database-created node would not exist for them;
 *  - rename / re-describe: the same consumers read the code constants, so an edit would show in the admin page only;
 *  - change parent or slug: category URLs, saved links, product category ids and approved snapshots depend on the identity and path; there is no redirect or alias layer;
 *  - activation below a main category: the listing engine keys departments and product categories by catalogue names, not node ids, so a separate flag there cannot be enforced everywhere.
 * Supporting any of these first needs the code-defined taxonomy migrated into a database model with a redirect layer (a dry-run migration, a cutover and a rollback plan).
 */
export const LEVELS = [
  { key: "all", label: "All levels" },
  { key: "MAIN", label: "Main category" },
  { key: "DEPARTMENT", label: "Department" },
  { key: "LEAF", label: "Product category" },
] as const;
export type LevelFilter = (typeof LEVELS)[number]["key"];
export type Level = "MAIN" | "DEPARTMENT" | "LEAF";
export const LEVEL_KEYS = LEVELS.map((l) => l.key) as readonly string[];
export const levelOf = (id: string): Level => (id.split("/").length === 1 ? "MAIN" : id.split("/").length === 2 ? "DEPARTMENT" : "LEAF");

export const STATUSES = [{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "inactive", label: "Inactive" }] as const;
export type StatusFilter = (typeof STATUSES)[number]["key"];
export const STATUS_KEYS = STATUSES.map((s) => s.key) as readonly string[];

export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const MAX_PAGE = 1000;
export const SEARCH_MAX = 60;

/** A category reference in a URL: the node id with "/" written as "~" (ids are slugs of lowercase letters, digits and hyphens, at most three levels). */
export const REF_RE = /^[a-z0-9][a-z0-9-]{0,80}(~[a-z0-9][a-z0-9-]{0,80}){0,2}$/;
export const refOf = (id: string): string => id.split("/").join("~");
export const idOfRef = (ref: string): string | null => (REF_RE.test(ref) ? ref.split("~").join("/") : null);

export interface ActionState { permitted: boolean; available: boolean; reason: string | null }
/** Activation is changeable for MAIN categories only; the new state must differ from the current one. */
export function activationPlan(level: Level, ownActive: boolean, canChange: boolean): ActionState {
  if (!canChange) return { permitted: false, available: false, reason: null };
  if (level !== "MAIN") return { permitted: true, available: false, reason: "A department or product category follows its main category. Change the main category instead; separate activation below it is not supported yet." };
  return { permitted: true, available: true, reason: null };
}

export interface ListState { q: string; level: LevelFilter; status: StatusFilter; parent: string; page: number }
export const EMPTY_STATE: ListState = { q: "", level: "all", status: "all", parent: "", page: 1 };
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

export function parseState(sp: URLSearchParams): ListState {
  const pick = <T extends string>(v: string | null, allowed: readonly string[], fallback: T): T => (v && allowed.includes(v) ? (v as T) : fallback);
  const page = Number(sp.get("page"));
  const parent = clean(sp.get("parent"), 200);
  return { q: clean(sp.get("q"), SEARCH_MAX), level: pick(sp.get("level"), LEVEL_KEYS, "all"), status: pick(sp.get("status"), STATUS_KEYS, "all"), parent: idOfRef(parent) ? parent : "", page: Number.isInteger(page) && page >= 1 ? Math.min(MAX_PAGE, page) : 1 };
}
export function toParams(s: ListState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.level !== "all") p.set("level", s.level);
  if (s.status !== "all") p.set("status", s.status);
  if (s.parent) p.set("parent", s.parent);
  if (s.page > 1) p.set("page", String(s.page));
  return p;
}
export function validateState(get: (k: string) => string | null | undefined): { ok: true; state: ListState } | { ok: false; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const enumOf = <T extends string>(k: string, allowed: readonly string[], fallback: T): T => { const v = get(k); if (!v) return fallback; if (!allowed.includes(v)) { fields[k] = "Unknown filter value."; return fallback; } return v as T; };
  const q = clean(get("q"), 500);
  if (q.length > SEARCH_MAX) fields.q = `Use at most ${SEARCH_MAX} characters.`;
  const parent = clean(get("parent"), 500);
  if (parent && !idOfRef(parent)) fields.parent = "Unknown parent.";
  const pageRaw = get("page");
  const page = pageRaw ? Number(pageRaw) : 1;
  if (pageRaw && (!Number.isInteger(page) || page < 1 || page > MAX_PAGE)) fields.page = "Unknown page.";
  const state: ListState = { q, level: enumOf("level", LEVEL_KEYS, "all"), status: enumOf("status", STATUS_KEYS, "all"), parent: fields.parent ? "" : parent, page: fields.page ? 1 : page };
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, state };
}

export const REASON_MIN = 10;
export const REASON_MAX = 500;
export const cleanReason = (v: unknown): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim() : "");
export const validateReason = (t: string): string | null => (t.length < REASON_MIN ? `Write a reason of at least ${REASON_MIN} characters.` : t.length > REASON_MAX ? `Keep the reason within ${REASON_MAX} characters.` : null);
export const KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;

export const DEACTIVATE_EFFECTS = [
  "The category, its departments and product categories leave public navigation, the category pages and every public listing and search; their direct URLs and product pages become unavailable (not found).",
  "Suppliers can no longer choose the category for a new product, and its products cannot be approved or published while it is inactive.",
  "New inquiries and new matched leads for its products are refused.",
  "Nothing is deleted: products, drafts, approved snapshots, existing inquiries, quotations and orders keep their data and stay reachable to their owners as before.",
] as const;
export const REACTIVATE_EFFECTS = [
  "The category and everything below it follow the central rule again: it is shown only where eligible public products exist.",
  "It does not approve a pending product, clear a product's own unpublish, reactivate a suspended company, reopen a closed requirement or replay past leads.",
] as const;
