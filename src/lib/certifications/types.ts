import type { ObjectId } from "mongodb";
import type { ExpiryState } from "./expiry";

/** Display categories. They say what kind of certificate a record is, never that a supplier holds one. */
export const CERT_TYPES = [
  { value: "quality-management", label: "Quality Management" },
  { value: "environmental", label: "Environmental Management" },
  { value: "product-compliance", label: "Product Compliance" },
  { value: "safety", label: "Safety Certification" },
  { value: "business-registration", label: "Business Registration" },
  { value: "industry-specific", label: "Industry-specific" },
] as const;

export type CertType = (typeof CERT_TYPES)[number]["value"];

export const certTypeLabel = (value: string): string => CERT_TYPES.find((type) => type.value === value)?.label ?? value;

/** Stored status. Only an authorized reviewer sets VERIFIED; an upload alone is PENDING. */
export type VerificationStatus = "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED" | "SUSPENDED";

/** The record as stored in the `certifications` collection. */
export interface CertificationDoc {
  _id: ObjectId;
  /** Public slug of the supplier this record belongs to; every public query is scoped by it. */
  supplierSlug: string;
  name: string;
  certificationType: CertType;
  issuingAuthority: string;
  certificateNumber?: string | null;
  /** The number is shown publicly only when this is true. */
  certificateNumberPublic?: boolean;
  description?: string | null;
  /** Date-only, YYYY-MM-DD. */
  issueDate: string;
  /** Date-only, YYYY-MM-DD; null or absent when the certificate does not expire. */
  expiryDate?: string | null;
  /** File name inside the private certificate directory; never a URL. */
  fileReference?: string | null;
  /** The document is served publicly only when this is true (and the record is approved). */
  publicDocumentAllowed?: boolean;
  verificationStatus: VerificationStatus;
  verifiedAt?: Date | null;
  verifiedBy?: string | null;
  /** Shown to the owner only. */
  rejectionReason?: string | null;
  /** Reviewer notes; never leave the server. */
  internalRemarks?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

/** What a buyer is shown. Built from CertificationDoc by an explicit allow-list: internal fields cannot leak. */
export interface PublicCertification {
  id: string;
  name: string;
  type: { value: string; label: string };
  authority: string;
  description: string | null;
  certificateNumber: string | null;
  issueDate: string;
  expiryDate: string | null;
  /** "verified" = approved and still valid; "expired" = approved once, past its expiry date. */
  status: "verified" | "expired";
  expiry: { state: ExpiryState; daysLeft: number | null };
  document: { available: boolean; kind: "pdf" | "image" | null; href: string | null };
}
