import { SearchBar } from "@/components/layout/SearchBar";
import { PopularSearches } from "@/components/homepage/PopularSearches";

export function HeroSearch() {
  return (
    <div>
      <SearchBar size="large" />
      <PopularSearches />
    </div>
  );
}
