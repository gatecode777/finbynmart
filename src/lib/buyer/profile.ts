import { ObjectId, type Collection, type Document } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { emailConfigured } from "@/lib/email/provider";
import { DOCUMENT_TYPES, documentLabel, computeCompletion, type CompanyInput, type CompletionItem, type DocumentStatus, type DocumentType, type PersonalInput } from "./profileRules";
import { notifyDocumentUploaded } from "./notifications";
import { claimedExtension, detectType, displayFilename, readStored, removeStored, saveFile, storageConfigured } from "./documentStorage";
import { DOCUMENT_LIMITS, checkExpiry, isDocumentType } from "./profileRules";

/**
 * The buyer's own profile, company, documents, verification state and security summary. Every function takes the buyer id
 * from the verified session (never from a request) and every query names it: the user by `_id`, the company by `ownerUserId`,
 * documents by the company the buyer owns. A company has exactly one owner (this project has no company membership or role model);
 * nobody else can read or change it.
 *
 * Verification is reported, never granted: nothing a buyer sends can set a verification flag or a document status (uploads are
 * stored as PENDING by the server). There is no admin review process yet, so a PENDING document stays PENDING, and the
 * mobile number cannot be verified (no SMS provider); both are stated plainly in the answers.
 */

export interface UserRow extends Document {
  _id: ObjectId;
  name: string;
  email: string;
  role: string;
  phone?: { countryCode: string; number: string; normalized: string };
  designation?: string;
  alternatePhone?: { countryCode: string; number: string; normalized: string };
  alternateEmail?: string;
  companyId?: ObjectId;
  companyName?: string;
  accountStatus?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  profileVersion?: number;
  lastLoginAt?: Date | null;
  passwordChangedAt?: Date;
  createdAt: Date;
}

interface CompanyRow extends Document {
  _id: ObjectId;
  ownerUserId: ObjectId;
  legalName: string;
  legalNameNormalized: string;
  displayName?: string;
  businessType: string;
  industry?: string;
  description?: string;
  website?: string;
  yearEstablished?: number;
  companyEmail?: string;
  country: string;
  state?: string;
  city?: string;
  postalCode?: string;
  registeredAddress?: string;
  operatingAddress?: string;
  verificationStatus: "UNVERIFIED";
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface DocumentRow extends Document {
  _id: ObjectId;
  companyId: ObjectId;
  uploadedBy: ObjectId;
  documentType: DocumentType;
  fileReference: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  verificationStatus: Exclude<DocumentStatus, "NOT_SUBMITTED">;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: ObjectId | null;
  expiryDate: string | null;
  rejectionReason: string | null;
  active: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

let indexReady: Promise<unknown> | undefined;
async function collections() {
  const db = await getDb();
  const users = db.collection<UserRow>("users");
  const companies: Collection<CompanyRow> = db.collection<CompanyRow>("companies");
  const documents: Collection<DocumentRow> = db.collection<DocumentRow>("company_documents");
  indexReady ??= Promise.all([
    // one company per buyer, and one company per legal name (a second buyer cannot create or claim the same company)
    companies.createIndex({ ownerUserId: 1 }, { unique: true }),
    companies.createIndex({ legalNameNormalized: 1 }, { unique: true }),
    documents.createIndex({ companyId: 1, documentType: 1 }, { unique: true, partialFilterExpression: { active: true } }),
    documents.createIndex({ companyId: 1, createdAt: -1 }),
  ]);
  await indexReady;
  return { db, users, companies, documents };
}

const normalizeName = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const isDuplicate = (error: unknown) => (error as { code?: number }).code === 11000;

/** Field names only, never values (no PAN, GSTIN, address or message text in the audit trail). */
export async function recordProfileEvent(userId: ObjectId, type: string, fields: string[]): Promise<void> {
  const { db } = await collections();
  await db.collection("security_events").insertOne({ userId, type, at: new Date(), fields }).catch(() => undefined);
}

// ---------- DTOs ----------

const maskPhone = (normalized?: string) => (normalized ? normalized.replace(/(\+\d+ \d{2})\d+(\d{4})$/, "$1••••$2") : null);

export interface ProfileDto {
  name: string;
  email: string;
  designation: string | null;
  primaryPhone: { masked: string | null; display: string | null };
  alternatePhone: { countryCode: string; number: string } | null;
  alternateEmail: string | null;
  companyName: string | null;
  accountStatus: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  version: number;
}

const toProfile = (user: UserRow, companyName: string | null): ProfileDto => ({
  name: user.name,
  email: user.email,
  designation: user.designation ?? null,
  primaryPhone: { masked: maskPhone(user.phone?.normalized), display: user.phone?.normalized ?? null },
  alternatePhone: user.alternatePhone ? { countryCode: user.alternatePhone.countryCode, number: user.alternatePhone.number } : null,
  alternateEmail: user.alternateEmail ?? null,
  companyName,
  accountStatus: user.accountStatus ?? "ACTIVE",
  emailVerified: user.emailVerified === true,
  phoneVerified: user.phoneVerified === true,
  version: user.profileVersion ?? 0,
});

export interface CompanyDto {
  legalName: string;
  displayName: string | null;
  businessType: string;
  industry: string | null;
  description: string | null;
  website: string | null;
  yearEstablished: number | null;
  companyEmail: string | null;
  country: string;
  state: string | null;
  city: string | null;
  postalCode: string | null;
  registeredAddress: string | null;
  operatingAddress: string | null;
  /** Always UNVERIFIED for now: no review process exists and nothing a buyer sends can change it. */
  verificationStatus: "UNVERIFIED";
  version: number;
}

const toCompany = (c: CompanyRow): CompanyDto => ({
  legalName: c.legalName,
  displayName: c.displayName ?? null,
  businessType: c.businessType,
  industry: c.industry ?? null,
  description: c.description ?? null,
  website: c.website ?? null,
  yearEstablished: c.yearEstablished ?? null,
  companyEmail: c.companyEmail ?? null,
  country: c.country,
  state: c.state ?? null,
  city: c.city ?? null,
  postalCode: c.postalCode ?? null,
  registeredAddress: c.registeredAddress ?? null,
  operatingAddress: c.operatingAddress ?? null,
  verificationStatus: "UNVERIFIED",
  version: c.version,
});

export interface DocumentDto {
  id: string | null;
  type: DocumentType;
  label: string;
  status: DocumentStatus;
  originalFilename: string | null;
  fileSize: number | null;
  mimeType: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  expiryDate: string | null;
  /** Only the owner ever receives this. */
  rejectionReason: string | null;
}

const toDocument = (d: DocumentRow): DocumentDto => {
  const expired = d.expiryDate !== null && d.verificationStatus === "VERIFIED" && Date.parse(`${d.expiryDate}T23:59:59+05:30`) < Date.now();
  return {
    id: d._id.toString(),
    type: d.documentType,
    label: documentLabel(d.documentType),
    status: expired ? "EXPIRED" : d.verificationStatus,
    originalFilename: d.originalFilename,
    fileSize: d.fileSize,
    mimeType: d.mimeType,
    submittedAt: d.submittedAt.toISOString(),
    reviewedAt: d.reviewedAt?.toISOString() ?? null,
    expiryDate: d.expiryDate,
    rejectionReason: d.rejectionReason,
  };
};

const PROJECT_DOC = { companyId: 1, documentType: 1, originalFilename: 1, mimeType: 1, fileSize: 1, verificationStatus: 1, submittedAt: 1, reviewedAt: 1, expiryDate: 1, rejectionReason: 1 } as const;

// ---------- profile ----------

export type Conflict = { ok: false; code: "CONFLICT" | "NOT_FOUND" | "NAME_TAKEN" | "HAS_COMPANY" | "NO_COMPANY" | "STORAGE_UNAVAILABLE" | "VERIFIED_LOCKED" };

export async function getBuyerUser(userId: string): Promise<UserRow | null> {
  const { users } = await collections();
  if (!ObjectId.isValid(userId)) return null;
  return users.findOne({ _id: new ObjectId(userId), role: "buyer" });
}

export async function updateBuyerProfile(userId: string, input: PersonalInput): Promise<{ ok: true; profile: ProfileDto } | Conflict> {
  const { users, companies } = await collections();
  const _id = new ObjectId(userId);
  const set: Record<string, unknown> = { name: input.name, updatedAt: new Date() };
  const unset: Record<string, ""> = {};
  if (input.designation) set.designation = input.designation;
  else unset.designation = "";
  if (input.alternatePhone) set.alternatePhone = input.alternatePhone;
  else unset.alternatePhone = "";
  if (input.alternateEmail) set.alternateEmail = input.alternateEmail;
  else unset.alternateEmail = "";
  const versionFilter = input.version === 0 ? { $or: [{ profileVersion: 0 }, { profileVersion: { $exists: false } }] } : { profileVersion: input.version };
  const updated = await users.findOneAndUpdate({ _id, role: "buyer", ...versionFilter }, { $set: set, $unset: unset, $inc: { profileVersion: 1 } }, { returnDocument: "after" });
  if (!updated) return { ok: false, code: (await users.countDocuments({ _id })) ? "CONFLICT" : "NOT_FOUND" };
  await recordProfileEvent(_id, "PROFILE_UPDATED", ["name", "designation", "alternatePhone", "alternateEmail"].filter((f) => f in set || f in unset));
  const company = updated.companyId ? await companies.findOne({ _id: updated.companyId, ownerUserId: _id }, { projection: { legalName: 1 } }) : null;
  return { ok: true, profile: toProfile(updated, company?.legalName ?? updated.companyName ?? null) };
}

// ---------- company ----------

export async function getBuyerCompany(userId: string): Promise<CompanyDto | null> {
  const { companies } = await collections();
  const row = await companies.findOne({ ownerUserId: new ObjectId(userId) });
  return row ? toCompany(row) : null;
}

export async function createBuyerCompany(userId: string, input: CompanyInput): Promise<{ ok: true; company: CompanyDto } | Conflict> {
  const { users, companies } = await collections();
  const ownerUserId = new ObjectId(userId);
  const now = new Date();
  const row: CompanyRow = {
    _id: new ObjectId(),
    ownerUserId,
    legalNameNormalized: normalizeName(input.legalName),
    ...stripNull(input),
    verificationStatus: "UNVERIFIED",
    version: 1,
    createdAt: now,
    updatedAt: now,
  } as CompanyRow;
  try {
    await companies.insertOne(row);
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    // either this buyer already has a company, or another company holds the same name (never claimable from here)
    return { ok: false, code: (await companies.countDocuments({ ownerUserId })) ? "HAS_COMPANY" : "NAME_TAKEN" };
  }
  await users.updateOne({ _id: ownerUserId }, { $set: { companyId: row._id, updatedAt: now } });
  await recordProfileEvent(ownerUserId, "COMPANY_CREATED", Object.keys(stripNull(input)));
  return { ok: true, company: toCompany(row) };
}

export async function updateBuyerCompany(userId: string, input: CompanyInput, version: number): Promise<{ ok: true; company: CompanyDto } | Conflict> {
  const { companies } = await collections();
  const ownerUserId = new ObjectId(userId);
  const before = await companies.findOne({ ownerUserId });
  if (!before) return { ok: false, code: "NO_COMPANY" };
  const next = stripNull(input);
  const unset: Record<string, ""> = {};
  for (const key of Object.keys(input) as (keyof CompanyInput)[]) if (input[key] === null) unset[key] = "";
  let after: CompanyRow | null;
  try {
    after = await companies.findOneAndUpdate({ ownerUserId, version }, { $set: { ...next, legalNameNormalized: normalizeName(input.legalName), updatedAt: new Date() }, $unset: unset, $inc: { version: 1 } }, { returnDocument: "after" });
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, code: "NAME_TAKEN" };
    throw error;
  }
  if (!after) return { ok: false, code: "CONFLICT" };
  const changed = (Object.keys(input) as (keyof CompanyInput)[]).filter((key) => (before as Record<string, unknown>)[key] !== after![key as keyof CompanyRow] && !((before as Record<string, unknown>)[key] === undefined && input[key] === null));
  await recordProfileEvent(ownerUserId, "COMPANY_UPDATED", changed.map(String));
  return { ok: true, company: toCompany(after) };
}

function stripNull<T extends object>(input: T): { [K in keyof T]?: NonNullable<T[K]> } {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== null)) as { [K in keyof T]?: NonNullable<T[K]> };
}

// ---------- documents ----------

async function ownedCompanyId(userId: string): Promise<ObjectId | null> {
  const { companies } = await collections();
  const row = await companies.findOne({ ownerUserId: new ObjectId(userId) }, { projection: { _id: 1 } });
  return row?._id ?? null;
}

/** Every accepted type with its status: a type with nothing uploaded is NOT_SUBMITTED. */
export async function listBuyerDocuments(userId: string): Promise<{ hasCompany: boolean; storageConfigured: boolean; documents: DocumentDto[] }> {
  const companyId = await ownedCompanyId(userId);
  const empty = (type: DocumentType): DocumentDto => ({ id: null, type, label: documentLabel(type), status: "NOT_SUBMITTED", originalFilename: null, fileSize: null, mimeType: null, submittedAt: null, reviewedAt: null, expiryDate: null, rejectionReason: null });
  if (!companyId) return { hasCompany: false, storageConfigured: storageConfigured(), documents: [] };
  const { documents } = await collections();
  const rows = await documents.find({ companyId, active: true }, { projection: PROJECT_DOC }).limit(50).toArray();
  const byType = new Map(rows.map((r) => [r.documentType, toDocument(r as DocumentRow)]));
  return { hasCompany: true, storageConfigured: storageConfigured(), documents: DOCUMENT_TYPES.map((t) => byType.get(t.value) ?? empty(t.value)) };
}

export type UploadResult = { ok: true; document: DocumentDto } | { ok: false; code: "NO_COMPANY" | "STORAGE_UNAVAILABLE" | "VERIFIED_LOCKED" } | { ok: false; code: "INVALID"; field: string; message: string };

/**
 * Validates and stores one document. Order: company owned -> storage configured -> type -> expiry -> size -> extension -> real
 * content (first bytes) agrees with the extension. The status is always PENDING: the buyer cannot choose it. A second upload of
 * the same type replaces the first (the older record is retired and its file removed after the new one is saved).
 */
export async function uploadBuyerDocument(userId: string, input: { documentType: unknown; expiryDate: unknown; filename: string; bytes: Buffer }): Promise<UploadResult> {
  const companyId = await ownedCompanyId(userId);
  if (!companyId) return { ok: false, code: "NO_COMPANY" };
  if (!storageConfigured()) return { ok: false, code: "STORAGE_UNAVAILABLE" };
  if (!isDocumentType(input.documentType)) return { ok: false, code: "INVALID", field: "documentType", message: "Choose a document type from the list." };
  const expiry = checkExpiry(input.expiryDate);
  if (!expiry.ok) return { ok: false, code: "INVALID", field: "expiryDate", message: expiry.error };
  if (input.bytes.length === 0) return { ok: false, code: "INVALID", field: "file", message: "The file is empty." };
  if (input.bytes.length > DOCUMENT_LIMITS.maxBytes) return { ok: false, code: "INVALID", field: "file", message: `The file is larger than ${DOCUMENT_LIMITS.maxBytes / 1024 / 1024} MB.` };
  const claimed = claimedExtension(input.filename);
  if (!claimed) return { ok: false, code: "INVALID", field: "file", message: "Only PDF, JPG and PNG files are accepted." };
  const real = detectType(input.bytes);
  if (!real || real.ext !== claimed) return { ok: false, code: "INVALID", field: "file", message: "The file content is not a valid PDF, JPG or PNG that matches its name." };

  const { documents } = await collections();
  const existing = await documents.findOne({ companyId, documentType: input.documentType, active: true });
  if (existing?.verificationStatus === "VERIFIED") return { ok: false, code: "VERIFIED_LOCKED" };
  const fileReference = await saveFile(input.bytes, real.ext);
  const now = new Date();
  const row: DocumentRow = { _id: new ObjectId(), companyId, uploadedBy: new ObjectId(userId), documentType: input.documentType, fileReference, originalFilename: displayFilename(input.filename), mimeType: real.mime, fileSize: input.bytes.length, verificationStatus: "PENDING", submittedAt: now, reviewedAt: null, reviewedBy: null, expiryDate: expiry.value, rejectionReason: null, active: true, deletedAt: null, createdAt: now, updatedAt: now };
  if (existing) await documents.updateOne({ _id: existing._id }, { $set: { active: false, deletedAt: now, updatedAt: now } });
  try {
    await documents.insertOne(row);
  } catch (error) {
    await removeStored(fileReference);
    if (existing) await documents.updateOne({ _id: existing._id }, { $set: { active: true, deletedAt: null } });
    throw error;
  }
  if (existing) await removeStored(existing.fileReference);
  await recordProfileEvent(new ObjectId(userId), existing ? "DOCUMENT_REPLACED" : "DOCUMENT_UPLOADED", [input.documentType]);
  await notifyDocumentUploaded(userId, row._id.toString(), documentLabel(input.documentType), Boolean(existing));
  return { ok: true, document: toDocument(row) };
}

/** The file of a document owned by this buyer's company, or null (also for someone else's id: the answer is the same). */
export async function readBuyerDocument(userId: string, id: string): Promise<{ bytes: Buffer; mime: string; filename: string } | null> {
  if (!ObjectId.isValid(id)) return null;
  const companyId = await ownedCompanyId(userId);
  if (!companyId) return null;
  const { documents } = await collections();
  const row = await documents.findOne({ _id: new ObjectId(id), companyId, active: true }, { projection: { fileReference: 1, originalFilename: 1 } });
  if (!row) return null;
  const stored = await readStored(row.fileReference);
  return stored ? { ...stored, filename: row.originalFilename } : null;
}

export async function deleteBuyerDocument(userId: string, id: string): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "VERIFIED_LOCKED" }> {
  if (!ObjectId.isValid(id)) return { ok: false, code: "NOT_FOUND" };
  const companyId = await ownedCompanyId(userId);
  if (!companyId) return { ok: false, code: "NOT_FOUND" };
  const { documents } = await collections();
  const row = await documents.findOne({ _id: new ObjectId(id), companyId, active: true });
  if (!row) return { ok: false, code: "NOT_FOUND" };
  // a document a reviewer verified is part of the company's record: removing it needs support, not a button
  if (row.verificationStatus === "VERIFIED") return { ok: false, code: "VERIFIED_LOCKED" };
  const now = new Date();
  await documents.updateOne({ _id: row._id }, { $set: { active: false, deletedAt: now, updatedAt: now } });
  await removeStored(row.fileReference);
  await recordProfileEvent(new ObjectId(userId), "DOCUMENT_DELETED", [row.documentType]);
  return { ok: true };
}

// ---------- verification, completion, security ----------

export interface NextStep {
  key: string;
  label: string;
  status: "done" | "todo" | "blocked";
  tab: "personal" | "company" | "documents" | "verification" | "security";
  note?: string;
}

export interface VerificationDto {
  email: { status: "VERIFIED" | "UNVERIFIED"; canResend: boolean; note: string };
  mobile: { status: "VERIFIED" | "UNVERIFIED"; available: boolean; masked: string | null; note: string };
  company: { status: "NO_COMPANY" | "UNVERIFIED"; reviewAvailable: false; note: string };
  documents: { total: number; pending: number; verified: number; rejected: number; note: string };
}

export interface Overview {
  profile: ProfileDto;
  company: CompanyDto | null;
  completion: { percent: number; items: CompletionItem[] };
  verification: VerificationDto;
  nextSteps: NextStep[];
}

export async function getBuyerProfileOverview(userId: string): Promise<Overview | null> {
  const user = await getBuyerUser(userId);
  if (!user) return null;
  const company = await getBuyerCompany(userId);
  const docs = await listBuyerDocuments(userId);
  const submitted = docs.documents.filter((d) => d.status !== "NOT_SUBMITTED");
  const completion = computeCompletion({
    name: user.name,
    designation: user.designation ?? null,
    emailVerified: user.emailVerified === true,
    phoneVerified: user.phoneVerified === true,
    company: company ? { exists: true, businessType: Boolean(company.businessType), location: Boolean(company.city && company.state && company.postalCode), description: Boolean(company.description) } : null,
    documentCount: submitted.length,
  });
  const verification: VerificationDto = {
    email: { status: user.emailVerified === true ? "VERIFIED" : "UNVERIFIED", canResend: user.emailVerified !== true && emailConfigured(), note: user.emailVerified === true ? "Your email address is confirmed." : emailConfigured() ? "Confirm your email with the link we send you." : "Email sending is not set up yet, so a confirmation link cannot be sent." },
    mobile: { status: user.phoneVerified === true ? "VERIFIED" : "UNVERIFIED", available: false, masked: maskPhone(user.phone?.normalized), note: user.phoneVerified === true ? "Your mobile number is confirmed." : "Mobile verification by one-time code is not available yet (no SMS service is connected)." },
    company: { status: company ? "UNVERIFIED" : "NO_COMPANY", reviewAvailable: false, note: company ? "Your company details are saved. Company verification is not available yet: there is no review process, so the status stays Unverified." : "Add your company details first." },
    documents: { total: submitted.length, pending: submitted.filter((d) => d.status === "PENDING").length, verified: submitted.filter((d) => d.status === "VERIFIED").length, rejected: submitted.filter((d) => d.status === "REJECTED" || d.status === "RESUBMISSION_REQUIRED").length, note: submitted.length === 0 ? "No documents submitted." : "Documents wait for review. No review process is available yet, so they stay Pending." },
  };
  const nextSteps: NextStep[] = [
    { key: "email", label: "Verify your primary email", status: user.emailVerified === true ? "done" : verification.email.canResend ? "todo" : "blocked", tab: "verification", note: user.emailVerified === true ? undefined : verification.email.note },
    { key: "mobile", label: "Verify your mobile number", status: user.phoneVerified === true ? "done" : "blocked", tab: "verification", note: user.phoneVerified === true ? undefined : verification.mobile.note },
    { key: "company", label: "Complete your company profile (business type, city, state and PIN code)", status: completion.items.filter((i) => ["company", "businessType", "location"].includes(i.key)).every((i) => i.met) ? "done" : "todo", tab: "company" },
    { key: "documents", label: "Add at least one company document", status: submitted.length > 0 ? "done" : docs.hasCompany && docs.storageConfigured ? "todo" : "blocked", tab: "documents", note: !docs.hasCompany ? "Add your company first." : !docs.storageConfigured ? "Document storage is not configured on this server." : undefined },
    { key: "business", label: "Business verification", status: "blocked", tab: "verification", note: "Not available yet: no review process exists." },
  ];
  return { profile: toProfile(user, company?.legalName ?? user.companyName ?? null), company, completion, verification, nextSteps };
}

export interface SecurityDto {
  accountStatus: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  sessions: { available: false; reason: string };
}

export async function getBuyerSecurity(userId: string): Promise<SecurityDto | null> {
  const user = await getBuyerUser(userId);
  if (!user) return null;
  return { accountStatus: user.accountStatus ?? "ACTIVE", emailVerified: user.emailVerified === true, phoneVerified: user.phoneVerified === true, lastLoginAt: user.lastLoginAt?.toISOString() ?? null, passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null, sessions: { available: false, reason: "A list of signed-in devices is not available. Changing your password signs you out of every other device." } };
}
