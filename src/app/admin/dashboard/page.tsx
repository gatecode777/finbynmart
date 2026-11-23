import type { Metadata } from "next";
import Link from "next/link";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth/session";
import { getAdminPermissions } from "@/lib/admin/permissions";
import { getDashboardStats, toolsFor } from "@/lib/admin/dashboard";
import { AdminSignIn } from "@/components/admin/AdminSignIn";
import styles from "@/components/admin/AdminInquiries.module.css";
import d from "./dashboard.module.css";

export const metadata: Metadata = { title: "Admin Dashboard | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The admin dashboard (Page 50). The layout already refused anyone signed in without an admin capability, and an anonymous visitor gets the admin sign-in form; this lists only the tools and the work queues THIS account may open (each page checks again).
 * Counts come from `getDashboardStats` (one definition each, database only, a failed count shows "could not be loaded", never zero).
 */
export default async function AdminHome() {
  const user = await getCurrentUser().catch(() => null);
  // nobody signed in: ask for the sign-in right here (the layout renders no shell and no data for an anonymous visitor); a signed-in non-administrator is refused by the layout
  if (!user) return <AdminSignIn />;
  const permissions = await getAdminPermissions(user.id).catch(() => []);
  const [stats, tools] = [await getDashboardStats(new ObjectId(user.id), permissions), toolsFor(permissions)];
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Admin Dashboard</h1>
      <p className={styles.lead}>Work waiting for you, and the tools your account may use.</p>

      {stats.length > 0 && (
        <section aria-labelledby="queues-heading">
          <h2 id="queues-heading" className={d.h2}>Needs attention</h2>
          <ul className={d.stats}>
            {stats.map((s) => (
              <li key={s.key} className={d.stat}>
                <Link prefetch={false} href={s.href} className={d.statLink}>
                  <span className={d.value}>{s.value === null ? "—" : s.value.toLocaleString("en-IN")}</span>
                  <span className={d.label}>{s.label}</span>
                </Link>
                <span className={d.note}>{s.value === null ? "Could not be loaded. Open the page or reload." : s.note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="tools-heading">
        <h2 id="tools-heading" className={d.h2}>Tools</h2>
        {tools.length === 0 ? <p>Your account has no admin tools yet. Ask the operator to grant a capability.</p> : (
          <ul className={d.tools}>
            {tools.map((t) => (
              <li key={t.href} className={d.tool}>
                <h3 className={d.toolTitle}><Link prefetch={false} href={t.href}>{t.title}</Link></h3>
                <p className={d.toolText}>{t.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
