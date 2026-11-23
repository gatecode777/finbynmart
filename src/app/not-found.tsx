import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { PageBody } from "@/components/ui/PageBody";
import { PageIntro } from "@/components/ui/PageIntro";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Page not found | Finbyn Mart", robots: { index: false } };

export default function NotFound() {
  return (
    <Container>
      <PageBody>
        <PageIntro title="Page not found" />
        <EmptyState
          title="We couldn't find that page"
          actions={
            <>
              <Link prefetch={false} href="/">Back to home</Link>
              <Link prefetch={false} href="/products">Browse products</Link>
              <Link prefetch={false} href="/suppliers">Find suppliers</Link>
            </>
          }
        >
          The link may be out of date or the page may have moved.
        </EmptyState>
      </PageBody>
    </Container>
  );
}
