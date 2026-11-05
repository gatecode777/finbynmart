"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";

/** Shown if a category cannot be loaded; offers a retry and a way back to All Categories. */
export default function CategoryError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container>
      <div style={{ paddingBlock: "var(--space-12)" }}>
        <EmptyState
          title="We couldn't load this category"
          actions={
            <>
              <Button type="button" onClick={reset}>
                Try again
              </Button>
              <Link href="/categories">Back to All Categories</Link>
            </>
          }
        >
          Something went wrong while loading the products. Please try again in a moment.
        </EmptyState>
      </div>
    </Container>
  );
}
