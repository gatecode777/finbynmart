import type { Metadata } from "next";
import Link from "next/link";
import { SupplierDashboard } from "@/components/supplier/dashboard/SupplierDashboard";
import styles from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { parseDashboardRange } from "@/lib/buyer/dateRange";
import { getSupplierDashboard } from "@/lib/supplier/dashboardService";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = { title: "Supplier Dashboard | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * /supplier/dashboard?range=7d|30d|90d|this-month|previous-month|custom. The layout already proved a supplier with an active company; the company
 * used here is the one the session's account owns (read again for this page's data), never anything from the address. An invalid period in the
 * address falls back to the default (the API itself rejects it with 400). The first answer is read here; the chart loads from its own route.
 */
async function SupplierDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const { context } = await requireSupplierPage("/supplier/dashboard");
  const parsed = parseDashboardRange({ range: one(raw.range), startDate: one(raw.startDate), endDate: one(raw.endDate) });
  const range = parsed.ok ? parsed.value : (() => { const d = parseDashboardRange({}); if (!d.ok) throw new Error("default range failed"); return d.value; })();
  const data = await getSupplierDashboard(context, range);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}>
        <Link href="/">Home</Link> / Supplier Portal / Dashboard
      </p>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Supplier Dashboard</h1>
          <p className={styles.welcome}>Welcome back. Here is your business overview and supplier activity.</p>
        </div>
      </div>
      <SupplierDashboard initial={data} range={{ key: range.key, label: range.label, startDate: range.startDate, endDate: range.endDate, today }} />
    </div>
  );
}

export default withPagePerf("page supplier-dashboard", SupplierDashboardPage);
