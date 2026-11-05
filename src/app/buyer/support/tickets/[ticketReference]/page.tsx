import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { SupportTicketDetailView } from "@/components/buyer/support/SupportTicketDetailView";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { TICKET_REFERENCE_PATTERN } from "@/lib/support/ticketRules";
import { getBuyerTicketDetail } from "@/lib/support/ticketService";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached, no ticket data in the metadata.
export const metadata: Metadata = { title: "Support Ticket | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /buyer/support/tickets/<ticketReference>. The reference only names the ticket; the session decides. Another buyer's, an unknown and a
 * malformed reference all end in the same 404. No loading.tsx above this page: it can 404 and redirect.
 */
async function BuyerTicketRoute({ params }: { params: Promise<{ ticketReference: string }> }) {
  const { ticketReference } = await params;
  const user = await requireBuyerPage(`/buyer/support/tickets/${TICKET_REFERENCE_PATTERN.test(ticketReference) ? ticketReference : ""}`);
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p><Link href="/contact-us" className={dash.viewAll}>Contact Us</Link></p>
      </div>
    );
  }
  if (!TICKET_REFERENCE_PATTERN.test(ticketReference)) notFound();
  const [detail, active] = await Promise.all([getBuyerTicketDetail(user.id, ticketReference), countActiveInquiries(user.id).catch(() => null)]);
  if (!detail) notFound();

  return (
    <BuyerShell userName={user.name} activeKey="support" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / <Link href="/buyer/support">Help &amp; Support</Link> / {detail.reference}
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Support Ticket</h1>
          <p className={dash.welcome}>What you reported, its status and everything recorded about it.</p>
        </div>
      </div>
      <SupportTicketDetailView data={detail} />
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-support-ticket", BuyerTicketRoute);
