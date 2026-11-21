import type { Metadata } from "next";
import Link from "next/link";
import { ObjectId } from "mongodb";
import { AdminSettingsWorkspace } from "@/components/admin/AdminSettingsWorkspace";
import { requireAnyAdminPage } from "@/lib/auth/guards";
import { ADMIN_CAPABILITIES } from "@/lib/admin/permissions";
import { getAccount } from "@/lib/admin/settings";
import { getPreferences } from "@/lib/admin/notifications";
import { withPagePerf } from "@/lib/perf/instrument";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Admin Settings | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/settings?tab=account|security: the signed-in administrator's OWN settings (any administrator account that can enter the admin portal; no capability is implied or granted). The account
 * comes from the verified session only. Nothing is written when the page loads.
 */
async function AdminSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const tab = raw.tab === "security" ? "security" : "account";
  const { user, permissions } = await requireAnyAdminPage(`/admin/settings${tab === "security" ? "?tab=security" : ""}`, ADMIN_CAPABILITIES);
  const admin = new ObjectId(user.id);
  const [account, categories] = await Promise.all([getAccount(admin).catch(() => null), permissions.includes("notifications.read") ? getPreferences(admin, permissions).catch(() => null) : Promise.resolve([])]);
  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}><Link href="/admin/dashboard">Admin</Link> / Settings</p>
      <h1 className={styles.heading}>Admin Settings</h1>
      <p className={styles.lead}>Manage your account and supported preferences.</p>
      {account && categories ? (
        <AdminSettingsWorkspace account={account} categories={categories} canPrefs={permissions.includes("notifications.read")} initialTab={tab} />
      ) : (
        <p role="alert" className={styles.err}>Your settings could not be loaded. Nothing was changed. <Link href={`/admin/settings${tab === "security" ? "?tab=security" : ""}`}>Try again</Link></p>
      )}
    </div>
  );
}

export default withPagePerf("page admin-settings", AdminSettingsPage);
