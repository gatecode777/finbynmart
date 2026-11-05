import { permanentRedirect } from "next/navigation";

/**
 * The buyer's inquiries moved to /buyer/inquiries (inside the buyer workspace). This address stays only so older links, bookmarks
 * and emails keep working; it holds no page of its own, so there is nothing to keep in step. The sign-in and buyer-only checks
 * happen on the new page.
 */
export default function LegacyMyInquiriesPage(): never {
  permanentRedirect("/buyer/inquiries");
}
