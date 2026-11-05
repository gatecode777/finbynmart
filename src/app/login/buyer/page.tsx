import { redirect } from "next/navigation";

/** Route alias (not a separate page): there is one sign-in page for buyers and suppliers. Password reset sends buyers here. */
export default function BuyerLoginAlias() {
  redirect("/sign-in");
}
