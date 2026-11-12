import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyerSupportTicketDetails } from "@/components/buyer/support/BuyerSupportTicketDetails";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { CONVERSATION_PAGE, TICKET_TAB_KEYS, type TicketTab } from "@/lib/support/conversationRules";
import { getBuyerTicketOverview, listBuyerMessages } from "@/lib/support/conversationService";
import { getBuyerRelatedDetails } from "@/lib/support/relatedDetails";
import { TICKET_REFERENCE_PATTERN } from "@/lib/support/ticketRules";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = {
  title: "Support Ticket Details | Supplier Portal | Finbyn Mart",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

async function SupplierTicketRoute({
  params,
  searchParams,
}: {
  params: Promise<{ ticketReference: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ticketReference } = await params;
  const raw = await searchParams;
  const { user } = await requireSupplierPage(`/supplier/support/tickets/${encodeURIComponent(ticketReference)}`);

  if (!TICKET_REFERENCE_PATTERN.test(ticketReference)) notFound();
  const overview = await getBuyerTicketOverview(user.id, ticketReference);
  if (!overview) notFound();

  const tabParam = Array.isArray(raw.tab) ? raw.tab[0] : raw.tab;
  const initialTab: TicketTab = (TICKET_TAB_KEYS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as TicketTab)
    : "conversation";

  const [messages, related] = await Promise.all([
    listBuyerMessages(user.id, ticketReference, { limit: CONVERSATION_PAGE, cursor: null }).catch(() => null),
    getBuyerRelatedDetails(user.id, ticketReference).then((r) => (r ? r.related : undefined)).catch(() => undefined),
  ]);

  return (
    <div className={dash.page}>
      <p className={dash.breadcrumb}>
        <Link href="/supplier/support">Help &amp; Support</Link> / {ticketReference}
      </p>
      <BuyerSupportTicketDetails
        initialOverview={overview}
        initialMessages={messages}
        initialRelated={related}
        buyerName={user.name}
        initialTab={initialTab}
        supportBase="/supplier/support"
      />
    </div>
  );
}

export default withPagePerf("page supplier-ticket-detail", SupplierTicketRoute);
