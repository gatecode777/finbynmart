import type { Metadata } from "next";
import Link from "next/link";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { SettingsFrame, type SettingsTab } from "@/components/buyer/settings/SettingsFrame";
import { PreferencesForm } from "@/components/buyer/settings/PreferencesForm";
import { SignOutEverywhere } from "@/components/buyer/settings/SignOutEverywhere";
import { PrivacyAndMore, SecurityNotAvailable } from "@/components/buyer/settings/NotAvailable";
import { NotificationCenter } from "@/components/buyer/settings/NotificationCenter";
import { SecurityPanel } from "@/components/buyer/profile/SecurityPanel";
import settingsStyles from "@/components/buyer/settings/Settings.module.css";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { countUnread, listNotifications } from "@/lib/buyer/notifications";
import { parseNotificationQuery } from "@/lib/buyer/notificationRules";
import { getBuyerSecurity } from "@/lib/buyer/profile";
import { getBuyerSettings } from "@/lib/buyer/settings";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached (also set in next.config.ts), no personal data in the metadata.
export const metadata: Metadata = { title: "Settings & Notifications | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * /buyer/settings?tab=settings|notifications (one page, two sections; the sidebar item stays highlighted on both). Identity comes
 * from the session on the server; only the open section's data is read, later changes go through /api/buyer/settings and
 * /api/buyer/notifications.
 */
async function BuyerSettingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const query = await searchParams;
  const tab: SettingsTab = one(query.tab) === "notifications" ? "notifications" : "settings";
  const user = await requireBuyerPage(`/buyer/settings?tab=${tab}`);
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p className={dash.welcome}>Settings and notifications are for buyer accounts.</p>
        <p><Link href="/" className={dash.viewAll}>Back to Finbyn Mart</Link></p>
      </div>
    );
  }

  // an invalid filter in the address falls back to the defaults (the API itself rejects it with 400)
  const parsed = parseNotificationQuery({ category: one(query.category), status: one(query.status), page: one(query.page) });
  const filter = parsed.ok ? parsed.value : { category: "all" as const, status: "all" as const, page: 1, limit: 20 };
  const [active, unread, settings, security, list] = await Promise.all([
    countActiveInquiries(user.id).catch(() => null),
    countUnread(user.id).catch(() => null),
    tab === "settings" ? getBuyerSettings(user.id) : null,
    tab === "settings" ? getBuyerSecurity(user.id) : null,
    tab === "notifications" ? listNotifications(user.id, filter) : null,
  ]);

  return (
    <BuyerShell userName={user.name} activeKey="settings" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / Settings &amp; Notifications
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Settings &amp; Notifications</h1>
          <p className={dash.welcome}>Manage your account security, notification preferences and the notices sent to your account.</p>
        </div>
      </div>
      <SettingsFrame active={tab} unread={unread}>
        {tab === "settings" && settings && security && (
          <div className={settingsStyles.stack}>
            <SecurityPanel security={security} />
            <SignOutEverywhere />
            <SecurityNotAvailable />
            <PreferencesForm initial={settings} />
            <PrivacyAndMore />
          </div>
        )}
        {tab === "settings" && (!settings || !security) && (
          <div className={dash.accessNote} role="alert">
            <p className={dash.welcome}>Your settings could not be loaded just now. Please try again.</p>
          </div>
        )}
        {tab === "notifications" && list && <NotificationCenter initial={list} initialQuery={filter} />}
      </SettingsFrame>
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-settings", BuyerSettingsPage);
