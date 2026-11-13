/**
 * Automatic matching lead distribution: the PURE rules (no imports, so the browser, the API and the node unit tests share them).
 *
 * Policy `match-1` (the strongest identity the catalogue really has; see docs/leads/MATCHING_POLICY.md):
 *  - the catalogue has NO shared canonical product id: every listing belongs to one seller. Two listings are "the same product" only when ALL hold:
 *    same category id, the same normalised product name (case, spacing and punctuation ignored, nothing else), and, when the requested listing states a colour,
 *    the same colour. A candidate that lacks a category, name or (when required) colour is never an exact match. Category alone, a name substring and
 *    similar names never match. Sizes/price/MOQ/stock are NOT used: the buyer's request does not state them, so none is invented.
 *  - quantity and unit are never converted or compared here; stock and MOQ never exclude a supplier (a lead is not a promise of stock).
 */
export const MATCHING_POLICY_VERSION = "match-1";

export interface Signature {
  categoryId: string;
  nameKey: string;
  /** Normalised colour, or "" when the requested listing states none (then colour is not required). */
  colourKey: string;
}

export const normaliseKey = (value: unknown): string =>
  typeof value === "string" ? value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() : "";

export function signatureOf(p: { categoryId: unknown; name: unknown; colour?: unknown }): Signature | null {
  const categoryId = typeof p.categoryId === "string" || typeof p.categoryId === "number" ? String(p.categoryId).trim() : "";
  const nameKey = normaliseKey(p.name);
  if (!categoryId || !nameKey) return null;
  return { categoryId, nameKey, colourKey: normaliseKey(p.colour) };
}

/** Does `candidate` satisfy the requested listing's signature? Missing evidence on the candidate is a non-match. */
export function isEquivalent(required: Signature, candidate: Signature | null): boolean {
  if (!candidate) return false;
  if (candidate.categoryId !== required.categoryId || candidate.nameKey !== required.nameKey) return false;
  return required.colourKey === "" || candidate.colourKey === required.colourKey;
}

export type DistributionState = "PENDING" | "PROCESSING" | "COMPLETED" | "NO_MATCHES" | "PARTIAL" | "FAILED" | "STOPPED";

/** What the buyer is told. Real states only: nothing says "sent to N suppliers" until it is true. */
export const DISTRIBUTION_LABEL: Record<DistributionState, string> = {
  PENDING: "Processing",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  NO_MATCHES: "No eligible matches",
  PARTIAL: "Partial: retry pending",
  FAILED: "Failed: needs attention",
  STOPPED: "Stopped: requirement closed",
};

export const OPEN_FOR_DISTRIBUTION = ["NEW", "new", "NOTIFIED", "IN_PROGRESS", "REPLIED", "QUOTED"];
export const isOpenForDistribution = (status: string | undefined): boolean => OPEN_FOR_DISTRIBUTION.includes(status ?? "");

export const BATCH_SIZE = 20;
export const LEASE_MS = 60_000;
export const MAX_ATTEMPTS = 6;
/** OPERATIONAL CAP (a product decision to confirm): at most this many companies are frozen for one inquiry; beyond it the job is flagged `truncated`. */
export const MAX_RECIPIENTS_PER_INQUIRY = 2000;

/** Bounded exponential backoff: 30 s, 1 min, 2 min, 4 min ... capped at 15 min. */
export const backoffMs = (attempts: number): number => Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));

/** The job state after a clean finish. */
export function finalState(a: { created: number; candidates: number; failedBatches: number }): DistributionState {
  if (a.failedBatches > 0) return "PARTIAL";
  return a.candidates === 0 ? "NO_MATCHES" : "COMPLETED";
}

export const NOTICE = {
  direct: { title: "New inquiry received", body: (product?: string) => `A buyer sent your company an inquiry${product ? ` about ${product}` : ""}. Open Inquiries & Leads to read it.` },
  matched: { title: "New matching lead", body: "A new requirement matches products your company supplies. Open Inquiries & Leads to read it." },
} as const;

export const BADGE = { DIRECT: "Buyer selected your company.", MATCHED: "Matches products your company supplies." } as const;

export const SHARING_NOTICE = "Your requirement will also be shared with suppliers offering matching products.";
