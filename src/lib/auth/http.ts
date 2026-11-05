import { NextResponse } from "next/server";

export function fail(message: string, status = 400, fields?: Record<string, string>) {
  return NextResponse.json({ ok: false, message, fields }, { status });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** Trims, strips control characters and collapses whitespace. Returns "" for non-strings. */
export function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Reads a quantity sent as a JSON number or as text. Anything else is "" and fails validation. */
export function numberText(value: unknown, max: number): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value).slice(0, max) : clean(value, max);
}

/** Like clean() but keeps line breaks, for free-text messages. */
export function cleanMultiline(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export function tooMany(retryAfterSeconds: number) {
  return NextResponse.json(
    { ok: false, message: "Too many attempts. Please wait a moment and try again.", code: "RATE_LIMITED", retryAfter: retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

/** Reads a JSON body only when it is small; null otherwise. */
export async function readSmallJson(request: Request, maxBytes = 10_000): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes) return null;
  return readJson(request);
}
