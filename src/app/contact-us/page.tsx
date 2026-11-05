import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import styles from "@/components/auth/Auth.module.css";
import { ContactForm } from "@/components/support/ContactForm";
import { getCurrentUser } from "@/lib/auth/session";
import { withPagePerf } from "@/lib/perf/instrument";

export const metadata: Metadata = { title: "Contact Us | Finbyn Mart", description: "Send a message to Finbyn Mart." };

async function ContactUsPage() {
  const user = await getCurrentUser().catch(() => null);
  return (
    <AuthLayout breadcrumb="Contact Us" variant="contact">
      <h1 className={styles.heading}>Contact Us</h1>
      <p className={styles.subheading}>Tell us what you need help with. Fields marked * are required.</p>
      <ContactForm initialName={user?.name} initialEmail={user?.email} />
    </AuthLayout>
  );
}

export default withPagePerf("page contact-us", ContactUsPage);
