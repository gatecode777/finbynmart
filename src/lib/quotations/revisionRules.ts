import { formatDecimal } from "./decimal";
import { DELIVERY_TERMS, MAX_EXTRA_CHARGES, defaultValidity, emptyLine, normaliseInput, type QuoteInput } from "./quoteRules";

/**
 * Revision rules (Page 44). Pure, shared by the service, the page and the node-run unit tests.
 *
 * A revision is a NEW VERSION of the same quotation (same `reference`, version + 1). It starts as a DRAFT that is not current: the buyer keeps seeing the
 * current submitted offer until the revision is submitted, when the previous current version becomes SUPERSEDED in one transaction. Previous versions are never
 * edited. Only the CURRENT version can be revised, and only while it still waits on the buyer.
 */
export const REVISION_REASON_MIN = 3;
export const REVISION_REASON_MAX = 300;

export type Eligibility = { ok: true } | { ok: false; code: "NOT_CURRENT" | "NOT_ALLOWED" | "REVISION_EXISTS" | "INQUIRY_CLOSED"; message: string };

export function revisionEligibility(args: { status: string; isCurrent: boolean; hasOpenRevisionDraft: boolean; inquiryOpen: boolean }): Eligibility {
  if (!args.isCurrent) return { ok: false, code: "NOT_CURRENT", message: "Only the current version can be revised. Open the current version to create a revision." };
  switch (args.status) {
    case "SENT":
    case "REVISION_REQUESTED":
      break;
    case "ACCEPTED":
      return { ok: false, code: "NOT_ALLOWED", message: "The buyer accepted this version. An accepted offer is immutable and no amendment process exists, so it cannot be revised here." };
    case "REJECTED":
      return { ok: false, code: "NOT_ALLOWED", message: "The buyer rejected this quotation, so it cannot be revised. Start a new quotation if the inquiry is still open." };
    case "WITHDRAWN":
      return { ok: false, code: "NOT_ALLOWED", message: "This quotation was withdrawn, so it cannot be revised." };
    case "DRAFT":
      return { ok: false, code: "NOT_ALLOWED", message: "This version is still a draft. Edit and submit it instead of revising it." };
    default:
      return { ok: false, code: "NOT_ALLOWED", message: "This version is not open to revision." };
  }
  if (args.hasOpenRevisionDraft) return { ok: false, code: "REVISION_EXISTS", message: "A revision draft already exists. Continue it instead of creating another." };
  if (!args.inquiryOpen) return { ok: false, code: "INQUIRY_CLOSED", message: "The inquiry is closed, cancelled or declined, so this quotation can no longer be revised." };
  return { ok: true };
}

export type ReasonResult = { ok: true; reason: string } | { ok: false; error: string };
export function parseRevisionReason(raw: unknown): ReasonResult {
  if (typeof raw !== "string") return { ok: false, error: "Give a reason for the revision." };
  const reason = raw.normalize("NFKC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (reason.length < REVISION_REASON_MIN) return { ok: false, error: `Give a reason of at least ${REVISION_REASON_MIN} characters.` };
  if (reason.length > REVISION_REASON_MAX) return { ok: false, error: `The reason can be at most ${REVISION_REASON_MAX} characters.` };
  return { ok: true, reason };
}

export interface DocSource {
  currency: string;
  unit: string | null;
  quantity: number;
  unitPriceMinor: number;
  productName: string;
  productKey?: string;
  moq?: { quantity: number; unit: string } | null;
  discount?: { kind: "PERCENT"; bp: number } | { kind: "AMOUNT"; minor: number } | null;
  charges?: { label: string; minor: number }[];
  terms?: { deliveryMinDays?: number | null; incoterms?: string | null; remarks?: string | null };
  snapshot?: { input: unknown };
}

const pct = (bp: number) => `${Math.floor(bp / 100)}${bp % 100 === 0 ? "" : `.${String(bp % 100).padStart(2, "0").replace(/0$/, "")}`}`;

/**
 * The editable input a revision starts from: the version's exact submitted inputs (decimal strings) when it was created by the create-quotation workflow,
 * otherwise rebuilt from the stored fields of an older record. It is a COPY of the version's own commercial data (never today's catalogue price). What
 * cannot be known is left blank so the supplier must decide it: the tax treatment (a rule may have changed), the payment terms of a free-text legacy
 * record, and the validity (a revised offer needs a new date). The tax rule is kept only when the snapshot named one.
 */
export function inputFromDoc(doc: DocSource, now = Date.now()): QuoteInput {
  const validUntil = defaultValidity(now);
  if (doc.snapshot?.input) {
    const normalised = normaliseInput(doc.snapshot.input).value;
    return { ...normalised, validUntil };
  }
  const charges = doc.charges ?? [];
  const freight = charges.find((c) => c.label === "Freight");
  const others = charges.filter((c) => c !== freight).slice(0, MAX_EXTRA_CHARGES);
  const line = emptyLine("line-1");
  const lead = doc.terms?.deliveryMinDays;
  return {
    currency: doc.currency,
    validUntil,
    lines: [
      {
        ...line,
        source: doc.productKey ? "INQUIRY" : "MANUAL",
        productKey: doc.productKey ?? "",
        name: doc.productName,
        quantity: String(doc.quantity),
        unit: doc.unit ?? "",
        unitPrice: formatDecimal(doc.unitPriceMinor),
        moq: doc.moq ? String(doc.moq.quantity) : "",
        discountKind: doc.discount ? doc.discount.kind : "NONE",
        discountValue: doc.discount ? (doc.discount.kind === "PERCENT" ? pct(doc.discount.bp) : formatDecimal(doc.discount.minor)) : "",
      },
    ],
    taxRuleId: "",
    freight: freight ? formatDecimal(freight.minor) : "",
    charges: others.map((c) => ({ label: c.label, amount: formatDecimal(c.minor) })),
    leadTimeDays: typeof lead === "number" && lead > 0 ? String(lead) : "",
    deliveryTerms: DELIVERY_TERMS.some((d) => d.value === doc.terms?.incoterms) ? (doc.terms?.incoterms as string) : "",
    paymentType: "",
    advancePercent: "",
    netDays: "",
    notes: doc.terms?.remarks ?? "",
  };
}
