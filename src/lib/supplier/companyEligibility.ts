import { ObjectId, type ClientSession } from "mongodb";
import { COMPANY_KEY_PREFIX, isCompanyKey, supplierCompanies } from "./company";

/**
 * Effective company eligibility, read from the DATABASE (never from a cached public snapshot). One place for the rule "a SUSPENDED company takes no new business":
 *  - `companyActiveNow`: the company is ACTIVE (used before a supplier product is accepted as a target of a new inquiry);
 *  - `acceptsNewInquiries`: a supplier key may be the target of a NEW direct inquiry: a company's own key needs an ACTIVE company; a catalogue seller linked to a company needs that
 *    company not suspended; a seller no company owns is unaffected (the legacy catalogue has no company to restrict);
 *  - `guardCompanyWrite`: the same rule INSIDE a transaction, as a WRITE to the company document. A suspension is a write to that document too, so a commit that read the company
 *    as active before the suspension committed conflicts with it and retries (it then sees SUSPENDED). This closes the write-skew window a plain read would leave.
 * Suspension never deletes or alters history; it only stops new business.
 */
export async function companyActiveNow(companyId: ObjectId, session?: ClientSession): Promise<boolean> {
  return Boolean(await (await supplierCompanies()).findOne({ _id: companyId, status: "ACTIVE" }, { projection: { _id: 1 }, session }));
}

export async function acceptsNewInquiries(supplierKey: string, session?: ClientSession): Promise<boolean> {
  if (!supplierKey) return true;
  const col = await supplierCompanies();
  if (isCompanyKey(supplierKey)) return companyActiveNow(new ObjectId(supplierKey.slice(COMPANY_KEY_PREFIX.length)), session);
  const c = await col.findOne({ sellerKeys: supplierKey }, { projection: { status: 1 }, session });
  return !c || c.status !== "SUSPENDED";
}

export async function guardCompanyWrite(supplierKey: string, session: ClientSession): Promise<boolean> {
  if (!supplierKey) return true;
  const col = await supplierCompanies();
  const now = new Date();
  if (isCompanyKey(supplierKey)) return (await col.updateOne({ _id: new ObjectId(supplierKey.slice(COMPANY_KEY_PREFIX.length)), status: "ACTIVE" }, { $set: { guardAt: now } } as never, { session })).matchedCount === 1;
  const c = await col.findOneAndUpdate({ sellerKeys: supplierKey }, { $set: { guardAt: now } } as never, { session, projection: { status: 1 }, returnDocument: "before" });
  return !c || c.status !== "SUSPENDED";
}
