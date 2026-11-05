import { NextResponse } from "next/server";
import { getSupportChannels } from "@/lib/support/channels";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/support/channels: the support channels that are really configured (SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_HOURS) and
 * the two that always exist (the ticket form and Contact Us). Live chat is reported as not available. Nothing is invented or defaulted.
 */
async function handleGET() {
  return NextResponse.json({ ok: true, data: { channels: getSupportChannels() } }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withApiPerf("GET api/public/support/channels", handleGET);
