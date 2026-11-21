import type { Metadata } from "next";
import Link from "next/link";
import { CompanyLinksWorkspace } from "@/components/admin/CompanyLinksWorkspace";
import { ObjectId } from "mongodb";
import { requireAdminPage } from "@/lib/auth/guards";
import { getDb } from "@/lib/db/mongo";
import { supplierCompanies } from "@/lib/supplier/company";
import styles from "@/components/admin/AdminInquiries.module.css";

export const metadata: Metadata = { title: "Company Links | Admin Portal | Finbyn Mart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** `?company=<24-hex id>` (from Supplier Management) only pre-fills the company search with that company's name; it grants nothing and is ignored unless it is a well-formed id. */
async function startingQuery(raw: string | string[] | undefined): Promise<string> {
  const id = typeof raw === "string" && /^[a-f0-9]{24}$/.test(raw) ? raw : null;
  if (!id) return "";
  const company = await (await supplierCompanies()).findOne({ _id: new ObjectId(id) }, { projection: { ownerUserId: 1 } });
  if (!company) return "";
  const owner = await (await getDb()).collection<{ supplier?: { businessName?: string } }>("users").findOne({ _id: company.ownerUserId }, { projection: { "supplier.businessName": 1 } });
  return (owner?.supplier?.businessName ?? "").slice(0, 60);
}

export default async function CompanyLinksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const company = typeof sp.company === "string" && /^[a-f0-9]{24}$/.test(sp.company) ? sp.company : null;
  await requireAdminPage(`/admin/company-links${company ? `?company=${company}` : ""}`, "sellers.map");
  const initialQuery = await startingQuery(company ?? undefined);
  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}><Link href="/admin/dashboard">Admin</Link> / Company links</p>
      <h1 className={styles.heading}>Company Links</h1>
      <p className={styles.lead}>Link a catalogue seller to the supplier company that owns it, after reviewing ownership evidence.</p>
      <CompanyLinksWorkspace initialQuery={initialQuery} />
    </div>
  );
}
