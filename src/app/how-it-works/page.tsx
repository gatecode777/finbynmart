import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { HowItWorks } from "@/components/homepage/HowItWorks";

export const metadata: Metadata = {
  title: "How It Works | Finbyn Mart",
  description: "How buyers find suppliers and get quotes on Finbyn Mart.",
};

export default function HowItWorksPage() {
  return (
    <>
      <Container>
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "How It Works" }]} />
      </Container>
      <HowItWorks />
    </>
  );
}
