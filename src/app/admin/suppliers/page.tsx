import type { Metadata } from "next";
import Link from "next/link";
import { AdminSuppliersWorkspace } from "@/components/admin/AdminSuppliersWorkspace";
import { requireAdminPage } from "@/lib/auth/guards";
import { listCompanies } from "@/lib/admin/supplierManagement";
import { supplierCapsOf } from "@/lib/admin/supplierApi";
import { COMPANY_ID_RE, parseListState, toListParams } from "@/lib/admin/supplierRules";
import { withPagePerf } from "@/lib/perf/instrument";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Supplier Management | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

async function AdminSuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const flat = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") flat.set(k, v);
  const state = parseListState(flat);
  const review = COMPANY_ID_RE.test(flat.get("review") ?? "") ? (flat.get("review") as string) : null;
  // the requested page, its validated filter state and an open review survive sign-in (the sign-in route validates the path again)
  const qs = toListParams(state);
  if (review) qs.set("review", review);
  const next = `/admin/suppliers${qs.size ? `?${qs.toString().replace(/\+/g, "%20")}` : ""}`;
  const { permissions } = await requireAdminPage(next, "suppliers.read");
  const caps = supplierCapsOf(permissions);
  const initial = await listCompanies(state, caps, undefined, true);
  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}><Link href="/admin/dashboard">Admin</Link> / Suppliers</p>
      <h1 className={styles.heading}>Supplier Management</h1>
      <p className={styles.lead}>Review supplier companies, catalogue links and access status.</p>
      <AdminSuppliersWorkspace initial={initial} state={state} initialReview={review} caps={caps} canExport={permissions.includes("suppliers.export")} />
    </div>
  );
}

export default withPagePerf("page admin-suppliers", AdminSuppliersPage);
