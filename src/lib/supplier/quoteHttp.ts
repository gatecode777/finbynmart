import { NextResponse } from "next/server";
import { tooMany } from "@/lib/auth/http";
import { rateLimit, rateLimitReserved } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import type { Failure } from "./quoteService";

export const PRIVATE = { "Cache-Control": "private, no-store" };
export const BODY_LIMIT = 24_000;

export const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE });

/** One answer for every business failure: 403 / 404 / 409 / 422 with a code, a message in words and, for 422, per-field messages. Never a stack or a database error. */
export const failureResponse = (f: Failure) => reply({ ok: false, code: f.code, message: f.message, ...(f.fields ? { fields: f.fields } : {}), ...(f.data !== undefined ? { data: f.data } : {}) }, f.status);

export const error = (status: number, message: string, code?: string) => reply({ ok: false, message, ...(code ? { code } : {}) }, status);

/** Cross-site writes are refused (403); the body is read only up to BODY_LIMIT (413 beyond it, 400 for anything that is not a JSON object). */
export async function readWrite(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  if (isCrossSiteWrite(request)) return { ok: false, response: error(403, "This request was blocked.", "CROSS_SITE") };
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > BODY_LIMIT) return { ok: false, response: error(413, "The request is too large.", "TOO_LARGE") };
  const text = await request.text().catch(() => "");
  if (text.length > BODY_LIMIT) return { ok: false, response: error(413, "The request is too large.", "TOO_LARGE") };
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    /* falls through */
  }
  return { ok: false, response: error(400, "Send a JSON object.", "BAD_BODY") };
}

/** Reads use the block-reservation limiter (few round trips); WRITES (save, preview, submit, withdraw, export) use the exact per-attempt limiter, as the project rules require. */
export async function limit(userId: string, name: string, max: number, windowSeconds: number, write = false) {
  const result = write ? await rateLimit(`${name}:${userId}`, max, windowSeconds) : await rateLimitReserved(`${name}:${userId}`, max, windowSeconds);
  return result.ok ? null : tooMany(result.retryAfterSeconds);
}

export function pageParams(url: URL, defaultLimit: number, maxLimit: number): { ok: true; q: string; page: number; limit: number } | { ok: false; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const q = (url.searchParams.get("q") ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length > 60) fields.q = "The search text can be at most 60 characters.";
  const num = (key: string, fallback: number, max: number) => {
    const v = url.searchParams.get(key);
    if (v === null || v === "") return fallback;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > max) {
      fields[key] = `${key} must be a whole number from 1 to ${max}.`;
      return fallback;
    }
    return n;
  };
  const page = num("page", 1, 1000);
  const lim = num("limit", defaultLimit, maxLimit);
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, q, page, limit: lim };
}
