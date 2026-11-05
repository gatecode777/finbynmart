import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { PageBody } from "@/components/ui/PageBody";
import { RequirementForm } from "@/components/homepage/RequirementBanner/RequirementForm";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = {
  title: "Post Your Requirement | Finbyn Mart",
  description: "Tell suppliers what you need and compare quotes.",
};

async function PostRequirementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.product) ? sp.product[0] : sp.product;
  const defaultProduct = (raw ?? "").slice(0, 120);
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.slice(0, 80);
  const category = one(sp.category);
  const subcategory = one(sp.subcategory);
  // From "Request Bulk Price" on a product page: a whole number and a unit, both re-validated by the server.
  const rawQuantity = one(sp.quantity) ?? "";
  const defaultQuantity = /^\d{1,7}$/.test(rawQuantity) ? rawQuantity : "";
  const unit = one(sp.unit)?.slice(0, 20);
  // From a supplier profile: only a real supplier is accepted, and the page names it.
  const supplier = getPublicSupplierBySlug((one(sp.supplier) ?? "").toLowerCase());

  return (
    <Container>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Post Requirement" }]} />
      <PageBody>
        <PageIntro
          title="Post Your Requirement"
          subtitle="Tell us what you need, how much, and where, and compare quotes from suppliers."
        />
        <RequirementForm defaultProduct={defaultProduct} defaultQuantity={defaultQuantity} category={category} subcategory={subcategory} unit={unit} supplierId={supplier?.slug} supplierName={supplier?.name} />
      </PageBody>
    </Container>
  );
}

export default withPagePerf("page post-requirement", PostRequirementPage);
