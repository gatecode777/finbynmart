import type { Metadata } from "next";
import Link from "next/link";
import { ObjectId } from "mongodb";
import { AdminNotificationsWorkspace } from "@/components/admin/AdminNotificationsWorkspace";
import { requireAdminPage } from "@/lib/auth/guards";
import { listNotifications } from "@/lib/admin/notifications";
import { PAGE_SIZE } from "@/lib/admin/notificationRules";
import { withPagePerf } from "@/lib/perf/instrument";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Notifications | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/notifications (capability notifications.read, checked on the server). The first page is read here for the SESSION administrator only, from the events they are authorized to see
 * right now; opening or prefetching this page writes nothing and marks nothing read. A failed read renders the Retry state, never an empty inbox.
 */
async function AdminNotificationsPage() {
  const { user, permissions } = await requireAdminPage("/admin/notifications", "notifications.read");
  const initial = await listNotifications(new ObjectId(user.id), permissions, { tab: "all", type: "all", cursor: null, limit: PAGE_SIZE }).catch(() => null);
  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}><Link href="/admin/dashboard">Admin</Link> / Notifications</p>
      <h1 className={styles.heading}>Notifications</h1>
      <p className={styles.lead}>Updates for work you are authorized to review.</p>
      <AdminNotificationsWorkspace initial={initial} />
    </div>
  );
}

export default withPagePerf("page admin-notifications", AdminNotificationsPage);
