import type { Metadata } from "next";
import Link from "next/link";
import { BuyerShell } from "@/components/buyer/BuyerShell";
import { ProfileHeader } from "@/components/buyer/profile/ProfileHeader";
import { ProfileFrame } from "@/components/buyer/profile/ProfileFrame";
import { ProfileSide } from "@/components/buyer/profile/ProfileSide";
import { PersonalForm } from "@/components/buyer/profile/PersonalForm";
import { CompanyForm } from "@/components/buyer/profile/CompanyForm";
import { DocumentsPanel } from "@/components/buyer/profile/DocumentsPanel";
import { VerificationPanel } from "@/components/buyer/profile/VerificationPanel";
import { SecurityPanel } from "@/components/buyer/profile/SecurityPanel";
import dash from "@/components/buyer/Dashboard.module.css";
import { requireBuyerPage } from "@/lib/auth/guards";
import { getBuyerProfileOverview, getBuyerSecurity, listBuyerDocuments } from "@/lib/buyer/profile";
import { countActiveInquiries } from "@/lib/buyer/dashboard";
import { withPagePerf } from "@/lib/perf/instrument";

// Private page: noindex, never cached (also set in next.config.ts), no personal data in the metadata.
export const metadata: Metadata = { title: "Profile & Company | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const TABS = ["personal", "company", "documents", "verification", "security"] as const;
type Tab = (typeof TABS)[number];

/**
 * /buyer/profile?tab=personal|company|documents|verification|security. Identity comes from the session on the server; only
 * the data of the open tab (plus the always-visible summary) is read. The forms are client components that talk to the
 * /api/buyer/* routes.
 */
async function BuyerProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const raw = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "personal";
  const user = await requireBuyerPage(`/buyer/profile?tab=${tab}`);
  if (user === "NOT_A_BUYER") {
    return (
      <div className={dash.accessNote} role="alert">
        <h1 className={dash.title}>Buyer accounts only</h1>
        <p className={dash.welcome}>This page is for buyer accounts.</p>
        <p><Link href="/" className={dash.viewAll}>Back to Finbyn Mart</Link></p>
      </div>
    );
  }

  const overview = await getBuyerProfileOverview(user.id);
  if (!overview) {
    return (
      <BuyerShell userName={user.name} activeKey="profile" activeInquiries={null}>
        <div className={dash.accessNote} role="alert">
          <h1 className={dash.title}>Profile unavailable</h1>
          <p className={dash.welcome}>Your profile could not be loaded just now. Please try again.</p>
        </div>
      </BuyerShell>
    );
  }
  const documents = tab === "documents" ? await listBuyerDocuments(user.id) : null;
  const security = tab === "security" ? await getBuyerSecurity(user.id) : null;
  const activeInquiries = await countActiveInquiries(user.id).catch(() => null);

  return (
    <BuyerShell userName={user.name} activeKey="profile" activeInquiries={activeInquiries}>
      <p className={dash.breadcrumb}>
        <Link href="/">Home</Link> / <Link href="/buyer/dashboard">Buyer Dashboard</Link> / Profile &amp; Company
      </p>
      <div className={dash.pageHeader}>
        <div>
          <h1 className={dash.title}>Profile &amp; Company</h1>
          <p className={dash.welcome}>Manage your personal details, company information, verification and account security.</p>
        </div>
      </div>
      <ProfileHeader overview={overview} />
      <ProfileFrame active={tab} side={tab === "personal" || tab === "verification" ? <ProfileSide verification={overview.verification} nextSteps={overview.nextSteps} /> : null}>
        {tab === "personal" && <PersonalForm profile={overview.profile} />}
        {tab === "company" && <CompanyForm company={overview.company} suggestedName={overview.profile.companyName ?? ""} />}
        {tab === "documents" && documents && <DocumentsPanel hasCompany={documents.hasCompany} storageConfigured={documents.storageConfigured} documents={documents.documents} />}
        {tab === "verification" && <VerificationPanel verification={overview.verification} />}
        {tab === "security" && security && <SecurityPanel security={security} />}
      </ProfileFrame>
    </BuyerShell>
  );
}

export default withPagePerf("page buyer-profile", BuyerProfilePage);
