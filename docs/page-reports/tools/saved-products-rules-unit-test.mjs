// Unit tests for src/lib/wishlist/savedProductsRules.ts (pure module).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/saved-products-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const R = await import(pathToFileURL(path.join(root, "src/lib/wishlist/savedProductsRules.ts")).href);

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const P = (o = {}) => R.parseSavedQuery(o);

check("Q-01 defaults: no search, all categories, recently saved, page 1, 12 per page", JSON.stringify(P({}).value) === JSON.stringify({ q: "", category: null, sort: "recent", page: 1, limit: 12 }));
check("Q-02 the six sorts are accepted, anything else refused", R.SAVED_SORTS.length === 6 && R.SAVED_SORTS.every((s) => P({ sort: s.value }).ok) && ["price", "reference", "RECENT", "{}", ["recent"]].every((sort) => !P({ sort }).ok));
check("Q-03 category is a slug; anything else refused", P({ category: "men-tshirts" }).value?.category === "men-tshirts" && ["Men Tshirts", "a/b", "x".repeat(81), "{$ne:1}", ["a"]].every((category) => !P({ category }).ok));
check("Q-04 search text is trimmed, collapsed, stripped of control characters; 60 allowed, 61 refused; objects refused", P({ q: "  shree   textiles " }).value?.q === "shree textiles" && P({ q: "x".repeat(60) }).ok && !P({ q: "x".repeat(61) }).ok && P({ q: "a\u0000b" }).value?.q === "a b" && [{ $ne: "" }, ["a"], 5].every((q) => !P({ q }).ok));
check("Q-05 page 1 to 100 and limit 1 to 48, whole numbers only", !P({ page: "0" }).ok && !P({ page: "101" }).ok && !P({ page: "1.5" }).ok && !P({ limit: "0" }).ok && !P({ limit: "49" }).ok && !P({ limit: "x" }).ok && P({ page: "100", limit: "48" }).ok);
check("Q-06 unknown parameters (buyerId, userId) are ignored, never read", P({ buyerId: "x", userId: "y" }).ok && !("buyerId" in P({ buyerId: "x" }).value));
check("Q-07 several problems are reported together on their own fields", (() => { const x = P({ sort: "zz", page: "0", category: "A B" }); return !x.ok && ["sort", "page", "category"].every((k) => k in x.fields); })());
check("C-01 a buyer may keep 500 saved products", R.SAVED_CAP === 500);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n" + failures.join("\n"));
  process.exit(1);
}
