import { notFound, redirect } from "next/navigation";
import { isKnownCategory, resolveCategorySlug } from "@/lib/constants/categoryAliases";

interface CategoryRedirectProps {
  params: Promise<{ slug: string }>;
}

/**
 * The homepage tiles and the nav bar link to /categories/<slug>, while category
 * pages live at /category/<slug>. This forwards the former to the latter.
 */
export default async function CategoryRedirect({ params }: CategoryRedirectProps) {
  const { slug } = await params;
  const target = resolveCategorySlug(slug);

  if (isKnownCategory(target)) {
    redirect(`/category/${target}`);
  }
  // Nav entries that are groupings, not categories.
  if (slug === "industrial-supplies" || slug === "more") {
    redirect("/categories");
  }
  notFound();
}
