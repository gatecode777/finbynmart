import { ObjectId, type Collection } from "mongodb";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { getDb } from "@/lib/db/mongo";
import { createTtlCache, ttlSetting, withTimeout } from "@/lib/perf/ttlCache";
import { buildCertificationView, type CertificationView } from "./engine";
import { documentExists, documentKind, readDocument } from "./documents";
import { daysUntil, expiryState, isIsoDate, todayInIndia } from "./expiry";
import type { CertificationQuery } from "./query";
import { certTypeLabel, type CertificationDoc, type PublicCertification, type VerificationStatus } from "./types";

/**
 * Read side of the `certifications` collection. Everything public goes through here, so the access rules live in one
 * place: a record is public only when it is approved (VERIFIED, or EXPIRED after having been approved) and not deleted,
 * and every query is scoped to the supplier the URL resolved to. Pending, rejected and suspended records never leave
 * this module, and neither do the internal fields (remarks, rejection reason, reviewer, file name).
 */

const PUBLIC_STATUSES: VerificationStatus[] = ["VERIFIED", "EXPIRED"];
const MAX_PER_SUPPLIER = 500;

const PROJECTION = {
  supplierSlug: 1,
  name: 1,
  certificationType: 1,
  issuingAuthority: 1,
  certificateNumber: 1,
  certificateNumberPublic: 1,
  description: 1,
  issueDate: 1,
  expiryDate: 1,
  fileReference: 1,
  publicDocumentAllowed: 1,
  verificationStatus: 1,
} as const;

let indexReady: Promise<unknown> | undefined;

async function certifications(): Promise<Collection<CertificationDoc>> {
  const collection = (await getDb()).collection<CertificationDoc>("certifications");
  // The one query pattern: a supplier's approved records. _id covers the lookup by id.
  indexReady ??= collection.createIndex({ supplierSlug: 1, verificationStatus: 1 });
  await indexReady;
  return collection;
}

const publicFilter = (supplierSlug: string) => ({ supplierSlug, verificationStatus: { $in: PUBLIC_STATUSES }, deletedAt: null });

/** Explicit allow-list projection from the stored record to what a buyer may see. */
async function toPublic(doc: CertificationDoc, today: string): Promise<PublicCertification | null> {
  // A record with an impossible date cannot be shown honestly, so it is left out rather than guessed at.
  if (!isIsoDate(doc.issueDate) || (doc.expiryDate && !isIsoDate(doc.expiryDate))) return null;

  const storedExpired = doc.verificationStatus === "EXPIRED";
  const expiryDate = doc.expiryDate || null;
  const state = storedExpired ? "expired" : expiryState(expiryDate, today);
  const id = doc._id.toString();
  const kind = documentKind(doc.fileReference);
  const available = doc.publicDocumentAllowed === true && kind !== null && (await documentExists(doc.fileReference));

  return {
    id,
    name: doc.name,
    type: { value: doc.certificationType, label: certTypeLabel(doc.certificationType) },
    authority: doc.issuingAuthority,
    description: doc.description || null,
    certificateNumber: doc.certificateNumberPublic === true && doc.certificateNumber ? doc.certificateNumber : null,
    issueDate: doc.issueDate,
    expiryDate,
    status: state === "expired" ? "expired" : "verified",
    expiry: { state, daysLeft: expiryDate && state !== "expired" ? daysUntil(expiryDate, today) : null },
    document: { available, kind: available ? kind : null, href: available ? `/api/public/certifications/${id}/document` : null },
  };
}

/**
 * A supplier's public certifications (bounded), with expiry computed for today in India. Kept for a short time
 * (FINBYN_CERT_CACHE_MS, default 30 s) per supplier AND per calendar day, so an expiry that passes at midnight is never
 * served stale across it; concurrent readers share one database read and one set of file checks. There is no certification
 * write path yet (records are loaded by an operator), so the TTL bounds how long a database change takes to show.
 */
const listCache = createTtlCache<PublicCertification[]>({ name: "certifications.list", ttlMs: ttlSetting("FINBYN_CERT_CACHE_MS", 30_000), maxEntries: 300 });
const countCache = createTtlCache<number>({ name: "certifications.count", ttlMs: ttlSetting("FINBYN_CERT_CACHE_MS", 30_000), maxEntries: 1000 });

export async function listPublicCertifications(supplierSlug: string, now: Date = new Date()): Promise<PublicCertification[]> {
  const today = todayInIndia(now);
  return listCache.get(`${supplierSlug}|${today}`, async () => {
    const docs = await (await certifications()).find(publicFilter(supplierSlug), { projection: PROJECTION }).limit(MAX_PER_SUPPLIER).toArray();
    const items = await Promise.all(docs.map((doc) => toPublic(doc, today)));
    return items.filter((item): item is PublicCertification => item !== null);
  });
}

export async function getSupplierCertificationView(supplierSlug: string, query: CertificationQuery): Promise<CertificationView> {
  return buildCertificationView(await listPublicCertifications(supplierSlug), query);
}

/**
 * Number of public certifications, for the tab label. Counts exactly what the list shows: only the two date fields are
 * read (no documents are built), and a record with an impossible date is left out here as it is in the list.
 */
export async function countPublicCertifications(supplierSlug: string): Promise<number> {
  return countCache.get(supplierSlug, async () => {
    const rows = await (await certifications()).find(publicFilter(supplierSlug), { projection: { issueDate: 1, expiryDate: 1 } }).limit(MAX_PER_SUPPLIER).toArray();
    return rows.filter((row) => isIsoDate(row.issueDate) && (!row.expiryDate || isIsoDate(row.expiryDate))).length;
  });
}

/** The count for a tab label; undefined (no number shown) when the database cannot be reached. */
export async function countPublicCertificationsSafe(supplierSlug: string): Promise<number | undefined> {
  try {
    // Optional number in a tab: given 1.5 s, then left out rather than holding the page back.
    return await withTimeout(countPublicCertifications(supplierSlug), 1500);
  } catch (error) {
    console.error("certification count failed", error);
    return undefined;
  }
}

/** One public record with the supplier it belongs to; null when the id is malformed, unknown, not approved or deleted. */
export async function getPublicCertificationRecord(id: string): Promise<{ doc: CertificationDoc; item: PublicCertification } | null> {
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  const doc = await (await certifications()).findOne({ _id: new ObjectId(id), verificationStatus: { $in: PUBLIC_STATUSES }, deletedAt: null }, { projection: PROJECTION });
  // A record of a supplier that has no public profile is not public either.
  if (!doc || !getPublicSupplierBySlug(doc.supplierSlug)) return null;
  const item = await toPublic(doc, todayInIndia());
  return item ? { doc, item } : null;
}

export type DocumentResult = { status: "ok"; bytes: Buffer; mime: string; extension: string; name: string } | { status: "not_found" } | { status: "unavailable" };

/**
 * The document of one public record. `not_found` for everything a buyer is not entitled to (unknown, not approved,
 * deleted, public access not allowed): the answer is the same for all of them. `unavailable` only when the record is
 * entitled but the file cannot be read.
 */
export async function getPublicCertificateDocument(id: string): Promise<DocumentResult> {
  const record = await getPublicCertificationRecord(id);
  if (!record || record.doc.publicDocumentAllowed !== true || !record.doc.fileReference) return { status: "not_found" };
  const file = await readDocument(record.doc.fileReference);
  if (!file) return { status: "unavailable" };
  return { status: "ok", ...file, name: record.item.name };
}
