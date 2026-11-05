import { NextResponse } from "next/server";
import { getFaqCategories } from "@/lib/support/faq";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/public/faqs/categories: the FAQ categories that really have a published FAQ, with their counts. */
async function handleGET() {
  return NextResponse.json({ ok: true, data: { categories: getFaqCategories() } }, { headers: { "Cache-Control": "public, max-age=60" } });
}

export const GET = withApiPerf("GET api/public/faqs/categories", handleGET);
