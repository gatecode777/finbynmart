import type { Metadata } from "next";
import Link from "next/link";
import { SupplierProfileHeader } from "@/components/supplier/profile/SupplierProfileHeader";
import { SupplierProfileFrame } from "@/components/supplier/profile/SupplierProfileFrame";
import { SupplierProfileSide } from "@/components/supplier/profile/SupplierProfileSide";
import { SupplierPersonalForm } from "@/components/supplier/profile/SupplierPersonalForm";
import { SupplierCompanyForm } from "@/components/supplier/profile/SupplierCompanyForm";
import { SupplierDocumentsPanel } from "@/components/supplier/profile/SupplierDocumentsPanel";
import { SupplierVerificationPanel } from "@/components/supplier/profile/SupplierVerificationPanel";
import { SupplierSecurityPanel } from "@/components/supplier/profile/SupplierSecurityPanel";
import dash from "@/components/supplier/dashboard/SupplierDashboard.module.css";
import { ExternalLink } from "lucide-react";
import { getCatalog } from "@/lib/catalog/data";
import { requireSupplierPage } from "@/lib/auth/guards";
import {
  getSupplierProfileOverview,
  getSupplierSecurity,
  listSupplierDocuments,
} from "@/lib/supplier/profileService";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = {
  title: "Company Profile | Supplier Portal | Finbyn Mart",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const TABS = ["company", "personal", "documents", "verification", "security"] as const;
type Tab = (typeof TABS)[number];

async function SupplierCompanyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const raw = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "company";

  const { user, context } = await requireSupplierPage(`/supplier/company?tab=${tab}`);
  // the public page of the first seller this company owns; no link when none is linked (never an invented URL)
  const firstKey = context.company.sellerKeys[0];
  const publicSlug = firstKey ? (getCatalog().sellerById.get(firstKey)?.slug ?? firstKey) : null;
  const overview = await getSupplierProfileOverview(user.id);

  if (!overview) {
    return (
      <div className={dash.page}>
        <div className={dash.accessNote} role="alert">
          <h1 className={dash.cardTitle}>Profile Unavailable</h1>
          <p className={dash.welcome}>Unable to load supplier company profile. Please try again.</p>
        </div>
      </div>
    );
  }

  const documents = tab === "documents" ? await listSupplierDocuments(user.id) : null;
  const security = tab === "security" ? await getSupplierSecurity(user.id) : null;

  return (
    <div className={dash.page}>
      <p className={dash.breadcrumb}>
        <Link href="/supplier/dashboard">Supplier</Link> / Company Profile
      </p>

      <div className={dash.headerRow}>
        <div>
          <h1 className={dash.title}>Company Profile</h1>
          <p className={dash.welcome}>
            Manage your business information and public presence.
          </p>
        </div>
        {publicSlug && (
          <Link href={`/suppliers/${encodeURIComponent(publicSlug)}`} target="_blank" rel="noreferrer" className={dash.btn}>
            <ExternalLink size={16} aria-hidden /> Preview Profile
          </Link>
        )}
      </div>

      <SupplierProfileHeader overview={overview} />

      <SupplierProfileFrame
        active={tab}
        side={
          tab === "company" || tab === "personal" || tab === "verification" ? (
            <SupplierProfileSide verification={overview.verification} nextSteps={overview.nextSteps} completion={overview.completion} />
          ) : null
        }
      >
        {tab === "company" && <SupplierCompanyForm company={overview.company} />}
        {tab === "personal" && <SupplierPersonalForm profile={overview.profile} />}
        {tab === "documents" && documents && (
          <SupplierDocumentsPanel
            documents={documents.documents}
            storageConfigured={documents.storageConfigured}
          />
        )}
        {tab === "verification" && <SupplierVerificationPanel verification={overview.verification} />}
        {tab === "security" && security && <SupplierSecurityPanel security={security} />}
      </SupplierProfileFrame>
    </div>
  );
}

export default withPagePerf("page supplier-company", SupplierCompanyPage);
