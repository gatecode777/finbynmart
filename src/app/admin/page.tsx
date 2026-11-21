import { redirect } from "next/navigation";

/** The admin start address: the dashboard lives at /admin/dashboard. */
export default function AdminIndex() {
  redirect("/admin/dashboard");
}
