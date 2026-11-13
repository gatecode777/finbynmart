// Order confirmation + reservation: pure rules and STATIC structure checks (no database).
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/59-order-confirmation-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const R = await import("../../../src/lib/supplier/inventoryRules.ts");

check("order quantity: whole and 3-decimal quantities convert exactly", R.orderQtyMilli(5) === 5000 && R.orderQtyMilli(1.25) === 1250 && R.orderQtyMilli(0.001) === 1);
check("order quantity: zero, negative, NaN and 4 decimals are not reservable", [0, -1, NaN, Infinity, 1.2345].every((q) => R.orderQtyMilli(q) === null));
check("available is on hand minus reserved", R.availableMilli(10000, 3000) === 7000 && R.availableMilli(5000) === 5000);
check("reserve exactly the available quantity succeeds", R.canReserve(10000, 3000, 7000) === true);
check("reserve one thousandth more than available is refused (no backorder)", R.canReserve(10000, 3000, 7001) === false);
check("reserving nothing is refused", R.canReserve(10000, 0, 0) === false);
check("an adjustment cannot remove stock that is reserved", "error" in R.movementEffect("REMOVE", 4000, 10000, 7000) && !("error" in R.movementEffect("REMOVE", 3000, 10000, 7000)));
check("an adjustment that adds stock ignores reservations", !("error" in R.movementEffect("ADD", 1000, 10000, 7000)));

const svc = read("src/lib/orders/orderConfirmation.ts");
const ord = read("src/lib/orders/service.ts");
check("one order per quotation is a unique partial index", /order_per_quotation/.test(ord) && /quotationReference: 1 \}, \{ unique: true/.test(ord));
check("an idempotency key is unique per buyer", /order_confirm_key/.test(ord) && /buyerId: 1, confirmKey: 1 \}, \{ unique: true/.test(ord));
check("confirmation runs in a transaction and reserves atomically with a stock condition", /withTransaction/.test(svc) && /\$expr: \{ \$gte:/.test(svc));
check("the price comes from the accepted version's stored fields, not the catalogue or tax rules", /priceBreakdown\(\{ unitPriceMinor: q\.unitPriceMinor/.test(svc) && !/getTaxRules|getCatalog|estimatedPrice/.test(svc));
check("only an accepted quotation owned by the buyer is loaded", /accepted: true, status: "ACCEPTED"/.test(svc) && /buyerId, accepted: true/.test(svc));
check("a retry returns the original order and a reused key for another quotation is a conflict", /replayed: true/.test(svc) && /KEY_CONFLICT/.test(svc));
check("no payment or paid status is created", !/paid|payment/i.test(svc.replace(/No payment[^.]*\./g, "").replace(/\/\*[\s\S]*?\*\//g, "")));
check("no inventory position is created or guessed (only an existing one is read)", !/positions\.insertOne|positions\.updateOne\([^)]*upsert/.test(svc));
check("the supplier notice happens after the commit", svc.indexOf("withTransaction") < svc.indexOf("notifySellerOwner(q.supplierKey"));
const api = read("src/app/api/buyer/quotations/[reference]/confirm-order/route.ts");
check("the confirm route has an origin check, a rate limit and the buyer guard", /isCrossSiteWrite/.test(api) && /limit: 10/.test(api) && /buyerGuard/.test(api));
console.log(`\n${passed} passed, 0 failed`);
