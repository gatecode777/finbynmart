"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";

/** Shown if the category directory cannot be built; offers a retry and a way out. */
export default function CategoriesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container>
      <div style={{ paddingBlock: "var(--space-12)" }}>
        <EmptyState
          title="We couldn't load the categories"
          actions={
            <>
              <Button type="button" onClick={reset}>
                Try again
              </Button>
              <Link href="/products">Browse products</Link>
            </>
          }
        >
          Something went wrong while preparing this page. Please try again in a moment.
        </EmptyState>
      </div>
    </Container>
  );
}
