import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireSupplierApi } from "@/lib/auth/guards";
import { getBuyerTicketSummary } from "@/lib/support/ticketService";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  try {
    const summary = await getBuyerTicketSummary(guard.user.id);
    return NextResponse.json({ ok: true, summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("supplier ticket summary failed", (error as Error).message);
    return fail("We couldn't load the summary.", 503);
  }
}
