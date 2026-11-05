import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { resolveProduct } from "@/lib/catalog/productRef";
import { formatSubmitted } from "@/lib/inquiries/confirmation";
import { inquiriesCollection } from "@/lib/inquiries/service";
import { ordersCollection } from "@/lib/orders/service";
import { quotationsCollection } from "@/lib/quotations/service";
import { loadOwnTicket } from "./conversationService";
import { relatedLabel, type RelatedType } from "./ticketRules";

/**
 * The record a ticket is about, read AGAIN now and only if it still belongs to the buyer (a quotation must also still be visible to
 * them: never a draft). The stored link is never trusted. When the record is gone or no longer theirs, the answer is "not available"
 * with no detail. Invoices and payments do not exist in this application, so a ticket can never point at one.
 */
export type RelatedDetails =
  | { available: true; type: RelatedType; typeLabel: string; reference: string; title: string; lines: { label: string; value: string }[]; href: string | null; status: string | null }
  | { available: false; type: RelatedType; typeLabel: string; reference: string; message: string };

const humanize = (s: string) => s.toLowerCase().replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const date = (d: Date | undefined) => (d ? formatSubmitted(d.toISOString()) : "Not recorded");

export async function getBuyerRelatedDetails(buyerIdText: string, reference: string): Promise<{ related: RelatedDetails | null } | null> {
  const t = await loadOwnTicket(buyerIdText, reference);
  if (!t) return null;
  if (!t.related) return { related: null };
  const { type, reference: ref } = t.related;
  const base = { type, typeLabel: relatedLabel(type), reference: ref };
  const gone: RelatedDetails = { available: false, ...base, message: "This record is not available to you any more." };
  const buyerId = t.buyerId;

  switch (type) {
    case "inquiry": {
      const d = await (await inquiriesCollection()).findOne({ reference: ref, buyerId }, { projection: { productName: 1, supplierName: 1, status: 1, createdAt: 1 } });
      return { related: d ? { available: true, ...base, title: d.productName ?? "General inquiry", lines: [{ label: "Supplier", value: d.supplierName }, { label: "Status", value: humanize(d.status) }, { label: "Submitted", value: date(d.createdAt) }], href: `/buyer/inquiries/${ref}`, status: humanize(d.status) } : gone };
    }
    case "quotation": {
      const d = await (await quotationsCollection()).findOne({ reference: ref, buyerId, isCurrent: true, status: { $ne: "DRAFT" } }, { projection: { productName: 1, supplierName: 1, status: 1, sentAt: 1 } });
      return { related: d ? { available: true, ...base, title: d.productName, lines: [{ label: "Supplier", value: d.supplierName }, { label: "Status", value: humanize(d.status) }, { label: "Received", value: date(d.sentAt) }], href: `/buyer/quotations/${ref}`, status: humanize(d.status) } : gone };
    }
    case "order": {
      const d = await (await ordersCollection()).findOne({ reference: ref, buyerId }, { projection: { supplierName: 1, status: 1, placedAt: 1, itemCount: 1 } });
      return { related: d ? { available: true, ...base, title: `Order ${ref}`, lines: [{ label: "Supplier", value: d.supplierName }, { label: "Status", value: humanize(d.status) }, { label: "Placed", value: date(d.placedAt) }, { label: "Items", value: String(d.itemCount) }], href: `/buyer/orders/${ref}`, status: humanize(d.status) } : gone };
    }
    case "product": {
      const key = resolveProduct(ref);
      const p = key ? getPublicProductByKey(key.key) : undefined;
      return { related: p ? { available: true, ...base, title: p.name, lines: [{ label: "Product ID", value: p.id }, { label: "Category", value: p.category.name }], href: p.url, status: null } : gone };
    }
  }
}
