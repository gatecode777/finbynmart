import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { getReviewHeadlineSafe } from "@/lib/reviews/store";
import { formatPriceRange } from "@/lib/utils/format";
import { INQUIRY_TYPES, REFERENCE_PATTERN, normaliseStatus, type InquiryStatus, type InquiryType } from "./rules";
import { findInquiryByReference, type InquiryDoc } from "./service";
import { buildTimeline, notificationInfo, statusInfo, type NotificationState, type TimelineStep } from "./timeline";

/**
 * The confirmation page's view of a saved inquiry. A visitor may see it only as the buyer it belongs to (the session)
 * or, for a guest inquiry, with the signed confirmation cookie. A reference alone is not enough, and an inquiry that
 * does not exist and one the visitor may not see get the same answer, so references cannot be probed.
 */
export type Viewer = { userId?: string; guest: "valid" | "expired" | "none" };

export interface ConfirmationDto {
  reference: string;
  inquiryType: InquiryType | null;
  inquiryTypeLabel: string;
  status: InquiryStatus;
  statusLabel: string;
  statusText: string;
  /** ISO timestamp, and the same moment as text in India time. */
  submittedAt: string;
  submittedLabel: string;
  supplier: {
    name: string;
    slug: string | null;
    url: string | null;
    initials: string;
    location: string | null;
    kind: string | null;
    verified: boolean;
    rating: { average: number; count: number } | null;
    photos: { src: string; remote: boolean; alt: string }[];
    /** False when the supplier no longer has a public page; the saved name is still shown. */
    available: boolean;
  };
  /** Null for a general inquiry. `available` is false when the product has since gone: the saved name stays, nothing else is shown in its place. */
  product: { name: string; slug: string | null; url: string | null; imageSrc: string | null; imageRemote: boolean; price: string | null; unit: string | null; moq: string | null; available: boolean } | null;
  quantity: number;
  unit: string | null;
  deliveryLocation: string | null;
  message: string | null;
  timeline: TimelineStep[];
  notification: { state: NotificationState; label: string };
  viewer: "buyer" | "guest";
}

export type ConfirmationResult = { status: "ok"; data: ConfirmationDto } | { status: "expired" } | { status: "not_found" };

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "S";

/** "10 Oct 2026, 02:34 PM" in India time, built on the server so the page and the API say the same thing. */
export function formatSubmitted(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
}

/** The saved inquiry as the confirmation page and the buyer's inquiry details page show it (supplier, product, timeline). The caller has already checked who may see it. */
export async function toConfirmationDto(doc: InquiryDoc, viewer: "buyer" | "guest"): Promise<ConfirmationDto> {
  const status = normaliseStatus(doc.status);
  const type = doc.inquiryType ?? (doc.type === "inquiry" ? (doc.productKey ? "PRODUCT_INQUIRY" : "GENERAL_INQUIRY") : "GET_BEST_QUOTE");
  const supplier = getPublicSupplierBySlug(doc.supplierSlug ?? doc.supplierKey);
  const headline = supplier ? await getReviewHeadlineSafe(supplier.slug) : undefined;
  const detail = doc.productKey ? getPublicProductByKey(doc.productKey) : undefined;
  // The product must still belong to the supplier the inquiry went to; otherwise it is treated as gone.
  const product = detail && supplier && detail.supplier.slug === supplier.slug ? detail : undefined;
  const primary = product ? (product.images.find((image) => image.primary) ?? product.images[0]) : undefined;
  const history = (doc.statusHistory ?? []).map((entry) => ({ from: entry.from, to: entry.to, at: entry.at.toISOString(), reason: entry.reason }));
  const submittedAt = doc.createdAt.toISOString();
  const info = statusInfo(status);

  return {
    reference: doc.reference ?? "",
    inquiryType: type,
    inquiryTypeLabel: INQUIRY_TYPES.find((item) => item.value === type)?.label ?? "Inquiry",
    status,
    statusLabel: info.label,
    statusText: info.text,
    submittedAt,
    submittedLabel: formatSubmitted(submittedAt),
    supplier: {
      name: supplier?.name ?? doc.supplierName,
      slug: supplier?.slug ?? null,
      url: supplier?.url ?? null,
      initials: supplier?.initials ?? initialsOf(doc.supplierName),
      location: supplier ? `${supplier.city}, ${supplier.state}` : null,
      kind: supplier ? [supplier.supplierType, supplier.industry].filter(Boolean).join(" • ") || null : null,
      verified: supplier?.verificationStatus === "verified",
      rating: headline && headline.count > 0 && headline.average !== null ? { average: headline.average, count: headline.count } : null,
      photos: supplier?.images ?? [],
      available: Boolean(supplier),
    },
    product: doc.productKey
      ? {
          name: product?.name ?? doc.productName ?? "Product",
          slug: product?.slug ?? null,
          url: product?.url ?? null,
          imageSrc: primary?.src ?? null,
          imageRemote: Boolean(primary?.remote),
          price: product ? formatPriceRange(product.pricing.min, product.pricing.max) : null,
          unit: product ? product.pricing.unit : null,
          moq: product?.moq ? `${product.moq.quantity.toLocaleString("en-IN")} ${product.moq.unit}` : null,
          available: Boolean(product),
        }
      : null,
    quantity: doc.quantity,
    unit: doc.unit ?? null,
    deliveryLocation: doc.deliveryLocation?.text ?? null,
    message: doc.message ?? null,
    timeline: buildTimeline(status, history, submittedAt),
    notification: notificationInfo(doc.notification?.status),
    viewer,
  };
}

export async function getInquiryConfirmation(reference: string, viewer: Viewer): Promise<ConfirmationResult> {
  if (!REFERENCE_PATTERN.test(reference)) return { status: "not_found" };
  const doc = await findInquiryByReference(reference);
  if (!doc) return { status: "not_found" };

  if (viewer.userId && doc.buyerId && doc.buyerId.toString() === viewer.userId) return { status: "ok", data: await toConfirmationDto(doc, "buyer") };
  if (doc.buyerType === "GUEST" && viewer.guest === "valid") return { status: "ok", data: await toConfirmationDto(doc, "guest") };
  // The visitor holds a genuine (signed) confirmation for this very reference whose window has closed.
  if (doc.buyerType === "GUEST" && viewer.guest === "expired") return { status: "expired" };
  return { status: "not_found" };
}
