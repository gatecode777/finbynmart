import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Plus } from "lucide-react";
import { SupplierSupportPage as Workspace, type TicketParams } from "@/components/supplier/support/SupplierSupportPage";
import inq from "@/components/buyer/inquiries/Inquiries.module.css";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { requireSupplierPage } from "@/lib/auth/guards";
import { getFaqCategories, getPublishedFaqs } from "@/lib/support/faq";
import { getSupportChannels } from "@/lib/support/channels";
import { RELATED_TYPES, SUPPORT_CATEGORIES, parseTicketQuery } from "@/lib/support/ticketRules";
import { attachmentLimits, getBuyerTicketSummary, listBuyerTickets } from "@/lib/support/ticketService";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = {
  title: "Help & Support | Supplier Portal | Finbyn Mart",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function SupplierSupportRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const { user } = await requireSupplierPage("/supplier/support", { allowSuspended: true });

  const parsed = parseTicketQuery(Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, one(value)])));
  const query = parsed.ok
    ? parsed.value
    : (() => {
        const d = parseTicketQuery({});
        if (!d.ok) throw new Error("default ticket query failed");
        return d.value;
      })();

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

  const [list, summary] = await Promise.all([
    listBuyerTickets(user.id, query).catch(() => ({ tickets: [], meta: { page: 1, limit: 20, totalPages: 1, total: 0 } })),
    getBuyerTicketSummary(user.id).catch(() => null),
  ]);

  const limits = attachmentLimits();
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

  return (
    <div className={dash.page}>
      <p className={dash.breadcrumb}>
        <Link prefetch={false} href="/supplier/dashboard">Supplier</Link> / Help &amp; Support
      </p>

      <div className={dash.headerRow}>
        <div>
          <h1 className={dash.title}>Help &amp; Support</h1>
          <p className={dash.welcome}>
            Get assistance with your supplier account, raise support tickets, and view FAQs.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link prefetch={false} href="/contact-us" className={inq.btn}>
            <MessageCircle size={18} aria-hidden /> Contact Us
          </Link>
          <a href="#raise-ticket" className={inq.cta}>
            <Plus size={18} aria-hidden /> Raise a Ticket
          </a>
        </div>
      </div>

      <Workspace
        initial={list}
        initialParams={params}
        initialSummary={summary}
        config={{
          categories: SUPPORT_CATEGORIES,
          relatedTypes: RELATED_TYPES,
          attachments: { maxFiles: limits.maxFiles, maxMb: limits.maxMb, types: limits.types },
        }}
        faqs={getPublishedFaqs().map(({ id, category, question, answer }) => ({ id, category, question, answer }))}
        faqCategories={getFaqCategories()}
        channels={getSupportChannels()}
        today={today}
        renderedAt={Date.now()}
      />
    </div>
  );
}

export default withPagePerf("page supplier-support", SupplierSupportRoute);
