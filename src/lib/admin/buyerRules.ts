/**
 * Client-safe rules of Admin Buyer Management (no server imports: the browser, the API and the node unit tests share them).
 *
 * Who is a buyer: a `users` record whose single `role` is "buyer". The account model has ONE role per account (no multi-role accounts exist), so a person who is also a supplier or an
 * admin has a separate account that this page never lists. There is no deleted flag and no test/service-account marker in the model, so none is excluded. A buyer is one account (never one
 * row per inquiry); the existence of an inquiry or a name prefix never makes someone a buyer.
 * Status is the account's own `accountStatus` (absent = ACTIVE). Suspending an account removes its sign-in and every existing session (see buyerManagement.ts).
 */
import { cleanReason, validateReason } from "./inquiryRules";

export { cleanReason, validateReason };

export const BUYER_STATUSES = [
  { key: "all", label: "All statuses" },
  { key: "ACTIVE", label: "Active" },
  { key: "SUSPENDED", label: "Suspended" },
  { key: "PENDING_EMAIL_VERIFICATION", label: "Awaiting e-mail confirmation" },
] as const;
export type StatusFilter = (typeof BUYER_STATUSES)[number]["key"];
export const STATUS_KEYS = BUYER_STATUSES.map((s) => s.key) as readonly string[];
export type AccountState = "ACTIVE" | "SUSPENDED" | "PENDING_EMAIL_VERIFICATION";
export const STATUS_LABEL: Record<AccountState, string> = { ACTIVE: "Active", SUSPENDED: "Suspended", PENDING_EMAIL_VERIFICATION: "Awaiting e-mail confirmation" };

export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const MAX_PAGE = 1000;
export const SEARCH_MAX = 60;
export const BUYER_ID_RE = /^[a-f0-9]{24}$/;
/** The short code shown beside a buyer: BUY- plus the last 8 hex characters of the account id (the same convention as CMP- for companies). The full 24-character id is the only lookup key. */
export const refCode = (id: string): string => `BUY-${id.slice(-8).toUpperCase()}`;
export const CODE_RE = /^BUY-[A-F0-9]{8}$/;

export type BuyerAction = "suspend" | "reactivate";
export interface ActionState { permitted: boolean; available: boolean; reason: string | null }

/** What each status action allows right now (the server recomputes it at commit time). Only ACTIVE can be suspended and only SUSPENDED reactivated: an account still awaiting e-mail confirmation has no action, so reactivation can never skip that step. */
export function actionPlan(status: AccountState, caps: { suspend: boolean; reactivate: boolean }): Record<BuyerAction, ActionState> {
  return {
    suspend: { permitted: caps.suspend, available: caps.suspend && status === "ACTIVE", reason: caps.suspend && status !== "ACTIVE" ? (status === "SUSPENDED" ? "The account is already suspended." : "Only an active account can be suspended.") : null },
    reactivate: { permitted: caps.reactivate, available: caps.reactivate && status === "SUSPENDED", reason: caps.reactivate && status !== "SUSPENDED" ? "Only a suspended account can be reactivated." : null },
  };
}

export const SUSPEND_EFFECTS = [
  "The buyer cannot sign in, and every browser or device that is already signed in loses access on its next request.",
  "Their inquiries, requirements, quotations, orders, saved items and history are kept unchanged. Suppliers who already received an inquiry still have it.",
  "The buyer is not sent any notice by this action, and no appeal process exists.",
  "Nothing is deleted. Only this buyer account is affected: it has no other role, and no supplier or admin account is changed.",
] as const;
export const REACTIVATE_EFFECTS = [
  "The buyer can sign in again with their existing password. Sessions that were open at suspension stay ended: they must sign in again.",
  "Nothing that was kept is changed, and no verification, quotation decision or order is altered.",
] as const;

export const cleanText = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** First character, three stars and the domain ("b***@example.com"). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 1 ? "" : `${email[0]}***${email.slice(at)}`;
}
/** Stars and the last two digits ("******34"). */
export function maskPhone(normalized: string): string {
  const d = normalized.replace(/\D/g, "");
  return d.length < 4 ? "" : `${"*".repeat(Math.max(4, d.length - 2))}${d.slice(-2)}`;
}

// ---------------------------------------------------------------- list state
export interface BuyerListState { q: string; status: StatusFilter; page: number }
export const EMPTY_STATE: BuyerListState = { q: "", status: "all", page: 1 };

export function parseListState(sp: URLSearchParams): BuyerListState {
  const status = sp.get("status");
  const page = Number(sp.get("page"));
  return { q: cleanText(sp.get("q"), SEARCH_MAX), status: status && STATUS_KEYS.includes(status) ? (status as StatusFilter) : "all", page: Number.isInteger(page) && page >= 1 ? Math.min(MAX_PAGE, page) : 1 };
}
/** Only the name / reference text, the status and the page go in the URL: never a contact search (none exists). */
export function toListParams(s: BuyerListState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.status !== "all") p.set("status", s.status);
  if (s.page > 1) p.set("page", String(s.page));
  return p;
}
/** Strict validation for the API (an unknown value is a 422, never silently ignored). */
export function validateListState(get: (k: string) => string | null | undefined): { ok: true; state: BuyerListState } | { ok: false; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const q = cleanText(get("q"), 500);
  if (q.length > SEARCH_MAX) fields.q = `Use at most ${SEARCH_MAX} characters.`;
  const st = get("status");
  if (st && !STATUS_KEYS.includes(st)) fields.status = "Unknown filter value.";
  const pageRaw = get("page");
  const page = pageRaw ? Number(pageRaw) : 1;
  if (pageRaw && (!Number.isInteger(page) || page < 1 || page > MAX_PAGE)) fields.page = "Unknown page.";
  const limitRaw = get("limit");
  if (limitRaw && (!/^\d{1,3}$/.test(limitRaw) || Number(limitRaw) < 1 || Number(limitRaw) > MAX_PAGE_SIZE)) fields.limit = `Use a number from 1 to ${MAX_PAGE_SIZE}.`;
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, state: { q, status: (st && STATUS_KEYS.includes(st) ? st : "all") as StatusFilter, page } };
}
