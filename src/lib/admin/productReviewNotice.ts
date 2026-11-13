import type { ObjectId } from "mongodb";
import { supplierCompanies } from "@/lib/supplier/company";
import { notifySupplier } from "@/lib/supplier/notifications";

/** In-app notice to a company's owner after a committed review decision. Never throws, never carries the internal reviewer note. */
export async function notifySellerOwnerByCompany(companyId: ObjectId, event: { type: string; title: string; body: string; link: string; dedupeKey: string }): Promise<boolean> {
  try {
    const c = await (await supplierCompanies()).findOne({ _id: companyId }, { projection: { ownerUserId: 1 } });
    return c ? await notifySupplier(c.ownerUserId.toHexString(), { category: "system", ...event }) : false;
  } catch (error) {
    console.error("review notice not created", event.type, (error as Error).message);
    return false;
  }
}
