import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Plus } from "lucide-react";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { BuyerSupportPage as Workspace, type TicketParams } from "@/components/buyer/support/BuyerSupportPage";
import inq from "@/components/buyer/inquiries/Inquiries.module.css";
import support from "@/components/buyer/support/Support.module.css";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { getFaqCategories, getPublishedFaqs } from "@/lib/support/faq";
import { getSupportChannels } from "@/lib/support/channels";
import { RELATED_TYPES, SUPPORT_CATEGORIES, parseTicketQuery } from "@/lib/support/ticketRules";
import { attachmentLimits, getBuyerTicketSummary, listBuyerTickets } from "@/lib/support/ticketService";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached (also set in next.config.ts), no ticket data in the metadata.
export const metadata: Metadata = { title: "Help & Support | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * /buyer/support?q=&status=&categoryId=&relatedEntityType=&range=&dateFrom=&dateTo=&sort=&page=
 * Identity from the session on the server; the first list and the numbers are read here (each on its own, so one failing does not take
 * the page down), the FAQs and channels come from their own sources, and every later change goes through /api/buyer/support/*.
 * An invalid choice in the address falls back to the defaults.
 */
async function BuyerSupportRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const user = await requireBuyerPage("/buyer/support");
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p className={dash.welcome}>Support tickets belong to buyer accounts. Use the Contact Us form instead.</p>
        <p><Link href="/contact-us" className={dash.viewAll}>Contact Us</Link></p>
      </div>
    );
  }

  const parsed = parseTicketQuery(Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, one(value)])));
  const query = parsed.ok ? parsed.value : (() => { const d = parseTicketQuery({}); if (!d.ok) throw new Error("default ticket query failed"); return d.value; })();
  const params: TicketParams = {
    q: query.q,
    status: query.status,
    categoryId: query.categoryId ?? "",
    relatedEntityType: query.relatedEntityType ?? "",
    range: query.window?.key ?? "",
    dateFrom: query.window?.key === "custom" ? query.window.startDate : "",
    dateTo: query.window?.key === "custom" ? query.window.endDate : "",
    sort: query.sort,
    page: query.page,
  };
  const [list, summary, active] = await Promise.all([listBuyerTickets(user.id, query).catch(() => null), getBuyerTicketSummary(user.id).catch(() => null), countActiveInquiries(user.id).catch(() => null)]);
  const limits = attachmentLimits();
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

  return (
    <BuyerShell userName={user.name} activeKey="support" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / Help &amp; Support
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Help &amp; Support</h1>
          <p className={dash.welcome}>Get help, raise a support ticket, track its status, or find answers to common questions.</p>
        </div>
        <div className={support.headerActions}>
          <Link href="/contact-us" className={inq.btn}><MessageCircle size={18} aria-hidden /> Contact Support</Link>
          <a href="#raise-ticket" className={inq.cta}><Plus size={18} aria-hidden /> Raise a New Ticket</a>
        </div>
      </div>
      {list ? (
        <Workspace
          initial={list}
          initialParams={params}
          initialSummary={summary}
          config={{ categories: SUPPORT_CATEGORIES, relatedTypes: RELATED_TYPES, attachments: { maxFiles: limits.maxFiles, maxMb: limits.maxMb, types: limits.types } }}
          faqs={getPublishedFaqs().map(({ id, category, question, answer }) => ({ id, category, question, answer }))}
          faqCategories={getFaqCategories()}
          channels={getSupportChannels()}
          today={today}
          renderedAt={Date.now()}
        />
      ) : (
        <div className={dash.accessNote} role="alert">
          <h2 className={dash.cardTitle}>Your tickets could not be loaded</h2>
          <p className={dash.welcome}>Nothing was changed. Please try again in a moment.</p>
          <p><Link href="/buyer/support" className={dash.viewAll}>Try again</Link></p>
        </div>
      )}
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-support", BuyerSupportRoute);
