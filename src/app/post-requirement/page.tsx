import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { PageBody } from "@/components/ui/PageBody";
import { RequirementPostForm } from "@/components/homepage/RequirementBanner/RequirementPostForm";
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
  // From "Request Bulk Price" on a product page: a whole number and a unit, both re-validated by the server.
  const rawQuantity = one(sp.quantity) ?? "";
  const defaultQuantity = /^\d{1,7}$/.test(rawQuantity) ? rawQuantity : "";
  // From a supplier profile: only a real supplier is accepted, and the page names it.
  const supplier = getPublicSupplierBySlug((one(sp.supplier) ?? "").toLowerCase());

  return (
    <Container>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Post Requirement" }]} />
      <PageBody>
        <PageIntro
          title="Post Your Requirement"
          subtitle="Choose the product that describes what you need, say how much and where, and compare quotes from matching suppliers."
        />
        {supplier && (
          <p>
            A requirement is shared with eligible matching suppliers, not one company. To contact {supplier.name} directly, <Link prefetch={false} href={`/inquiry/${supplier.slug}`}>send it an inquiry</Link>.
          </p>
        )}
        <RequirementPostForm defaultQuery={defaultProduct} defaultQuantity={defaultQuantity} defaultCity={one(sp.city) ?? ""} />
      </PageBody>
    </Container>
  );
}

export default withPagePerf("page post-requirement", PostRequirementPage);
