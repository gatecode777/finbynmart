import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmationView } from "@/components/inquiry/ConfirmationView";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCurrentUser } from "@/lib/auth/session";
import { getInquiryConfirmation } from "@/lib/inquiries/confirmation";
import { GUEST_ACCESS_COOKIE, checkAccess } from "@/lib/inquiries/guestAccess";
import { withPagePerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

// A personal page: never indexed, and nothing about the inquiry (not even its reference) goes into the metadata.
export const metadata: Metadata = { title: "Inquiry Confirmation | Finbyn Mart", robots: { index: false, follow: false } };

/**
 * /inquiry/success/<reference>: shown after Page 13 saved an inquiry, and reachable again by refresh or link. It never
 * creates anything. The saved inquiry is shown to the buyer it belongs to or, for a guest, to the browser holding the
 * signed confirmation cookie. Everyone else (an unknown reference, someone else's, a reference typed in by hand) gets
 * the same plain "not found".
 */
async function InquirySuccessPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const user = await getCurrentUser().catch(() => null);
  const guest = checkAccess((await cookies()).get(GUEST_ACCESS_COOKIE)?.value, reference);

  const result = await getInquiryConfirmation(reference, { userId: user?.role === "buyer" ? user.id : undefined, guest });
  if (result.status === "not_found") notFound();

  if (result.status === "expired") {
    return (
      <Container>
        <div style={{ paddingBlock: "var(--space-12)" }}>
          <EmptyState
            title="This confirmation has expired"
            actions={
              <>
                <Link href={`/sign-in?next=${encodeURIComponent("/buyer/inquiries")}`}>Sign in to see your inquiries</Link>
                <Link href="/suppliers">Browse suppliers</Link>
              </>
            }
          >
            For your privacy a guest confirmation can be opened for an hour after you send the inquiry. Your inquiry is still saved. Guest inquiries cannot be tracked online yet, so keep the reference you were given.
          </EmptyState>
        </div>
      </Container>
    );
  }

  return <ConfirmationView data={result.data} />;
}

export default withPagePerf("page inquiry/success/:reference", InquirySuccessPage);
