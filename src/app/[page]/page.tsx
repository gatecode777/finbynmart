import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { PageBody } from "@/components/ui/PageBody";
import { EmptyState } from "@/components/ui/EmptyState";
import { FOOTER_COLUMNS, LEGAL_LINKS } from "@/lib/constants/footer";
import { withPagePerf } from "@/lib/perf/instrument";
import { InfoPageView } from "@/components/info/InfoPageView";
import { INFO_PAGE_MAP } from "@/lib/constants/infoPages";
import { siteUrl } from "@/lib/site";

/**
 * Footer pages whose real content (policies, contact details, guides, pricing)
 * doesn't exist yet. Each gets an honest "not published" page instead of a 404.
 * Nothing is written here on the business's behalf — legal text and contact
 * details in particular must come from the business.
 */
const PLANNED_PAGES = new Map<string, string>();
for (const link of [...FOOTER_COLUMNS.flatMap((column) => column.links), ...LEGAL_LINKS]) {
  const slug = link.href.replace(/^\//, "");
  if (slug && !slug.includes("/")) PLANNED_PAGES.set(slug, link.label);
}

// static: only the information pages are prerendered. Other footer slugs have their own routes (or fall through to notFound), so they are not listed here.
export function generateStaticParams() {
  return [...INFO_PAGE_MAP.keys()].map((page) => ({ page }));
}

interface PlannedPageProps {
  params: Promise<{ page: string }>;
}

export async function generateMetadata({ params }: PlannedPageProps): Promise<Metadata> {
  const { page } = await params;
  const info = INFO_PAGE_MAP.get(page);
  if (info) {
    const base = siteUrl();
    return {
      title: `${info.title} | Finbyn Mart`,
      description: info.description,
      ...(base ? { alternates: { canonical: `${base}/${info.slug}` } } : {}),
      ...(info.index ? {} : { robots: { index: false, follow: true } }),
      openGraph: { title: info.title, description: info.description, type: "website", ...(base ? { url: `${base}/${info.slug}` } : {}) },
    };
  }
  const label = PLANNED_PAGES.get(page);
  return label ? { title: `${label} | Finbyn Mart`, robots: { index: false } } : {};
}

async function PlannedPage({ params }: PlannedPageProps) {
  const { page } = await params;
  const info = INFO_PAGE_MAP.get(page);
  if (info) return <InfoPageView page={info} />;
  const label = PLANNED_PAGES.get(page);

  if (!label) {
    notFound();
  }

  return (
    <Container>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label }]} />
      <PageBody>
        <PageIntro title={label} />
        <EmptyState
          title="This page isn't published yet"
          actions={
            <>
              <Link prefetch={false} href="/">Back to home</Link>
              <Link prefetch={false} href="/suppliers">Find suppliers</Link>
            </>
          }
        >
          We haven&apos;t published {label} yet.
        </EmptyState>
      </PageBody>
    </Container>
  );
}

export default withPagePerf("page :page", PlannedPage);
