import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

async function handleGET() {
  try {
    return NextResponse.json({ user: await getCurrentUser() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // "could not tell" is NOT "signed out": a 503 lets the header retry instead of showing a guest to a signed-in visitor
    return NextResponse.json({ user: null, unavailable: true }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export const GET = withApiPerf("GET api/auth/me", handleGET);
