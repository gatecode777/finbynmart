import type { Metadata } from "next";
import Link from "next/link";
import { AdminVerificationWorkspace } from "@/components/admin/AdminVerificationWorkspace";
import { requireAdminPage } from "@/lib/auth/guards";
import { listSubmissions } from "@/lib/verification/service";
import { verificationCapsOf } from "@/lib/verification/caps";
import { REFERENCE_RE, parseQueueState, toQueueParams, EMPTY_QUEUE } from "@/lib/verification/rules";
import { withPagePerf } from "@/lib/perf/instrument";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Supplier Verification | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

async function AdminVerificationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const get = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : null);
  const parsed = parseQueueState(get);
  // an invalid filter typed into the URL falls back to the defaults instead of failing the page
  const state = parsed.ok ? parsed.state : EMPTY_QUEUE;
  const review = REFERENCE_RE.test(get("review") ?? "") ? (get("review") as string) : null;
  const qs = toQueueParams(state);
  if (review) qs.set("review", review);
  // the requested page, its validated filters and an open review survive sign-in (the sign-in route validates the path again)
  const next = `/admin/verification${qs.size ? `?${qs.toString().replace(/\+/g, "%20")}` : ""}`;
  const { permissions } = await requireAdminPage(next, "verification.read");
  const caps = verificationCapsOf(permissions);
  const initial = await listSubmissions(state);
  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}><Link href="/admin/dashboard">Admin</Link> / Supplier Verification</p>
      <h1 className={styles.heading}>Supplier Verification</h1>
      <p className={styles.lead}>Review submitted business evidence and record decisions.</p>
      <AdminVerificationWorkspace initial={initial} state={state} initialReview={review} caps={caps} />
    </div>
  );
}

export default withPagePerf("page admin-verification", AdminVerificationPage);
