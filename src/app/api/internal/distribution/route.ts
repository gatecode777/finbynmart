import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { readSmallJson, tooMany } from "@/lib/auth/http";
import { retryJob, runDistribution } from "@/lib/leads/distribution";
import { rateLimit } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

/**
 * POST /api/internal/distribution: the lead-distribution WORKER. Not a user route: it needs `Authorization: Bearer <DISTRIBUTION_WORKER_SECRET>` (compared in
 * constant time). With no secret configured it is OFF (503): it never runs unauthenticated. Body: {} runs one bounded pass; {"action":"retry","reference":"FBM-INQ-..."}
 * makes a FAILED/PARTIAL job runnable again. Responses carry counts only (no buyer or supplier data). A scheduler (cron, Vercel Cron, an operator) must call it:
 * none is deployed by this repository.
 */
const digest = (v: string) => createHash("sha256").update(v).digest();

export async function POST(request: Request) {
  const secret = process.env.DISTRIBUTION_WORKER_SECRET;
  if (!secret || secret.length < 24) return NextResponse.json({ ok: false, message: "Lead distribution worker is not configured." }, { status: 503 });
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!given || !timingSafeEqual(digest(given), digest(secret))) return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  const limit = await rateLimit("distribution-worker", 120, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const body = (await readSmallJson(request, 1_000)) ?? {};
  if (body.action === "retry") {
    const reference = typeof body.reference === "string" ? body.reference : "";
    if (!/^FBM-INQ-[0-9A-HJKMNP-TV-Z]{8}$/.test(reference)) return NextResponse.json({ ok: false, message: "Invalid reference." }, { status: 422 });
    const retried = await retryJob(reference);
    if (!retried) return NextResponse.json({ ok: false, message: "No failed or partial job for that reference." }, { status: 409 });
  }
  try {
    const report = await runDistribution({ maxJobs: 5, maxBatches: 25 });
    return NextResponse.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("distribution run failed", (error as Error).message);
    return NextResponse.json({ ok: false, message: "The run failed. It can be repeated safely." }, { status: 500 });
  }
}
