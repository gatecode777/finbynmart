import { ObjectId } from "mongodb";
import { listResponders, type ResponderDto } from "./conversations";
import { distributionStatus } from "@/lib/leads/distribution";
import { DISTRIBUTION_LABEL } from "@/lib/leads/matchingRules";
import { BUSINESS_LABEL } from "./buyerListRules";
import { formatSubmitted, toConfirmationDto, type ConfirmationDto } from "./confirmation";
import { BUYER_CANCELLABLE, REFERENCE_PATTERN, normaliseStatus, type InquiryStatus } from "./rules";
import { inquiriesCollection } from "./service";
import { listInquiryQuotations, type InquiryQuotationItem } from "@/lib/quotations/service";
import { listMessages, type MessageDto } from "./messages";

/**
 * The buyer's view of ONE of their inquiries (the "Inquiry Details" page). Reuses the confirmation page's builder (supplier, product,
 * timeline from the real history) and adds only what that page does not show. The lookup always names the buyer from the session, so
 * an unknown reference and another buyer's reference give the same answer (null), and a guest inquiry is never reachable.
 *
 * Quotations come from the quotation module (read only, none can be created by a supplier yet). What is NOT here, because no module exists
 * to hold it: supplier responses, messages, attachments, target price, required-by date, orders. The page says so instead of showing placeholders.
 */
export interface InquiryDetailDto extends ConfirmationDto {
  updatedAt: string;
  updatedLabel: string;
  businessLabel: string;
  categoryName: string | null;
  canCancel: boolean;
  /** The reference when there is one; only an old record without a reference is addressed by its id. */
  key: string;
  history: { from: InquiryStatus | null; to: InquiryStatus; toLabel: string; actor: string; at: string; atLabel: string; reason: string | null }[];
  /** What this deployment can really do for this inquiry. A flag is true only when the backend behind it exists. */
  capabilities: { messaging: false; supplierResponses: boolean; quotations: true; revisionRequests: true; quotationSelection: true; attachments: false; cancellation: boolean; print: true; pdfExport: false };
  /** The buyer's current quotations for this inquiry (read from the quotation module); null when they could not be read, never a guessed empty list. */
  quotations: InquiryQuotationItem[] | null;
  /** The supplier's responses and clarification questions on this inquiry (newest first, at most 20); null when they could not be read. Replying from here is not built. */
  responses: MessageDto[] | null;
  /** Automatic matching progress for this requirement (real state; null for inquiries outside the workflow). */
  distribution: { state: string; label: string; matchedRecorded: number; truncated: boolean } | null;
  /** The suppliers that replied or quoted (selected / additional matching), each with a private conversation. null = could not be read. */
  suppliers: ResponderDto[] | null;
  /** False once the requirement is closed or cancelled: conversations stay readable, new messages are refused. */
  conversationsOpen: boolean;
}

/** By reference (the normal case) or by id for an old record that never got a reference. Never an id for a record that has one. */
export async function getBuyerInquiryDetail(buyerId: string, key: string): Promise<InquiryDetailDto | null> {
  const byReference = REFERENCE_PATTERN.test(key);
  if (!byReference && !/^[a-f0-9]{24}$/i.test(key)) return null;
  const doc = await (await inquiriesCollection()).findOne({ ...(byReference ? { reference: key } : { _id: new ObjectId(key), reference: { $exists: false } }), buyerId: new ObjectId(buyerId) });
  if (!doc) return null;

  const [base, quotations, responses] = await Promise.all([toConfirmationDto(doc, "buyer"), listInquiryQuotations(buyerId, doc._id!, doc.supplierKey).catch(() => null), listMessages(doc._id!, { buyerId: new ObjectId(buyerId) }, { limit: 20, cursor: null }).then((p) => p.items, () => null)]);
  const status = normaliseStatus(doc.status);
  const lastChange = doc.statusHistory?.at(-1)?.at;
  const updated = (doc.updatedAt ?? lastChange ?? doc.createdAt).toISOString();
  return {
    ...base,
    updatedAt: updated,
    updatedLabel: formatSubmitted(updated),
    businessLabel: BUSINESS_LABEL[status],
    categoryName: doc.categoryName ?? null,
    canCancel: BUYER_CANCELLABLE.includes(status),
    key: doc.reference ?? doc._id!.toString(),
    history: (doc.statusHistory ?? []).map((e) => ({ from: e.from, to: e.to, toLabel: BUSINESS_LABEL[e.to] ?? e.to, actor: e.actor, at: e.at.toISOString(), atLabel: formatSubmitted(e.at.toISOString()), reason: e.reason ?? null })),
    quotations,
    responses,
    distribution: await distributionOf(doc._id!),
    ...(await respondersOf(buyerId, doc.reference)),
    capabilities: { messaging: false, supplierResponses: true, quotations: true, revisionRequests: true, quotationSelection: true, attachments: false, cancellation: BUYER_CANCELLABLE.includes(status), print: true, pdfExport: false },
  };
}

async function distributionOf(inquiryId: ObjectId): Promise<InquiryDetailDto["distribution"]> {
  const d = await distributionStatus(inquiryId).catch(() => null);
  return d ? { state: d.state, label: DISTRIBUTION_LABEL[d.state], matchedRecorded: d.matchedRecorded, truncated: d.truncated } : null;
}

async function respondersOf(buyerId: string, reference: string | undefined): Promise<{ suppliers: ResponderDto[] | null; conversationsOpen: boolean }> {
  if (!reference) return { suppliers: [], conversationsOpen: false };
  const r = await listResponders(buyerId, reference).catch(() => null);
  return r ? { suppliers: r.responders, conversationsOpen: r.open } : { suppliers: null, conversationsOpen: false };
}
