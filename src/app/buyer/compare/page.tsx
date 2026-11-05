import { permanentRedirect } from "next/navigation";

/** The comparison page moved to /buyer/compare-products (the owner's route for Page 35). The old address keeps working. */
export default function LegacyBuyerComparePage() {
  permanentRedirect("/buyer/compare-products");
}
