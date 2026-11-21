import { NextResponse } from "next/server";
import type { OpResult } from "./inquiryOps";

export const NO_STORE = { "Cache-Control": "private, no-store" };

/** One mapping of an operation result to the API contract: 200 with the outcome, or 404 / 409 / 422 with a safe message and field errors. */
export function opResponse(r: OpResult): NextResponse {
  if (r.ok) return NextResponse.json({ ok: true, replay: r.replay, message: r.message }, { headers: NO_STORE });
  return NextResponse.json({ ok: false, message: r.message, ...(r.fields ? { fields: r.fields } : {}) }, { status: r.status, headers: NO_STORE });
}
