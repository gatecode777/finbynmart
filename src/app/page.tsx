import { HeroSection } from "@/components/homepage/HeroSection";
import { TrustBenefits } from "@/components/homepage/TrustBenefits";
import { CategoryShowcase } from "@/components/homepage/CategoryShowcase";
import { RequirementBanner } from "@/components/homepage/RequirementBanner";
import { FeaturedProducts } from "@/components/homepage/FeaturedProducts";
import { FeaturedSuppliers } from "@/components/homepage/FeaturedSuppliers";
import { HowItWorks } from "@/components/homepage/HowItWorks";
import { IndiaNetworkBanner } from "@/components/homepage/IndiaNetworkBanner";
import { IndustrySolutions } from "@/components/homepage/IndustrySolutions";

// Product and supplier sections read the public catalogue at request time (not at build time).
export const dynamic = "force-dynamic";

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
