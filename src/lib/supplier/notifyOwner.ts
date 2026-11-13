import { findCompanyBySupplierKey } from "./company";
import { notifySupplier, type SupplierNotificationCategory } from "./notifications";

/**
 * In-app notice to the supplier company that owns a seller. Called only AFTER the business action committed; it can never repeat or undo it.
 * The company is found by the unique seller ownership (`sellerKeys`), never from a request. A company with no linked seller, a suppressed
 * category (the owner switched it off) or any failure gives `false`. The text must never carry private message bodies. In-app only: no e-mail or SMS exists.
 */
export async function notifySellerOwner(
  sellerKey: string,
  event: { category: SupplierNotificationCategory; type: string; title: string; body: string; link?: string; dedupeKey: string },
): Promise<boolean> {
  try {
    const company = await findCompanyBySupplierKey(sellerKey);
    if (!company) return false;
    return await notifySupplier(company.ownerUserId.toHexString(), event);
  } catch (error) {
    console.error("supplier notice not created", event.type, (error as Error).message);
    return false;
  }
}
