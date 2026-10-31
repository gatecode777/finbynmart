import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { PageBody } from "@/components/ui/PageBody";
import { FilterBar } from "@/components/ui/FilterBar";
import { ResultGrid } from "@/components/ui/ResultGrid";
import { ResultSummary } from "@/components/ui/ResultSummary";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { SellerCard } from "@/components/supplier/SellerCard";
import { getSellerFacets, listSellers } from "@/lib/catalog/queries";
import { formatCount } from "@/lib/utils/format";
import { first, oneOf, toInt, type SearchParams } from "@/lib/utils/searchParams";

export const metadata: Metadata = {
  title: "Find Suppliers | Finbyn Mart",
  description: "Browse apparel suppliers on Finbyn Mart by specialization and location.",
};

const PAGE_SIZE = 24;
const SORTS = ["rating", "products", "name"] as const;

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = first(sp.q);
  const specialization = first(sp.specialization);
  const state = first(sp.state);
  const sort = oneOf(first(sp.sort), SORTS);

  const facets = getSellerFacets();
  const result = listSellers({ q, specialization, state, sort, page: toInt(first(sp.page)), pageSize: PAGE_SIZE });
  const total = facets.specializations.reduce((sum, f) => sum + f.count, 0);

  return (
    <Container>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Suppliers" }]} />
      <PageBody>
        <PageIntro
          title="Find Suppliers"
          subtitle={`Browse ${formatCount(total)} sellers by what they specialize in and where they are based.`}
        />

        <FilterBar
          action="/suppliers"
          resetHref="/suppliers"
          fields={[
            { kind: "search", name: "q", label: "Search", placeholder: "Seller name or city", value: q },
            {
              kind: "select",
              name: "specialization",
              label: "Specialization",
              value: specialization,
              options: [
                { label: "All specializations", value: "" },
                ...facets.specializations.map((f) => ({ label: `${f.name} (${f.count})`, value: f.name })),
              ],
            },
            {
              kind: "select",
              name: "state",
              label: "State",
              value: state,
              options: [
                { label: "All states", value: "" },
                ...facets.states.map((f) => ({ label: `${f.name} (${f.count})`, value: f.name })),
              ],
            },
            {
              kind: "select",
              name: "sort",
              label: "Sort by",
              value: sort,
              options: [
                { label: "Top rated", value: "rating" },
                { label: "Most products", value: "products" },
                { label: "Name A–Z", value: "name" },
              ],
            },
          ]}
        />

        <ResultSummary page={result.page} pageSize={PAGE_SIZE} total={result.total} noun="suppliers" />

        {result.items.length > 0 ? (
          <ResultGrid variant="seller">
            {result.items.map((seller) => (
              <SellerCard key={seller.id} seller={seller} />
            ))}
          </ResultGrid>
        ) : (
          <EmptyState
            title="No suppliers match these filters"
            actions={<Link href="/suppliers">Clear filters</Link>}
          >
            Try a different search or remove a filter.
          </EmptyState>
        )}

        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          basePath="/suppliers"
          params={{ q, specialization, state, sort }}
        />
      </PageBody>
    </Container>
  );
}
