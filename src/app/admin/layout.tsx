import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { getCurrentUser } from "@/lib/auth/session";
import { getAdminPermissions } from "@/lib/admin/permissions";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Layout of the whole admin portal. The role and capabilities come from the account record on the server: anonymous → sign-in; anyone who is
 * not an admin with at least one capability → /forbidden?portal=admin, and no admin page code or data runs. Every page and API checks its own
 * capability again.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/sign-in?next=%2Fadmin%2Finquiries");
  const permissions = user.role === "admin" ? await getAdminPermissions(user.id).catch(() => []) : [];
  if (permissions.length === 0) redirect("/forbidden?portal=admin");
  return <AdminShell>{children}</AdminShell>;
}
