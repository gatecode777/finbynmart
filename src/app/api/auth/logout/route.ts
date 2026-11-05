import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth/session";
import { withApiPerf } from "@/lib/perf/instrument";

async function handlePOST() {
  await endSession();
  return NextResponse.json({ ok: true });
}

export const POST = withApiPerf("POST api/auth/logout", handlePOST);
