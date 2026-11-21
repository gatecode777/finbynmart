/**
 * Client-safe admin inquiry rules (no imports of server code: the browser, the API and the node unit tests share them).
 *
 * Facts kept apart (never one mixed "status"):
 *  - the REQUIREMENT LIFECYCLE: the stored inquiry status (grouped below for filtering);
 *  - the SOURCE: DIRECT_INQUIRY (the buyer picked a supplier; absent `sourceType` = direct) or GENERAL_REQUIREMENT (no selected supplier);
 *  - the DISTRIBUTION JOB state (`distribution_jobs`): how far automatic matching got;
 *  - each RECIPIENT's own progress, and each QUOTATION's lifecycle (their own records).
 */
import { isOpenForDistribution, type DistributionState } from "@/lib/leads/matchingRules";

export const ADMIN_STATUS_GROUPS = [
  { key: "all", label: "All inquiries", statuses: null },
  { key: "awaiting", label: "Awaiting supplier", statuses: ["new", "NEW", "NOTIFIED"] },
  { key: "active", label: "In progress", statuses: ["IN_PROGRESS", "REPLIED", "QUOTED"] },
  { key: "ended", label: "Closed or ended", statuses: ["CLOSED", "CANCELLED", "REJECTED"] },
] as const;
export type AdminStatusGroup = (typeof ADMIN_STATUS_GROUPS)[number]["key"];
export const GROUP_KEYS = ADMIN_STATUS_GROUPS.map((g) => g.key) as readonly string[];

export const STATUS_LABEL: Record<string, string> = { new: "New", NEW: "New", NOTIFIED: "Awaiting supplier", IN_PROGRESS: "In progress", REPLIED: "Replied", QUOTED: "Quoted", CLOSED: "Closed", CANCELLED: "Cancelled", REJECTED: "Rejected" };

export const ADMIN_PAGE_SIZE = 20;
export const ADMIN_MAX_PAGE_SIZE = 50;
export const ADMIN_EXPORT_MAX = 5000;
export const MAX_PAGE = 1000;
export const SEARCH_MAX = 60;
export const REFERENCE_RE = /^FBM-INQ-[A-Z0-9]{6,12}$/;

// ---------------------------------------------------------------- source
export const SOURCE_FILTERS = [
  { key: "all", label: "All sources" },
  { key: "direct", label: "Direct inquiry" },
  { key: "general", label: "General requirement" },
] as const;
export type SourceFilter = (typeof SOURCE_FILTERS)[number]["key"];
export const SOURCE_KEYS = SOURCE_FILTERS.map((s) => s.key) as readonly string[];
export type SourceKind = "DIRECT" | "GENERAL";
/** An absent `sourceType` is a direct inquiry (every record written before general requirements existed). */
export const sourceOf = (doc: { sourceType?: string }): SourceKind => (doc.sourceType === "GENERAL_REQUIREMENT" ? "GENERAL" : "DIRECT");
export const SOURCE_LABEL: Record<SourceKind, string> = { DIRECT: "Direct inquiry", GENERAL: "General requirement" };

// ---------------------------------------------------------------- distribution
/**
 * Filter groups over the job state. "Needs attention" is a UI GROUPING of two real conditions, never a stored status: a FAILED job, or a PARTIAL job that recorded an error
 * (a retry is pending after a failure). NO_MATCHES is a successful, finished search that found no eligible company: it is never attention.
 */
export const DISTRIBUTION_FILTERS = [
  { key: "all", label: "All" },
  { key: "processing", label: "Processing", states: ["PENDING", "PROCESSING"] },
  { key: "completed", label: "Completed", states: ["COMPLETED"] },
  { key: "no_matches", label: "No eligible matches", states: ["NO_MATCHES"] },
  { key: "partial", label: "Partial: retry pending", states: ["PARTIAL"] },
  { key: "failed", label: "Failed", states: ["FAILED"] },
  { key: "paused", label: "Paused", states: ["PAUSED"] },
  { key: "stopped", label: "Stopped: requirement closed", states: ["STOPPED"] },
  { key: "none", label: "Not in distribution" },
  { key: "attention", label: "Needs attention" },
] as const;
export type DistributionFilter = (typeof DISTRIBUTION_FILTERS)[number]["key"];
export const DISTRIBUTION_KEYS = DISTRIBUTION_FILTERS.map((d) => d.key) as readonly string[];

export const ADMIN_JOB_LABEL: Record<DistributionState, string> = {
  PENDING: "Processing",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  NO_MATCHES: "No eligible matches",
  PARTIAL: "Partial: retry pending",
  FAILED: "Failed",
  STOPPED: "Stopped: requirement closed",
  PAUSED: "Paused by an administrator",
};
export type Tone = "ok" | "info" | "warn" | "bad" | "muted";
const TONE: Record<DistributionState, Tone> = { PENDING: "info", PROCESSING: "info", COMPLETED: "ok", NO_MATCHES: "muted", PARTIAL: "warn", FAILED: "bad", STOPPED: "muted", PAUSED: "warn" };

export const needsAttention = (job: { state: DistributionState; hasError?: boolean } | null): boolean => !!job && (job.state === "FAILED" || (job.state === "PARTIAL" && job.hasError === true));

export interface DistributionView { state: DistributionState | null; label: string; tone: Tone; attention: boolean }
export function distributionView(job: { state: DistributionState; hasError?: boolean } | null): DistributionView {
  if (!job) return { state: null, label: "Not in distribution", tone: "muted", attention: false };
  return { state: job.state, label: ADMIN_JOB_LABEL[job.state], tone: TONE[job.state], attention: needsAttention(job) };
}

// ---------------------------------------------------------------- actions
export const REASON_MIN = 10;
export const REASON_MAX = 500;
export const cleanReason = (v: unknown): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim() : "");
export function validateReason(text: string): string | null {
  if (text.length < REASON_MIN) return `Write a reason of at least ${REASON_MIN} characters.`;
  if (text.length > REASON_MAX) return `Keep the reason within ${REASON_MAX} characters.`;
  return null;
}
export const KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;

export type AdminAction = "route" | "pause" | "resume" | "retry" | "restrict";
export interface ActionState { permitted: boolean; available: boolean; reason: string | null }
export interface ActionCaps { routing: boolean; distribution: boolean }

/**
 * What each administrative action allows RIGHT NOW. The server recomputes this at commit time; the browser only displays it.
 * `route` also needs at least one routable company, which the recipients endpoint reports (the plan here covers the inquiry and job states only).
 */
export function actionPlan(input: { inquiryStatus: string; jobState: DistributionState | null; hasError: boolean; caps: ActionCaps }): Record<AdminAction, ActionState> {
  const open = isOpenForDistribution(input.inquiryStatus);
  const s = input.jobState;
  const make = (permitted: boolean, ok: boolean, why: string): ActionState => ({ permitted, available: permitted && ok, reason: permitted && !ok ? why : null });
  const closed = "The requirement is closed, so distribution no longer applies.";
  return {
    route: make(input.caps.routing, open && (s === "COMPLETED" || s === "PARTIAL" || s === "FAILED"),
      !open ? closed : s === null ? "This requirement is outside automatic distribution (no distribution job exists)." : s === "PAUSED" ? "Distribution is paused. Resume it before routing." : s === "NO_MATCHES" ? "Automatic matching found no eligible company at its cutoff, so there is no candidate to route." : s === "STOPPED" ? closed : "Distribution is still running. Wait until it finishes."),
    pause: make(input.caps.distribution, open && (s === "PENDING" || s === "PROCESSING" || s === "PARTIAL"),
      !open ? closed : s === null ? "No distribution job exists for this requirement." : s === "PAUSED" ? "Distribution is already paused." : "Only a job that is waiting, running or retrying can be paused."),
    resume: make(input.caps.distribution, open && s === "PAUSED", !open ? closed : "Only a paused job can be resumed."),
    retry: make(input.caps.routing, open && (s === "FAILED" || (s === "PARTIAL" && input.hasError)),
      !open ? closed : s === "PARTIAL" ? "The job is retrying by itself; no failure is recorded." : "Only a failed job (or a partial job with a recorded failure) can be retried. Completed jobs are never re-run."),
    // moderation: no approved policy defines hiding or restricting an inquiry (what happens to its recipients, conversations and quotations is undefined), so it is never offered
    restrict: { permitted: true, available: false, reason: "Not available: no approved moderation policy defines how an inquiry may be hidden or restricted, so this control stays off until the business defines it." },
  };
}

// ---------------------------------------------------------------- list query (validated server-side, mirrored by the browser)
/** `buyer` (optional) narrows the list to one buyer account by its canonical `buyerId` (24 hex characters; Admin Buyer Management links here). */
export interface AdminListState { q: string; source: SourceFilter; group: AdminStatusGroup; dist: DistributionFilter; start: string; end: string; page: number; buyer?: string }
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export function parseListState(sp: URLSearchParams, defaults: { start: string; end: string }): AdminListState {
  const pick = <T extends string>(v: string | null, allowed: readonly string[], fallback: T): T => (v && allowed.includes(v) ? (v as T) : fallback);
  const page = Number(sp.get("page"));
  return {
    q: (sp.get("q") ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, SEARCH_MAX),
    source: pick(sp.get("source"), SOURCE_KEYS, "all"),
    group: pick(sp.get("group"), GROUP_KEYS, "all"),
    dist: pick(sp.get("dist"), DISTRIBUTION_KEYS, "all"),
    start: DAY_RE.test(sp.get("start") ?? "") ? (sp.get("start") as string) : defaults.start,
    end: DAY_RE.test(sp.get("end") ?? "") ? (sp.get("end") as string) : defaults.end,
    page: Number.isInteger(page) && page >= 1 ? Math.min(MAX_PAGE, page) : 1,
    ...(/^[a-f0-9]{24}$/.test(sp.get("buyer") ?? "") ? { buyer: sp.get("buyer") as string } : {}),
  };
}
/** Only non-default values go in the URL; the result is a same-site query string for the sign-in `next` and for shareable links. */
export function toListParams(s: AdminListState, defaults: { start: string; end: string }): URLSearchParams {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.source !== "all") p.set("source", s.source);
  if (s.group !== "all") p.set("group", s.group);
  if (s.dist !== "all") p.set("dist", s.dist);
  if (s.start !== defaults.start) p.set("start", s.start);
  if (s.end !== defaults.end) p.set("end", s.end);
  if (s.page > 1) p.set("page", String(s.page));
  if (s.buyer) p.set("buyer", s.buyer);
  return p;
}

/** The source filter as a Mongo condition: an absent sourceType is a direct inquiry. */
export function sourceCondition(source: SourceFilter): Record<string, unknown> | null {
  if (source === "general") return { sourceType: "GENERAL_REQUIREMENT" };
  if (source === "direct") return { sourceType: { $in: [null, "DIRECT_INQUIRY"] } };
  return null;
}
