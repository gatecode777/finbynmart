import type { ObjectId } from "mongodb";
import { IDENTITY_FIELDS, effectiveVerification, type ApprovalRecord, type Effective, type IdentityField, type IdentitySnapshot, type SubmissionState } from "./rules";

/**
 * The company fields the review binds to (a snapshot is taken at submission) and the stored approval, read from the company document. Kept free of heavy imports so the public
 * product loader can use it without a cycle. The owner's registered name lives on the users record (`supplier.businessName`), the rest on the company profile.
 */
export interface CompanyVerificationFields {
  _id: ObjectId;
  verificationStatus?: string;
  verification?: { submissionId: ObjectId; reference: string; revision: number; policyVersion: string; approvedAt: Date; approvedBy: ObjectId; identity: Partial<IdentitySnapshot>; materialFields: IdentityField[]; expiryMonths: number | null };
  displayName?: string;
  businessType?: string;
  country?: string;
  state?: string;
  city?: string;
}

const clean = (v: unknown, max = 150) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The CURRENT identity of a company: profile fields from the company document, the registered name and fallback city from the owner's record. */
export function identityOf(company: Partial<CompanyVerificationFields>, owner: { supplier?: { businessName?: string; city?: string } } | null | undefined): IdentitySnapshot {
  return {
    businessName: clean(owner?.supplier?.businessName),
    displayName: clean(company.displayName),
    businessType: clean(company.businessType, 60),
    country: clean(company.country, 80),
    state: clean(company.state, 80),
    city: clean(company.city || owner?.supplier?.city, 80),
  };
}
export { IDENTITY_FIELDS };

export function approvalOf(company: Partial<CompanyVerificationFields>): ApprovalRecord | null {
  if (company.verificationStatus !== "VERIFIED" || !company.verification) return null;
  const v = company.verification;
  return { approvedAt: v.approvedAt, revision: v.revision, policyVersion: v.policyVersion, identity: v.identity, materialFields: v.materialFields, expiryMonths: v.expiryMonths };
}

export function effectiveOf(company: Partial<CompanyVerificationFields>, owner: { supplier?: { businessName?: string; city?: string } } | null | undefined, latest: SubmissionState | null, now?: Date): Effective {
  return effectiveVerification({ approval: approvalOf(company), current: identityOf(company, owner), latest, now });
}
