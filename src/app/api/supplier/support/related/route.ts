import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireSupplierApi } from "@/lib/auth/guards";
import { RELATED_TYPES } from "@/lib/support/ticketRules";
import { listRelatedOptions } from "@/lib/support/ticketService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const type = RELATED_TYPES.find((t) => t.value === new URL(request.url).searchParams.get("type"))?.value;
  if (!type) return fail("Choose one of: inquiry, quotation, order, product.", 400, { type: "Choose a type." });

  try {
    const options = await listRelatedOptions(guard.user.id, type);
    return NextResponse.json({ ok: true, options }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("supplier related options failed", (error as Error).message);
    return fail("We couldn't load those records.", 503);
  }
}
