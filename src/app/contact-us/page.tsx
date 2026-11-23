import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import styles from "@/components/auth/Auth.module.css";
import { ContactForm } from "@/components/support/ContactForm";
import { SUPPORT_TOPICS } from "@/lib/support/rules";
import { getCurrentUser } from "@/lib/auth/session";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = { title: "Contact Us | Finbyn Mart", description: "Send a message to Finbyn Mart." };

async function ContactUsPage({ searchParams }: { searchParams: Promise<{ topic?: string | string[] }> }) {
  // only an allowlisted topic value presets the form; anything else is ignored
  const { topic } = await searchParams;
  const initialTopic = SUPPORT_TOPICS.find((t) => t.value === topic)?.value ?? "";
  const user = await getCurrentUser().catch(() => null);
  return (
    <AuthLayout breadcrumb="Contact Us" variant="contact">
      <h1 className={styles.heading}>Contact Us</h1>
      <p className={styles.subheading}>Tell us what you need help with. Fields marked * are required.</p>
      <ContactForm initialName={user?.name} initialEmail={user?.email} initialTopic={initialTopic} />
    </AuthLayout>
  );
}

export default withPagePerf("page contact-us", ContactUsPage);
