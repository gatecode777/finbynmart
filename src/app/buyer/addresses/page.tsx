import type { Metadata } from "next";
import Link from "next/link";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { AddressBook } from "@/components/buyer/addresses/AddressBook";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { listAddresses } from "@/lib/buyer/addresses";
import { parseAddressQuery } from "@/lib/buyer/addressRules";
import { getBuyerCompany } from "@/lib/buyer/profile";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached (also set in next.config.ts), no addresses in the metadata.
export const metadata: Metadata = { title: "Address Book | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** /buyer/addresses?type=&q=. Identity from the session on the server; the first list is read here, later changes go through /api/buyer/addresses. */
async function BuyerAddressesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const query = await searchParams;
  const user = await requireBuyerPage("/buyer/addresses");
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p className={dash.welcome}>The address book is for buyer accounts.</p>
        <p><Link href="/" className={dash.viewAll}>Back to Finbyn Mart</Link></p>
      </div>
    );
  }
  // an invalid type or search in the address falls back to the full list (the API itself rejects them with 400)
  const parsed = parseAddressQuery({ type: one(query.type), q: one(query.q) });
  const filter = parsed.ok ? parsed.value : { type: "all" as const, q: "", page: 1, limit: 50 };
  const [list, company, active] = await Promise.all([listAddresses(user.id, filter), getBuyerCompany(user.id), countActiveInquiries(user.id).catch(() => null)]);

  return (
    <BuyerShell userName={user.name} activeKey="address-book" activeInquiries={active}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / Address Book
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Address Book</h1>
          <p className={dash.welcome}>Manage your business, billing and delivery addresses for inquiries, quotations and orders.</p>
        </div>
      </div>
      <AddressBook initial={list} initialType={filter.type} initialQuery={filter.q} hasCompany={Boolean(company)} />
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-addresses", BuyerAddressesPage);
