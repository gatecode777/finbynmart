import { NextResponse } from "next/server";

export function fail(message: string, status = 400, fields?: Record<string, string>) {
  return NextResponse.json({ ok: false, message, fields }, { status });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const str = (value: unknown): string => (typeof value === "string" ? value : "");
