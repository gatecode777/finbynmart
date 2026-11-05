import { NextResponse } from "next/server";
import { getPublishedFaqs } from "@/lib/support/faq";
import { FAQ_CATEGORIES } from "@/lib/support/ticketRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/faqs?category=&q=: the published FAQs only (a draft is never returned). Public, read-only, and nothing about any
 * account. An unknown category or an over-long search is refused (400).
 */
async function handleGET(request: Request) {
  const p = new URL(request.url).searchParams;
  const category = p.get("category") ?? undefined;
  const q = p.get("q") ?? undefined;
  if (category !== undefined && !FAQ_CATEGORIES.some((c) => c.value === category)) return NextResponse.json({ ok: false, message: "That FAQ category is not valid." }, { status: 400 });
  if (q !== undefined && q.length > 60) return NextResponse.json({ ok: false, message: "The search text can be at most 60 characters." }, { status: 400 });
  const faqs = getPublishedFaqs({ category, q }).map(({ id, category: c, question, answer }) => ({ id, category: c, question, answer }));
  return NextResponse.json({ ok: true, data: { faqs } }, { headers: { "Cache-Control": "public, max-age=60" } });
}

export const GET = withApiPerf("GET api/public/faqs", handleGET);
