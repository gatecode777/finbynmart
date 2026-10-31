import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { PageBody } from "@/components/ui/PageBody";
import { RequirementForm } from "@/components/homepage/RequirementBanner/RequirementForm";

export const metadata: Metadata = {
  title: "Post Your Requirement | Finbyn Mart",
  description: "Tell suppliers what you need and compare quotes.",
};

export default function PostRequirementPage() {
  return (
    <Container>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Post Requirement" }]} />
      <PageBody>
        <PageIntro
          title="Post Your Requirement"
          subtitle="Tell us what you need, how much, and where, and compare quotes from suppliers."
        />
        <RequirementForm />
      </PageBody>
    </Container>
  );
}
