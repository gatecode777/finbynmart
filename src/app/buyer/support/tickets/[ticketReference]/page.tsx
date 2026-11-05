import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { BuyerSupportTicketDetails } from "@/components/buyer/support/BuyerSupportTicketDetails";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { CONVERSATION_PAGE, TICKET_TAB_KEYS, type TicketTab } from "@/lib/support/conversationRules";
import { getBuyerTicketOverview, listBuyerMessages } from "@/lib/support/conversationService";
import { getBuyerRelatedDetails } from "@/lib/support/relatedDetails";
import { TICKET_REFERENCE_PATTERN } from "@/lib/support/ticketRules";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached, no ticket data in the metadata.
export const metadata: Metadata = { title: "Support Ticket Details | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * /buyer/support/tickets/<ticketReference>?tab=conversation|timeline|attachments|related. The reference only names the ticket; the session
 * decides. Another buyer's, an unknown and a malformed reference all end in the same 404. The ticket decides whether the page exists;
 * the first page of the conversation and the related record are read next, each on its own, so a failure of either leaves the ticket
 * and the other tabs working. No loading.tsx above this page: it can 404 and redirect.
 */
async function BuyerTicketRoute({ params, searchParams }: { params: Promise<{ ticketReference: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ticketReference } = await params;
  const raw = await searchParams;
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
  const overview = await getBuyerTicketOverview(user.id, ticketReference);
  if (!overview) notFound();

  const [messages, related, active] = await Promise.all([
    listBuyerMessages(user.id, ticketReference, { limit: CONVERSATION_PAGE, cursor: null }).catch(() => null),
    getBuyerRelatedDetails(user.id, ticketReference).then((r) => (r ? r.related : undefined)).catch(() => undefined),
    countActiveInquiries(user.id).catch(() => null),
  ]);
  const wanted = Array.isArray(raw.tab) ? raw.tab[0] : raw.tab;
  const tab: TicketTab = TICKET_TAB_KEYS.find((k) => k === wanted) ?? "conversation";

  return (
    <BuyerShell userName={user.name} activeKey="support" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / <Link href="/buyer/support">Help &amp; Support</Link> / Ticket Details / {overview.reference}
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Support Ticket Details</h1>
          <p className={dash.welcome}>View the complete conversation, updates and resolution for this support ticket.</p>
        </div>
      </div>
      <BuyerSupportTicketDetails initialOverview={overview} initialMessages={messages} initialRelated={related} buyerName={user.name} initialTab={tab} />
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-support-ticket", BuyerTicketRoute);
