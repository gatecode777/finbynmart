import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { PageBody } from "@/components/ui/PageBody";
import { ResultGrid } from "@/components/ui/ResultGrid";
import { TileLinkCard } from "@/components/ui/TileLinkCard";
import { INDUSTRY_SOLUTIONS } from "@/lib/constants/industries";

export const metadata: Metadata = {
  title: "Industry Solutions | Finbyn Mart",
  description: "Explore the industries served on Finbyn Mart.",
};

export default function IndustriesPage() {
  return (
    <Container>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Industries" }]} />
      <PageBody>
        <PageIntro title="Industry Solutions" subtitle="Explore the industries served on Finbyn Mart." />
        <ResultGrid variant="category">
          {INDUSTRY_SOLUTIONS.map((industry) => (
            <TileLinkCard key={industry.id} href={industry.href} name={industry.name} tile={industry} shape="wide" />
          ))}
        </ResultGrid>
      </PageBody>
    </Container>
  );
}
