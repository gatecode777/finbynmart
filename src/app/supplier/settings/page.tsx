import type { Metadata } from "next";
import Link from "next/link";
import { SupplierPreferencesForm } from "@/components/supplier/settings/SupplierPreferencesForm";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { getSupplierSettingsView } from "@/lib/supplier/settingsService";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = {
  title: "Settings | Supplier Portal | Finbyn Mart",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

async function SupplierSettingsPage() {
  const { user } = await requireSupplierPage("/supplier/settings");

  const settings = await getSupplierSettingsView(user.id);

  return (
    <div className={dash.page}>
      <p className={dash.breadcrumb}>
        <Link prefetch={false} href="/supplier/dashboard">Supplier</Link> / Settings
      </p>

      <div className={dash.headerRow}>
        <div>
          <h1 className={dash.title}>Supplier Settings</h1>
          <p className={dash.welcome}>
            Manage your notification preferences and account security.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "900px" }}>
        <SupplierPreferencesForm initial={settings.settings} revision={settings.revision} />
        <section className={dash.card} aria-labelledby="settings-security-title">
          <h2 id="settings-security-title" className={dash.cardTitle}>Account security</h2>
          <p className={dash.legendNote}>Change your password, review where you are signed in and sign out other devices.</p>
          <p style={{ marginTop: "0.75rem" }}>
            <Link prefetch={false} href="/supplier/security" className={dash.viewAll}>Open Account Security</Link>
          </p>
        </section>
      </div>
    </div>
  );
}

export default withPagePerf("page supplier-settings", SupplierSettingsPage);
