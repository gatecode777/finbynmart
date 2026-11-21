import { NextResponse } from "next/server";
import { ensureApproved } from "@/lib/catalog/approvedProducts";
import { getApproved } from "@/lib/catalog/approvedStore";
import { attributeSetFor, type AttrDef } from "@/lib/catalog/attributes";
import { getCatalog } from "@/lib/catalog/data";
import { boundedRateLimit, clientIp } from "@/lib/security/rateLimit";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

const publicDef = (d: AttrDef) => ({ id: d.id, label: d.label, type: d.type, required: d.required, options: d.options?.map((o) => ({ value: o.value, label: o.label })), units: d.units?.map((u) => ({ code: u.code, label: u.label })), maxLength: d.textMax });

/**
 * GET /api/public/requirement-spec?product=<public product id>: what a buyer may state in a requirement about the chosen reference product. A supplier product returns its
 * category's editable attributes with the product's own values (the buyer may change them; whatever is sent is validated again by POST /api/requirements). A catalogue product
 * returns its colour read-only (the catalogue has no other attribute). An unsupported category says so. Public data only; nothing is guessed.
 */
async function handleGET(request: Request) {
  await ensureApproved();
  const limit = await boundedRateLimit(`requirement-spec:${clientIp(request)}`, 120, 60);
  if (!limit.ok) return NextResponse.json({ ok: false, message: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const id = (new URL(request.url).searchParams.get("product") ?? "").trim().slice(0, 40);
  if (/^\d+$/.test(id)) {
    const p = getCatalog().productById.get(Number(id));
    if (!p) return NextResponse.json({ ok: false, message: "That product is not available." }, { status: 404 });
    return NextResponse.json({ ok: true, data: { supported: true, editable: false, category: p.categoryName, attributes: p.colour ? [{ id: "colour", label: "Colour", type: "text", required: true, value: p.colour, unit: "" }] : [] } }, { headers: { "Cache-Control": "no-store" } });
  }
  const item = id.startsWith("sp-") ? getApproved().byId.get(id) : undefined;
  if (!item) return NextResponse.json({ ok: false, message: "That product is not available." }, { status: 404 });
  const set = attributeSetFor(item.nodeId);
  if (!set) return NextResponse.json({ ok: true, data: { supported: false, reason: "Requirements for this category cannot be matched to supplier products yet: it has no specification definitions.", category: item.categoryName, attributes: [] } }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: true, data: { supported: true, editable: true, category: item.categoryName, attributes: set.defs.map((d) => ({ ...publicDef(d), value: item.attributes[d.id] === undefined ? "" : String(item.attributes[d.id].value), unit: item.attributes[d.id]?.unit ?? "" })) } }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withApiPerf("GET api/public/requirement-spec", handleGET);
