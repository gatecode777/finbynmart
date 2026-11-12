import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { countActiveSessions } from "@/lib/auth/sessionRegistry";
import { claimedExtension, detectType, displayFilename, removeStored, saveFile, storageConfigured } from "@/lib/buyer/documentStorage";
import {
  SUPPLIER_DOCUMENT_LIMITS,
  SUPPLIER_DOCUMENT_TYPES,
  type SupplierCompanyInput,
  type SupplierDocumentStatus,
  type SupplierDocumentType,
  type SupplierPersonalInput,
} from "./profileRules";
import { supplierCompanies, type SupplierCompanyDoc } from "./company";

export interface SupplierDocumentDto {
  id: string;
  type: SupplierDocumentType;
  label: string;
  status: SupplierDocumentStatus;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  submittedAt: string;
  reviewedAt: string | null;
  expiryDate: string | null;
  rejectionReason: string | null;
}

export interface SupplierCompanyProfileDto {
  id: string;
  businessName: string;
  displayName: string | null;
  businessType: string;
  industry: string | null;
  description: string | null;
  website: string | null;
  yearEstablished: number | null;
  country: string;
  state: string | null;
  city: string | null;
  postalCode: string | null;
  registeredAddress: string | null;
  operatingAddress: string | null;
  verificationStatus: "UNVERIFIED";
  version: number;
}

export interface SupplierPersonalProfileDto {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  designation: string | null;
  alternatePhone: { countryCode: string; number: string; normalized: string } | null;
  alternateEmail: string | null;
  version: number;
}

export interface SupplierCompletionItem {
  key: string;
  label: string;
  met: boolean;
  tab: "personal" | "company" | "documents" | "verification" | "security";
}

export interface SupplierOverviewDto {
  profile: SupplierPersonalProfileDto;
  company: SupplierCompanyProfileDto;
  completion: {
    percent: number;
    items: SupplierCompletionItem[];
  };
  verification: {
    email: { status: "VERIFIED" | "UNVERIFIED"; note: string };
    mobile: { status: "VERIFIED" | "UNVERIFIED"; note: string };
    company: { status: "UNVERIFIED"; note: string };
    documents: { total: number; pending: number; verified: number; rejected: number; note: string };
  };
  nextSteps: {
    key: string;
    label: string;
    status: "done" | "todo" | "blocked";
    tab: "personal" | "company" | "documents" | "verification" | "security";
    note?: string;
  }[];
}

export interface SupplierSecurityDto {
  accountStatus: string;
  email?: string;
  emailVerified: boolean;
  phone?: string | null;
  phoneVerified: boolean;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  sessions: {
    available: boolean;
    activeCount: number | null;
    reason: string;
  };
}

interface UserRow {
  _id: ObjectId;
  name: string;
  email: string;
  role: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  phone?: { countryCode: string; number: string; normalized: string };
  designation?: string;
  alternatePhone?: { countryCode: string; number: string; normalized: string };
  alternateEmail?: string;
  profileVersion?: number;
  lastLoginAt?: Date | null;
  passwordChangedAt?: Date;
  accountStatus?: string;
  sessionVersion?: number;
  supplier?: { businessName: string; phone: string; city: string; offering: string };
}

interface ExtendedSupplierCompanyDoc extends SupplierCompanyDoc {
  businessName?: string;
  displayName?: string;
  businessType?: string;
  industry?: string;
  description?: string;
  website?: string;
  yearEstablished?: number;
  country?: string;
  state?: string;
  city?: string;
  postalCode?: string;
  registeredAddress?: string;
  operatingAddress?: string;
  version?: number;
}

interface DocumentRow {
  _id: ObjectId;
  companyId: ObjectId;
  uploadedBy: ObjectId;
  documentType: SupplierDocumentType;
  fileReference: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  verificationStatus: Exclude<SupplierDocumentStatus, "NOT_SUBMITTED">;
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

const documentLabel = (type: SupplierDocumentType) => SUPPLIER_DOCUMENT_TYPES.find((d) => d.value === type)?.label ?? type;

async function getCompanyDocumentsCollection(): Promise<Collection<DocumentRow>> {
  const db = await getDb();
  return db.collection<DocumentRow>("company_documents");
}

export async function getSupplierProfileOverview(userId: string): Promise<SupplierOverviewDto | null> {
  if (!ObjectId.isValid(userId)) return null;
  const _id = new ObjectId(userId);
  const db = await getDb();
  const [user, companiesCol] = await Promise.all([
    db.collection<UserRow>("users").findOne({ _id }),
    supplierCompanies(),
  ]);

  if (!user || user.role !== "supplier" || !user.supplier) return null;

  let company = (await companiesCol.findOne({ ownerUserId: _id })) as ExtendedSupplierCompanyDoc | null;
  if (!company) {
    const now = new Date();
    await companiesCol.insertOne({
      _id: new ObjectId(),
      ownerUserId: _id,
      sellerKeys: [],
      status: "ACTIVE",
      verificationStatus: "UNVERIFIED",
      createdAt: now,
      updatedAt: now,
    });
    company = (await companiesCol.findOne({ ownerUserId: _id })) as ExtendedSupplierCompanyDoc | null;
  }
  if (!company) return null;

  const docsCol = await getCompanyDocumentsCollection();
  const documents = await docsCol.find({ companyId: company._id, active: true }).sort({ createdAt: -1 }).toArray();

  const businessName = company.businessName ?? user.supplier.businessName ?? "";
  const city = company.city ?? user.supplier.city ?? "";
  const phone = user.supplier.phone ?? (user.phone ? user.phone.normalized : null);
  const description = company.description ?? user.supplier.offering ?? "";

  const personalDto: SupplierPersonalProfileDto = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified === true,
    phone,
    phoneVerified: user.phoneVerified === true,
    designation: user.designation ?? null,
    alternatePhone: user.alternatePhone ?? null,
    alternateEmail: user.alternateEmail ?? null,
    version: user.profileVersion ?? 0,
  };

  const companyDto: SupplierCompanyProfileDto = {
    id: company._id.toString(),
    businessName,
    displayName: company.displayName ?? null,
    businessType: company.businessType ?? "Manufacturer",
    industry: company.industry ?? null,
    description: description || null,
    website: company.website ?? null,
    yearEstablished: company.yearEstablished ?? null,
    country: company.country ?? "India",
    state: company.state ?? null,
    city: city || null,
    postalCode: company.postalCode ?? null,
    registeredAddress: company.registeredAddress ?? null,
    operatingAddress: company.operatingAddress ?? null,
    verificationStatus: "UNVERIFIED",
    version: company.version ?? 0,
  };

  const items: SupplierCompletionItem[] = [
    { key: "name", label: "Contact Person Name", met: Boolean(user.name?.trim()), tab: "personal" },
    { key: "businessName", label: "Company / Business Name", met: Boolean(businessName.trim()), tab: "company" },
    { key: "phone", label: "Primary Phone Number", met: Boolean(phone?.trim()), tab: "personal" },
    { key: "emailVerified", label: "Email Address Confirmed", met: user.emailVerified === true, tab: "security" },
    { key: "city", label: "Business City / Location", met: Boolean(city.trim()), tab: "company" },
    { key: "businessType", label: "Business Type", met: Boolean(companyDto.businessType), tab: "company" },
    { key: "description", label: "Business Offering / Overview", met: Boolean(description.trim()), tab: "company" },
    { key: "address", label: "Business Address & PIN Code", met: Boolean(companyDto.registeredAddress?.trim() && companyDto.postalCode?.trim()), tab: "company" },
    { key: "documents", label: "Business Verification Document", met: documents.length > 0, tab: "documents" },
  ];

  const metCount = items.filter((i) => i.met).length;
  const percent = Math.round((metCount / items.length) * 100);

  const pendingDocs = documents.filter((d) => d.verificationStatus === "PENDING").length;
  const verifiedDocs = documents.filter((d) => d.verificationStatus === "VERIFIED").length;
  const rejectedDocs = documents.filter((d) => d.verificationStatus === "REJECTED").length;

  const nextSteps = [
    {
      key: "step-details",
      label: "Complete company and contact details",
      status: percent >= 70 ? ("done" as const) : ("todo" as const),
      tab: "company" as const,
      note: `${metCount} of ${items.length} items completed.`,
    },
    {
      key: "step-docs",
      label: "Upload GST or business registration document",
      status: documents.length > 0 ? ("done" as const) : ("todo" as const),
      tab: "documents" as const,
      note: documents.length > 0 ? `${documents.length} document(s) uploaded.` : "Upload your GST or business certificate for verification.",
    },
    {
      key: "step-verify",
      label: "Business verification by Finbyn Mart",
      status: company.verificationStatus === "UNVERIFIED" ? ("blocked" as const) : ("done" as const),
      tab: "verification" as const,
      note: "Formal verification requires manual compliance review by Finbyn Mart administration.",
    },
  ];

  return {
    profile: personalDto,
    company: companyDto,
    completion: { percent, items },
    verification: {
      email: {
        status: user.emailVerified ? "VERIFIED" : "UNVERIFIED",
        note: user.emailVerified ? "Your primary email is verified." : "Email verification pending.",
      },
      mobile: {
        status: user.phoneVerified ? "VERIFIED" : "UNVERIFIED",
        note: user.phoneVerified ? "Your phone number is confirmed." : "Phone confirmation via SMS is not enabled yet.",
      },
      company: {
        status: "UNVERIFIED",
        note: "Company verification is awarded by Finbyn Mart compliance following manual document verification.",
      },
      documents: {
        total: documents.length,
        pending: pendingDocs,
        verified: verifiedDocs,
        rejected: rejectedDocs,
        note: documents.length === 0 ? "No documents submitted yet." : `${documents.length} document(s) in review.`,
      },
    },
    nextSteps,
  };
}

export async function updateSupplierPersonal(userId: string, input: SupplierPersonalInput): Promise<{ ok: true; profile: SupplierPersonalProfileDto } | { ok: false; code: string; message: string }> {
  if (!ObjectId.isValid(userId)) return { ok: false, code: "NOT_FOUND", message: "User not found." };
  const _id = new ObjectId(userId);
  const db = await getDb();
  const users = db.collection<UserRow>("users");

  const set: Record<string, unknown> = { name: input.name, updatedAt: new Date() };
  const unset: Record<string, ""> = {};
  if (input.designation) set.designation = input.designation;
  else unset.designation = "";
  if (input.alternatePhone) set.alternatePhone = input.alternatePhone;
  else unset.alternatePhone = "";
  if (input.alternateEmail) set.alternateEmail = input.alternateEmail;
  else unset.alternateEmail = "";

  const updated = await users.findOneAndUpdate(
    { _id, role: "supplier" },
    { $set: set, $unset: unset, $inc: { profileVersion: 1 } },
    { returnDocument: "after" }
  );

  if (!updated) return { ok: false, code: "NOT_FOUND", message: "Supplier account not found." };

  const phone = updated.supplier?.phone ?? (updated.phone ? updated.phone.normalized : null);
  return {
    ok: true,
    profile: {
      id: updated._id.toString(),
      name: updated.name,
      email: updated.email,
      emailVerified: updated.emailVerified === true,
      phone,
      phoneVerified: updated.phoneVerified === true,
      designation: updated.designation ?? null,
      alternatePhone: updated.alternatePhone ?? null,
      alternateEmail: updated.alternateEmail ?? null,
      version: updated.profileVersion ?? 0,
    },
  };
}

export async function updateSupplierCompanyProfile(
  userId: string,
  input: SupplierCompanyInput
): Promise<{ ok: true; company: SupplierCompanyProfileDto } | { ok: false; code: string; message: string }> {
  if (!ObjectId.isValid(userId)) return { ok: false, code: "NOT_FOUND", message: "User not found." };
  const _id = new ObjectId(userId);
  const db = await getDb();
  const companiesCol = await supplierCompanies();

  const company = await companiesCol.findOne({ ownerUserId: _id });
  if (!company) return { ok: false, code: "NOT_FOUND", message: "Supplier company record not found." };

  const now = new Date();
  const updateData: Record<string, unknown> = {
    businessName: input.businessName,
    displayName: input.displayName,
    businessType: input.businessType,
    industry: input.industry,
    description: input.description,
    website: input.website,
    yearEstablished: input.yearEstablished,
    country: input.country,
    state: input.state,
    city: input.city,
    postalCode: input.postalCode,
    registeredAddress: input.registeredAddress,
    operatingAddress: input.operatingAddress,
    updatedAt: now,
  };

  const updatedCompany = (await companiesCol.findOneAndUpdate(
    { ownerUserId: _id },
    { $set: updateData, $inc: { version: 1 } },
    { returnDocument: "after" }
  )) as ExtendedSupplierCompanyDoc | null;

  if (!updatedCompany) return { ok: false, code: "UPDATE_FAILED", message: "Failed to update company." };

  // Keep user.supplier in sync
  await db.collection("users").updateOne(
    { _id },
    {
      $set: {
        "supplier.businessName": input.businessName,
        "supplier.city": input.city ?? "",
        "supplier.offering": input.description ?? "",
        updatedAt: now,
      },
    }
  );

  return {
    ok: true,
    company: {
      id: updatedCompany._id.toString(),
      businessName: updatedCompany.businessName ?? input.businessName,
      displayName: updatedCompany.displayName ?? null,
      businessType: updatedCompany.businessType ?? input.businessType,
      industry: updatedCompany.industry ?? null,
      description: updatedCompany.description ?? null,
      website: updatedCompany.website ?? null,
      yearEstablished: updatedCompany.yearEstablished ?? null,
      country: updatedCompany.country ?? "India",
      state: updatedCompany.state ?? null,
      city: updatedCompany.city ?? null,
      postalCode: updatedCompany.postalCode ?? null,
      registeredAddress: updatedCompany.registeredAddress ?? null,
      operatingAddress: updatedCompany.operatingAddress ?? null,
      verificationStatus: "UNVERIFIED",
      version: updatedCompany.version ?? 0,
    },
  };
}

export async function listSupplierDocuments(userId: string): Promise<{ hasCompany: boolean; storageConfigured: boolean; documents: SupplierDocumentDto[] }> {
  if (!ObjectId.isValid(userId)) return { hasCompany: false, storageConfigured: false, documents: [] };
  const _id = new ObjectId(userId);
  const company = await (await supplierCompanies()).findOne({ ownerUserId: _id });
  if (!company) return { hasCompany: false, storageConfigured: false, documents: [] };

  const docsCol = await getCompanyDocumentsCollection();
  const docs = await docsCol.find({ companyId: company._id, active: true }).sort({ createdAt: -1 }).toArray();

  return {
    hasCompany: true,
    storageConfigured: storageConfigured(),
    documents: docs.map((d) => ({
      id: d._id.toString(),
      type: d.documentType,
      label: documentLabel(d.documentType),
      status: d.verificationStatus,
      originalFilename: d.originalFilename,
      fileSize: d.fileSize,
      mimeType: d.mimeType,
      submittedAt: d.submittedAt.toISOString(),
      reviewedAt: d.reviewedAt?.toISOString() ?? null,
      expiryDate: d.expiryDate,
      rejectionReason: d.rejectionReason,
    })),
  };
}

export async function saveSupplierDocument(
  userId: string,
  input: { documentType: SupplierDocumentType; filename: string; bytes: Buffer; expiryDate?: string | null }
): Promise<{ ok: true; document: SupplierDocumentDto } | { ok: false; message: string }> {
  if (!ObjectId.isValid(userId)) return { ok: false, message: "Invalid user." };
  const _id = new ObjectId(userId);
  const company = await (await supplierCompanies()).findOne({ ownerUserId: _id });
  if (!company) return { ok: false, message: "Supplier company not found." };

  if (input.bytes.length > SUPPLIER_DOCUMENT_LIMITS.maxBytes) {
    return { ok: false, message: "File exceeds maximum size limit of 10MB." };
  }

  const detected = detectType(input.bytes);
  if (!detected) {
    return { ok: false, message: "Only PDF, JPEG, and PNG files are supported." };
  }

  const ext = claimedExtension(input.filename);
  if (!ext || (ext !== detected.ext && !(ext === "jpg" && detected.ext === "jpg"))) {
    return { ok: false, message: "File extension does not match its contents." };
  }

  const fileRef = await saveFile(input.bytes, detected.ext);
  const docsCol = await getCompanyDocumentsCollection();
  const now = new Date();

  // Deactivate prior document of same type
  await docsCol.updateMany(
    { companyId: company._id, documentType: input.documentType, active: true },
    { $set: { active: false, deletedAt: now, updatedAt: now } }
  );

  const row: DocumentRow = {
    _id: new ObjectId(),
    companyId: company._id,
    uploadedBy: _id,
    documentType: input.documentType,
    fileReference: fileRef,
    originalFilename: displayFilename(input.filename),
    mimeType: detected.mime,
    fileSize: input.bytes.length,
    verificationStatus: "PENDING",
    submittedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    expiryDate: input.expiryDate ?? null,
    rejectionReason: null,
    active: true,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await docsCol.insertOne(row);

  return {
    ok: true,
    document: {
      id: row._id.toString(),
      type: row.documentType,
      label: documentLabel(row.documentType),
      status: row.verificationStatus,
      originalFilename: row.originalFilename,
      fileSize: row.fileSize,
      mimeType: row.mimeType,
      submittedAt: row.submittedAt.toISOString(),
      reviewedAt: null,
      expiryDate: row.expiryDate,
      rejectionReason: null,
    },
  };
}

export async function deleteSupplierDocument(userId: string, docId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(docId)) return { ok: false, message: "Invalid identifier." };
  const _id = new ObjectId(userId);
  const company = await (await supplierCompanies()).findOne({ ownerUserId: _id });
  if (!company) return { ok: false, message: "Supplier company not found." };

  const docsCol = await getCompanyDocumentsCollection();
  const doc = await docsCol.findOne({ _id: new ObjectId(docId), companyId: company._id, active: true });
  if (!doc) return { ok: false, message: "Document not found." };

  if (doc.verificationStatus === "VERIFIED") {
    return { ok: false, message: "Verified documents cannot be removed directly. Contact support." };
  }

  const now = new Date();
  await docsCol.updateOne({ _id: doc._id }, { $set: { active: false, deletedAt: now, updatedAt: now } });
  await removeStored(doc.fileReference).catch(() => {});

  return { ok: true };
}

export async function getSupplierSecurity(userId: string): Promise<SupplierSecurityDto | null> {
  if (!ObjectId.isValid(userId)) return null;
  const _id = new ObjectId(userId);
  const db = await getDb();
  const user = await db.collection<UserRow>("users").findOne({ _id, role: "supplier" });
  if (!user) return null;

  const activeCount = await countActiveSessions(user._id, user.sessionVersion ?? 0).catch(() => null);

  const phone = user.supplier?.phone ?? (user.phone ? user.phone.normalized : null);

  return {
    accountStatus: user.accountStatus ?? "ACTIVE",
    email: user.email,
    emailVerified: user.emailVerified === true,
    phone,
    phoneVerified: user.phoneVerified === true,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
    sessions: {
      available: true,
      activeCount,
      reason: "View and manage active signed-in devices. Password changes automatically terminate other active sessions.",
    },
  };
}
