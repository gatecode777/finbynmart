"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";

/** Shown if the product listing cannot be built; offers a retry and a way out. */
export default function ProductsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container>
      <div style={{ paddingBlock: "var(--space-12)" }}>
        <EmptyState
          title="We couldn't load the products"
          actions={
            <>
              <Button type="button" onClick={reset}>
                Try again
              </Button>
              <Link href="/categories">Browse categories</Link>
            </>
          }
        >
          Something went wrong while preparing this page. Please try again in a moment.
        </EmptyState>
      </div>
    </Container>
  );
}
