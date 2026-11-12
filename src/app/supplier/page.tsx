import { redirect } from "next/navigation";

/** /supplier is only the portal's base address: it opens the dashboard (access was already checked by the layout). */
export default function SupplierHome(): never {
  redirect("/supplier/dashboard");
}
