import type { Metadata } from "next";
import Link from "next/link";
import { AdminBuyersWorkspace } from "@/components/admin/AdminBuyersWorkspace";
import { requireAdminPage } from "@/lib/auth/guards";
import { listBuyers } from "@/lib/admin/buyerManagement";
import { BUYER_ID_RE, parseListState, toListParams } from "@/lib/admin/buyerRules";
import { withPagePerf } from "@/lib/perf/instrument";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Buyer Management | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /admin/buyers?q=&status=&page=&review= (capability buyers.read, checked on the server before any buyer data is read). The filter state and an open buyer survive sign-in; only the name or
 * reference text, the status and the page are in the URL. A failed read renders the Retry state, never an empty list.
 */
async function AdminBuyersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const flat = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") flat.set(k, v);
  const state = parseListState(flat);
  const review = BUYER_ID_RE.test(flat.get("review") ?? "") ? (flat.get("review") as string) : null;
  const qs = toListParams(state);
  if (review) qs.set("review", review);
  const next = `/admin/buyers${qs.size ? `?${qs.toString().replace(/\+/g, "%20")}` : ""}`;
  const { permissions } = await requireAdminPage(next, "buyers.read");
  const initial = await listBuyers(state).catch(() => null);
  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}><Link href="/admin/dashboard">Admin</Link> / Buyers</p>
      <h1 className={styles.heading}>Buyer Management</h1>
      <p className={styles.lead}>Search buyer accounts and review account details.</p>
      <AdminBuyersWorkspace initial={initial} state={state} initialReview={review} canManage={permissions.includes("buyers.suspend") || permissions.includes("buyers.reactivate")} />
    </div>
  );
}

export default withPagePerf("page admin-buyers", AdminBuyersPage);
