import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { PageBody } from "@/components/ui/PageBody";
import { EmptyState } from "@/components/ui/EmptyState";
import { MediaTile } from "@/components/ui/MediaTile";
import { INDUSTRY_SOLUTIONS } from "@/lib/constants/industries";
import styles from "./industry.module.css";
import { withPagePerf } from "@/lib/perf/instrument";

interface IndustryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: IndustryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const industry = INDUSTRY_SOLUTIONS.find((item) => item.id === slug);
  return industry ? { title: `${industry.name} | Finbyn Mart` } : {};
}

async function IndustryPage({ params }: IndustryPageProps) {
  const { slug } = await params;
  const industry = INDUSTRY_SOLUTIONS.find((item) => item.id === slug);

  if (!industry) {
    notFound();
  }

  return (
    <Container>
      <Breadcrumb
        items={[{ label: "Home", href: "/" }, { label: "Industries", href: "/industries" }, { label: industry.name }]}
      />
      <PageBody>
        <PageIntro title={industry.name} />
        <div className={styles.banner}>
          <MediaTile tile={industry} alt={industry.name} iconSize={48} />
        </div>
        <EmptyState
          title="Listings for this industry aren't available yet"
          actions={
            <>
              <Link href="/post-requirement">Post a requirement</Link>
              <Link href="/suppliers">Browse all suppliers</Link>
            </>
          }
        >
          We haven&apos;t listed suppliers for {industry.name} yet.
        </EmptyState>
      </PageBody>
    </Container>
  );
}

export default withPagePerf("page industries/:slug", IndustryPage);
