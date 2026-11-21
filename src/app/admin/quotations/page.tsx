import type { Metadata } from "next";
import Link from "next/link";
import { AdminQuotationsWorkspace } from "@/components/admin/AdminQuotationsWorkspace";
import { requireAdminPage } from "@/lib/auth/guards";
import { listAdminQuotations } from "@/lib/admin/quotationManagement";
import { QUOTATION_REF_RE, parseListState, toListParams } from "@/lib/admin/quotationAdminRules";
import { withPagePerf } from "@/lib/perf/instrument";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Quotation Management | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/quotations?q=&status=&page=&review= (capability quotations.read, checked on the server before any quotation is read). Read-only. The filter state and an open quotation survive
 * sign-in. A failed read renders the Retry state, never an empty list.
 */
async function AdminQuotationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const flat = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") flat.set(k, v);
  const state = parseListState(flat);
  const review = QUOTATION_REF_RE.test(flat.get("review") ?? "") ? (flat.get("review") as string) : null;
  const qs = toListParams(state);
  if (review) qs.set("review", review);
  const next = `/admin/quotations${qs.size ? `?${qs.toString().replace(/\+/g, "%20")}` : ""}`;
  await requireAdminPage(next, "quotations.read");
  const initial = await listAdminQuotations(state).catch(() => null);
  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}><Link href="/admin/dashboard">Admin</Link> / Quotations</p>
      <h1 className={styles.heading}>Quotation Management</h1>
      <p className={styles.lead}>Review submitted supplier quotations and recorded decisions.</p>
      <AdminQuotationsWorkspace initial={initial} state={state} initialReview={review} />
    </div>
  );
}

export default withPagePerf("page admin-quotations", AdminQuotationsPage);
