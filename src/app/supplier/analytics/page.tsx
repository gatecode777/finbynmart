import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SupplierAnalyticsWorkspace } from "@/components/supplier/analytics/SupplierAnalyticsWorkspace";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { buildReport } from "@/lib/supplier/analyticsService";
import { defaultRange, parseRange } from "@/lib/supplier/analyticsRules";

export const metadata: Metadata = { title: "Analytics & Reports | Supplier Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SupplierAnalyticsPage() {
  const { context } = await requireSupplierPage("/supplier/analytics");
  if (!context.permissions.viewAnalytics) redirect("/forbidden?portal=supplier");
  const d = defaultRange();
  const parsed = parseRange(d.startDay, d.endDay);
  if (!parsed.ok) throw new Error("default range invalid");
  const initial = await buildReport(context, parsed.range, null);

  return (
    <div className={dash.page}>
      <p className={dash.breadcrumb}>
        <Link href="/supplier/dashboard">Supplier</Link> / Analytics &amp; Reports
      </p>
      <h1 className={dash.title}>Analytics &amp; Reports</h1>
      <p className={dash.welcome}>Understand your sourcing and order activity.</p>
      <SupplierAnalyticsWorkspace initial={initial} />
    </div>
  );
}
