"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";

/** Shown if the confirmation cannot be loaded; the inquiry itself is not affected. */
export default function InquiryConfirmationError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container>
      <div style={{ paddingBottom: "var(--space-12)", paddingTop: "var(--space-12)" }}>
        <EmptyState
          title="We couldn't load this confirmation"
          actions={
            <>
              <Button type="button" onClick={reset}>
                Try again
              </Button>
              <Link href="/suppliers">Browse suppliers</Link>
            </>
          }
        >
          Something went wrong while loading the page. Your inquiry is not affected. Please try again in a moment.
        </EmptyState>
      </div>
    </Container>
  );
}
