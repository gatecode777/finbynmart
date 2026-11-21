import type { Metadata } from "next";
import Link from "next/link";
import { AdminReportsWorkspace } from "@/components/admin/AdminReportsWorkspace";
import { requireAnyAdminPage } from "@/lib/auth/guards";
import { runReport } from "@/lib/admin/reportService";
import { CAPABILITIES, defaultRange, parseRange, permittedReports, todayInReportZone, validateQuery } from "@/lib/admin/reportRules";
import { withPagePerf } from "@/lib/perf/instrument";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Reports | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/reports?report=&from=&to= (at least one reports capability, checked on the server; only the permitted report types are offered). Read-only. The validated state is in the URL and
 * survives sign-in. A failed read renders the Retry state, never zeros; an invalid range is shown inline and the defaults are used for the first load.
 */
async function AdminReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const flat = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") flat.set(k, v);
  const asked = ["report", "from", "to"].filter((k) => flat.get(k)).map((k) => `${k}=${encodeURIComponent(flat.get(k) as string)}`).join("&");
  const { permissions } = await requireAnyAdminPage(`/admin/reports${asked ? `?${asked}` : ""}`, CAPABILITIES);
  const allowed = permittedReports(permissions);
  const validated = validateQuery((k) => flat.get(k), flat.keys(), allowed[0].key);
  const requested = validated.ok ? validated.value : null;
  const report = requested && allowed.some((r) => r.key === requested.report) ? requested.report : allowed[0].key;
  const d = defaultRange();
  const from = requested?.from ?? d.startDay, to = requested?.to ?? d.endDay;
  const range = parseRange(from, to);
  const initialError = !validated.ok ? Object.values(validated.fields)[0] : requested && !allowed.some((r) => r.key === requested.report) ? "You do not have access to that report." : null;
  const initial = range.ok && !initialError ? await runReport(report, range.range).catch(() => null) : null;
  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}><Link href="/admin/dashboard">Admin</Link> / Reports</p>
      <h1 className={styles.heading}>Reports</h1>
      <p className={styles.lead}>Review marketplace activity for a selected period.</p>
      <AdminReportsWorkspace initial={initial} permitted={allowed.map((r) => ({ key: r.key, label: r.label }))} state={{ report, from: initialError ? d.startDay : from, to: initialError ? d.endDay : to }} today={todayInReportZone()} initialError={initialError} failed={!initial && !initialError && range.ok} />
    </div>
  );
}

export default withPagePerf("page admin-reports", AdminReportsPage);
