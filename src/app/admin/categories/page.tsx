import type { Metadata } from "next";
import Link from "next/link";
import { AdminCategoriesWorkspace } from "@/components/admin/AdminCategoriesWorkspace";
import { requireAdminPage } from "@/lib/auth/guards";
import { listCategories } from "@/lib/admin/categoryManagement";
import { categoryCapsOf } from "@/lib/admin/categoryApi";
import { REF_RE, parseState, toParams } from "@/lib/admin/categoryRules";
import { ensureApproved } from "@/lib/catalog/approvedProducts";
import { withPagePerf } from "@/lib/perf/instrument";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Category Management | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

async function AdminCategoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const flat = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") flat.set(k, v);
  const state = parseState(flat);
  const review = REF_RE.test(flat.get("review") ?? "") ? (flat.get("review") as string) : null;
  const qs = toParams(state);
  if (review) qs.set("review", review);
  // the requested page, its validated filters and an open review survive sign-in (the sign-in route validates the path again)
  const next = `/admin/categories${qs.size ? `?${qs.toString().replace(/\+/g, "%20")}` : ""}`;
  const { permissions } = await requireAdminPage(next, "categories.read");
  await ensureApproved();
  const caps = categoryCapsOf(permissions);
  const initial = await listCategories(state, caps);
  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}><Link prefetch={false} href="/admin/dashboard">Admin</Link> / Categories</p>
      <h1 className={styles.heading}>Category Management</h1>
      <p className={styles.lead}>Manage category hierarchy and marketplace availability.</p>
      <AdminCategoriesWorkspace initial={initial} state={state} initialReview={review} caps={caps} />
    </div>
  );
}

export default withPagePerf("page admin-categories", AdminCategoriesPage);
