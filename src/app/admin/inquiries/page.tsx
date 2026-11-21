import type { Metadata } from "next";
import Link from "next/link";
import { AdminInquiriesWorkspace } from "@/components/admin/AdminInquiriesWorkspace";
import { requireAdminPage } from "@/lib/auth/guards";
import { listAdminInquiries } from "@/lib/admin/inquiryService";
import { capsOf } from "@/lib/admin/inquiryApi";
import { REFERENCE_RE, parseListState, toListParams } from "@/lib/admin/inquiryRules";
import { defaultRange, parseRange } from "@/lib/supplier/analyticsRules";
import { withPagePerf } from "@/lib/perf/instrument";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Inquiry Management | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** A same-site path for the sign-in `next`: the page, its validated filter state and an open review. The sign-in route validates it again (`safeNext`). */
const returnPath = (qs: URLSearchParams) => `/admin/inquiries${qs.size ? `?${qs.toString().replace(/\+/g, "%20")}` : ""}`;

async function AdminInquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const flat = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") flat.set(k, v);
  const d = defaultRange();
  const parsedState = parseListState(flat, { start: d.startDay, end: d.endDay });
  // an invalid or future date typed into the URL falls back to the default range instead of failing the page
  const range = parseRange(parsedState.start, parsedState.end);
  const state = range.ok ? parsedState : { ...parsedState, start: d.startDay, end: d.endDay };
  const review = REFERENCE_RE.test(flat.get("review") ?? "") ? (flat.get("review") as string) : null;
  const qs = toListParams(state, { start: d.startDay, end: d.endDay });
  if (review) qs.set("review", review);

  const { permissions } = await requireAdminPage(returnPath(qs), "inquiries.read");
  const parsed = parseRange(state.start, state.end);
  if (!parsed.ok) throw new Error("default range invalid");
  const initial = await listAdminInquiries({ q: state.q || undefined, source: state.source, group: state.group, dist: state.dist, range: parsed.range, page: state.page });

  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}>
        <Link href="/admin/dashboard">Admin</Link> / Inquiries
      </p>
      <h1 className={styles.heading}>Inquiry Management</h1>
      <p className={styles.lead}>Review requirements, routing and administrative activity.</p>
      <AdminInquiriesWorkspace initial={initial} defaults={{ startDay: d.startDay, endDay: d.endDay }} state={state} initialReview={review} caps={capsOf(permissions)} canExport={permissions.includes("inquiries.export")} />
    </div>
  );
}

export default withPagePerf("page admin-inquiries", AdminInquiriesPage);
