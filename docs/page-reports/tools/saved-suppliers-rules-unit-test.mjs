// Unit tests for src/lib/wishlist/savedSuppliersRules.ts (pure module).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/saved-suppliers-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const R = await import(pathToFileURL(path.join(root, "src/lib/wishlist/savedSuppliersRules.ts")).href);

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const P = (o = {}) => R.parseSavedSupplierQuery(o);

check("Q-01 defaults: no search, no filters, recently saved, page 1, 12 per page", JSON.stringify(P({}).value) === JSON.stringify({ q: "", category: null, state: null, city: null, type: null, verification: null, sort: "recent", page: 1, limit: 12 }));
check("Q-02 the six sorts are accepted; a rating sort and anything else is refused (no supplier has genuine ratings)", R.SUPPLIER_SORTS.length === 6 && R.SUPPLIER_SORTS.every((s) => P({ sort: s.value }).ok) && ["rating", "highest-rating", "price-low", "RECENT"].every((v) => !P({ sort: v }).ok));
check("Q-03 category, state, city and type are slugs; anything else is refused", ["category", "state", "city", "type"].every((k) => P({ [k]: "uttar-pradesh" }).ok && ["Uttar Pradesh", "a/b", "x".repeat(81), "<x>"].every((v) => !P({ [k]: v }).ok)));
check("Q-04 verification is verified or unverified; pending and rejected do not exist (no verification workflow) and are refused", P({ verification: "verified" }).value?.verification === "verified" && P({ verification: "unverified" }).ok && ["pending", "rejected", "VERIFIED", "all"].every((v) => !P({ verification: v }).ok));
check("Q-05 search is trimmed, collapsed, control characters removed; 60 allowed, 61 refused; objects refused", P({ q: "  shree   textiles " }).value?.q === "shree textiles" && P({ q: "a".repeat(60) }).ok && !P({ q: "a".repeat(61) }).ok && !P({ q: { $ne: "" } }).ok && P({ q: "a\u0000b" }).value?.q === "a b");
check("Q-06 page 1 to 100 and limit 1 to 48, whole numbers only", !P({ page: "0" }).ok && !P({ page: "101" }).ok && !P({ page: "1.5" }).ok && !P({ limit: "0" }).ok && !P({ limit: "49" }).ok && P({ page: "100", limit: "48" }).ok && !P({ page: 2 }).ok);
check("Q-07 unknown parameters (buyerId, userId, country) are ignored, never read", P({ buyerId: "x", userId: "y", country: "IN" }).ok && !("buyerId" in P({ buyerId: "x" }).value) && !("country" in P({ country: "IN" }).value));
check("Q-08 several problems are reported together on their own fields", (() => { const x = P({ sort: "zz", page: "0", category: "A B", verification: "pending" }); return !x.ok && ["sort", "page", "category", "verification"].every((k) => k in x.fields); })());
const K = (v, min, max) => R.parseSupplierKeys(v, min, max);
check("K-01 supplier keys: a bounded list of 1 to 20 valid stored keys; duplicates count once", K(["a"]).ok && K(Array.from({ length: 20 }, (_, i) => `k${i}`)).ok && !K([]).ok && !K(Array.from({ length: 21 }, (_, i) => `k${i}`)).ok && K(["a", "a", "b"]).keys.join() === "a,b" && K(["shree-textiles", "SLR0001", "a.b_c-d"]).ok);
check("K-02 supplier keys: a non-list, a non-string, an empty or markup key, or a key over 80 characters refuses the whole request", !K("all").ok && !K(null).ok && !K([1]).ok && !K([""]).ok && !K(["<script>"]).ok && !K(["a b"]).ok && !K(["x".repeat(81)]).ok && !K([{ $ne: 1 }]).ok);
check("K-03 comparison needs 2 to 4 different suppliers (the same one twice is one)", !K(["a"], R.COMPARE_MIN, R.COMPARE_MAX).ok && K(["a", "b"], R.COMPARE_MIN, R.COMPARE_MAX).ok && K(["a", "b", "c", "d"], R.COMPARE_MIN, R.COMPARE_MAX).ok && !K(["a", "b", "c", "d", "e"], R.COMPARE_MIN, R.COMPARE_MAX).ok && !K(["a", "a"], R.COMPARE_MIN, R.COMPARE_MAX).ok);
check("C-01 limits: 500 saved suppliers, 20 per bulk action, compare 2 to 4", R.SAVED_SUPPLIER_CAP === 500 && R.BULK_MAX === 20 && R.COMPARE_MIN === 2 && R.COMPARE_MAX === 4);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n" + failures.join("\n"));
  process.exit(1);
}
