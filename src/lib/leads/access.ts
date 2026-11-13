import type { ClientSession, Filter, ObjectId } from "mongodb";
import { inquiriesCollection, type InquiryDoc } from "@/lib/inquiries/service";
import type { SupplierContext } from "@/lib/supplier/company";
import { distributionCollections } from "./distribution";

/**
 * THE one way a supplier-side service reads an inquiry: by DIRECT address (`supplierKey` is one of the company's seller keys) or by a MATCHED recipient
 * relationship (`inquiry_recipients`, unique per inquiry + company, read for every request). A MATCHED view is rebuilt for that recipient only:
 *  - `supplierKey` / `supplierName` / `productKey` are the recipient's own (so its quotations, messages and orders carry its own identity and stay apart from every other recipient's),
 *  - the selected supplier's identity, other recipients, the shared status history and the guest/contact fields are NOT in the view,
 *  - `status` is the recipient's own progress (a buyer cancel/close still shows), never another supplier's action.
 * Redaction happens here, at the service boundary, not in the browser.
 */
const CLOSED = ["CANCELLED", "CLOSED", "REJECTED"];

export type InquiryRow = InquiryDoc & { _id: NonNullable<InquiryDoc["_id"]> };

export async function findInquiryFor(context: SupplierContext, where: Filter<InquiryDoc>, session?: ClientSession): Promise<InquiryRow | null> {
  const keys = context.company.sellerKeys;
  if (keys.length === 0) return null;
  const inquiries = await inquiriesCollection();
  const doc = (await inquiries.findOne({ $and: [where, { $or: [{ supplierKey: { $in: keys } }, { matchedSupplierKeys: { $in: keys } }] }] } as never, { session })) as InquiryRow | null;
  if (!doc) return null;
  if (keys.includes(doc.supplierKey)) return { ...doc, recipientType: "DIRECT" };
  const { recipients } = await distributionCollections();
  const r = await recipients.findOne({ inquiryId: doc._id, companyId: context.companyId, state: "ACTIVE" }, { session });
  if (!r || !keys.includes(r.recipientSupplierKey)) return null;
  const { matchedSupplierKeys: _m, idempotencyKey: _i, statusHistory: _h, guest: _g, supplierSlug: _s, ...shared } = doc;
  void _m; void _i; void _h; void _g; void _s;
  return {
    ...shared,
    supplierKey: r.recipientSupplierKey,
    supplierName: context.profile.displayName,
    productKey: r.matchedProductKey,
    status: CLOSED.includes(doc.status) ? doc.status : r.status,
    statusHistory: [],
    recipientType: "MATCHED",
  } as InquiryRow;
}

/** Move the recipient's OWN status (MATCHED) or the shared inquiry's (DIRECT). Returns false when a conditional update did not match. */
export async function advanceStatus(inquiry: InquiryRow, context: SupplierContext, from: string, to: string, history: NonNullable<InquiryDoc["statusHistory"]>, now: Date, session: ClientSession, strict = true): Promise<boolean> {
  if (inquiry.recipientType === "MATCHED") {
    const { recipients } = await distributionCollections();
    const r = await recipients.updateOne({ inquiryId: inquiry._id, companyId: context.companyId, status: from as never }, { $set: { status: to as never } }, { session });
    return r.matchedCount === 1;
  }
  const inquiries = await inquiriesCollection();
  const r = await inquiries.updateOne({ _id: inquiry._id, ...(strict ? { status: from } : {}) }, { $set: { status: to, updatedAt: now }, $push: { statusHistory: { $each: history } } } as never, { session });
  return r.matchedCount === 1;
}

// ---------- the matched-lead side of the dashboard (the same scope and state definitions as the inbox) ----------
const CLOSED_SET = ["CANCELLED", "CLOSED", "REJECTED"];

/** Matching leads RECEIVED in [from, to): the recipient rows of this company, by their own creation time (one per inquiry, never per matching product). */
export async function matchedReceivedCount(companyId: ObjectId, from: Date, to: Date): Promise<number> {
  const { recipients } = await distributionCollections();
  return recipients.countDocuments({ companyId, state: "ACTIVE", createdAt: { $gte: from, $lt: to } });
}

/** Matching leads still awaiting this company's first response: recipient status NEW and the requirement not closed. */
export async function matchedPendingCount(companyId: ObjectId): Promise<number> {
  const { recipients } = await distributionCollections();
  const [row] = await recipients
    .aggregate<{ n: number }>([
      { $match: { companyId, state: "ACTIVE", status: "NEW" } },
      { $lookup: { from: "inquiries", localField: "inquiryId", foreignField: "_id", as: "inq", pipeline: [{ $project: { status: 1 } }] } },
      { $unwind: "$inq" },
      { $match: { "inq.status": { $nin: CLOSED_SET } } },
      { $count: "n" },
    ])
    .toArray();
  return row?.n ?? 0;
}

/** The newest matching leads of this company (bounded), with the recipient's own status. */
export async function matchedRecent(companyId: ObjectId, limit: number) {
  const { recipients } = await distributionCollections();
  const rows = await recipients
    .aggregate<{ createdAt: Date; status: string; inq: { reference?: string; buyerId?: ObjectId; buyerType?: string; productName?: string; categoryName?: string; quantity?: number; unit?: string; status: string } }>([
      { $match: { companyId, state: "ACTIVE" } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: limit },
      { $lookup: { from: "inquiries", localField: "inquiryId", foreignField: "_id", as: "inq", pipeline: [{ $project: { reference: 1, buyerId: 1, buyerType: 1, productName: 1, categoryName: 1, quantity: 1, unit: 1, status: 1 } }] } },
      { $unwind: "$inq" },
    ])
    .toArray();
  return rows.map((r) => ({ ...r.inq, status: CLOSED_SET.includes(r.inq.status) ? r.inq.status : r.status, createdAt: r.createdAt }));
}
