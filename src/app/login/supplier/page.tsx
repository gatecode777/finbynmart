import { redirect } from "next/navigation";

/** Route alias (not a separate page): there is one sign-in page for buyers and suppliers. Password reset sends suppliers here. */
export default function SupplierLoginAlias() {
  redirect("/sign-in");
}
