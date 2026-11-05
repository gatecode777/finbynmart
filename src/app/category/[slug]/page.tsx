import { notFound, redirect } from "next/navigation";
import { resolveCategoryRoute } from "@/lib/catalog/categories";
import { withPagePerf } from "@/lib/perf/instrument";

/**
 * Legacy URL. Category pages now live at /categories/<slug>; this keeps old links, bookmarks and
 * search results working by forwarding them (a permanent move for the canonical categories).
 */
async function LegacyCategoryRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const route = resolveCategoryRoute(slug);
  if (route.type === "all") redirect("/categories");
  if (route.type === "none") notFound();
  redirect(`/categories/${route.slug ?? slug}`);
}

export default withPagePerf("page category/:slug", LegacyCategoryRedirect);
