import { NextResponse } from "next/server";
import { clientIp, rateLimitReserved } from "@/lib/security/rateLimit";

/** Error body of the public APIs: { ok: false, code, message, fields? }. */
export function apiError(status: number, code: string, message: string, fields?: Record<string, string>, headers?: Record<string, string>) {
  return NextResponse.json({ ok: false, code, message, ...(fields ? { fields } : {}) }, { status, headers });
}

/** Returns a 429 response when the caller is over the limit, otherwise null. */
export async function limitedResponse(request: Request, bucket: string, limit: number, windowSeconds = 60) {
  // Public reads: block reservation (see rateLimitReserved), so a steady client does not pay a database write per request.
  const result = await rateLimitReserved(`${bucket}:${clientIp(request)}`, limit, windowSeconds);
  if (result.ok) return null;
  return apiError(429, "RATE_LIMITED", "Too many requests. Please wait a moment and try again.", undefined, { "Retry-After": String(result.retryAfterSeconds) });
}
