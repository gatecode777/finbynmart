import { HeroSection } from "@/components/homepage/HeroSection";
import { TrustBenefits } from "@/components/homepage/TrustBenefits";
import { CategoryShowcase } from "@/components/homepage/CategoryShowcase";
import { RequirementBanner } from "@/components/homepage/RequirementBanner";
import { FeaturedProducts } from "@/components/homepage/FeaturedProducts";
import { FeaturedSuppliers } from "@/components/homepage/FeaturedSuppliers";
import { HowItWorks } from "@/components/homepage/HowItWorks";
import { IndiaNetworkBanner } from "@/components/homepage/IndiaNetworkBanner";
import { IndustrySolutions } from "@/components/homepage/IndustrySolutions";

// Public, session-free page: served from the cache and rebuilt at most every 5 minutes (a per-visit render cost CPU on every visit, crawlers included). Approved supplier products appear after the next rebuild.
export const revalidate = 300;

export default function Home() {
  return (
    <>
      <HeroSection />
      <TrustBenefits />
      <CategoryShowcase />
      <RequirementBanner />
      <FeaturedProducts />
      <FeaturedSuppliers />
      <HowItWorks />
      <IndiaNetworkBanner />
      <IndustrySolutions />
    </>
  );
}
