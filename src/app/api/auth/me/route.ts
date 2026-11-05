import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

async function handleGET() {
  try {
    return NextResponse.json({ user: await getCurrentUser() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ user: null });
  }
}

export const GET = withApiPerf("GET api/auth/me", handleGET);
