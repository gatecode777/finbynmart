import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { endSession } from "@/lib/auth/session";
import { recordSecurityEvent } from "@/lib/security/securityEvents";
import { withApiPerf } from "@/lib/perf/instrument";

/** Ends this browser's session on the server (its record is revoked, so the cookie is dead even if it is kept) and records the sign-out. */
async function handlePOST() {
  const ended = await endSession();
  // only a session that was really ended is recorded (a replayed, already revoked cookie adds nothing to the owner's history)
  if (ended?.publicId && ObjectId.isValid(ended.userId)) {
    await recordSecurityEvent(new ObjectId(ended.userId), "LOGOUT", { sessionPublicId: ended.publicId }).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}

export const POST = withApiPerf("POST api/auth/logout", handlePOST);
