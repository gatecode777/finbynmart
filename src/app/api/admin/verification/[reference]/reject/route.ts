import { decisionRoute } from "@/lib/verification/http";

export const dynamic = "force-dynamic";

/** POST /api/admin/verification/<reference>/reject { reasonCode, internalNote?, checklist, expectedRev, idempotencyKey }: see decisionRoute. */
export async function POST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  return decisionRoute("reject", request, params);
}
