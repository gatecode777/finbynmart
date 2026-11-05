import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { InquiryDetailView } from "@/components/buyer/inquiries/detail/InquiryDetailView";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { getBuyerInquiryDetail } from "@/lib/inquiries/buyerDetail";
import { REFERENCE_PATTERN } from "@/lib/inquiries/rules";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached (also set in next.config.ts), nothing about the inquiry in the metadata.
export const metadata: Metadata = { title: "Inquiry Details | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /buyer/inquiries/<reference>. The reference only names the inquiry; it is never access. The session decides: another buyer's
 * reference, an unknown one, a guest inquiry and a malformed value all end in the same 404, so references cannot be probed.
 * There is deliberately no loading.tsx above this page: it can 404 and redirect, and a loading boundary would turn those into a 200.
 */
async function BuyerInquiryDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const user = await requireBuyerPage(`/buyer/inquiries/${/^[A-Za-z0-9-]{1,40}$/.test(reference) ? reference : ""}`);
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p className={dash.welcome}>Inquiries are sent from buyer accounts.</p>
        <p><Link href="/" className={dash.viewAll}>Back to Finbyn Mart</Link></p>
      </div>
    );
  }
  if (!REFERENCE_PATTERN.test(reference) && !/^[a-f0-9]{24}$/i.test(reference)) notFound();

  const [detail, active] = await Promise.all([getBuyerInquiryDetail(user.id, reference), countActiveInquiries(user.id).catch(() => null)]);
  if (!detail) notFound();

  return (
    <BuyerShell userName={user.name} activeKey="inquiries" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / <Link href="/buyer/inquiries">My Inquiries</Link> / {detail.reference || "Earlier inquiry"}
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Inquiry Details</h1>
          <p className={dash.welcome}>View your requirement, supplier responses, quotations, messages and inquiry progress.</p>
        </div>
      </div>
      <InquiryDetailView data={detail} />
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-inquiry-detail", BuyerInquiryDetailPage);
