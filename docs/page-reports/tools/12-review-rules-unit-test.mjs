// Unit tests for src/lib/reviews/rules.ts and rating.ts (pure modules, imported directly: node strips the types).
// Run: node docs/page-reports/tools/12-review-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const load = (file) => import(pathToFileURL(path.join(root, file)).href);
const rules = await load("src/lib/reviews/rules.ts");
const rating = await load("src/lib/reviews/rating.ts");
const { validateReviewInput, hasContactDetails, publicDisplayName, initialsOf, withinEditWindow, normaliseText, normaliseTitle, REVIEW_LIMITS, EDIT_WINDOW_DAYS } = rules;
const { averageRating, exactAverage, percentOf } = rating;

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const eq = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);

// ---------- rating arithmetic
eq("U-01 no ratings -> no average (null, never 0)", averageRating(0, 0), null);
eq("U-02 single 5 -> 5", averageRating(5, 1), 5);
eq("U-03 4.25 rounds half UP to 4.3", averageRating(17, 4), 4.3);
eq("U-04 4.35 -> 4.4 (a float would give 4.3)", averageRating(87, 20), 4.4);
eq("U-05 4.349 -> 4.3", averageRating(4349, 1000), 4.3);
eq("U-06 4.75 -> 4.8", averageRating(19, 4), 4.8);
eq("U-07 sum 25 of 5 reviews -> 5", averageRating(25, 5), 5);
eq("U-08 1.05 -> 1.1", averageRating(21, 20), 1.1);
eq("U-09 two reviews 5 and 4 -> 4.5", averageRating(9, 2), 4.5);
eq("U-10 three reviews 5,5,4 -> 4.7", averageRating(14, 3), 4.7);
eq("U-11 invalid input -> null", [averageRating(5, -1), averageRating(1.5, 2), averageRating(NaN, 3)], [null, null, null]);
eq("U-12 exact average keeps precision", exactAverage(14, 3), 14 / 3);
eq("U-13 exact average of nothing is null", exactAverage(0, 0), null);
eq("U-14 percent: 94 of 120 = 78", percentOf(94, 120), 78);
eq("U-15 percent: 1 of 120 = 1 (0.83 rounds up)", percentOf(1, 120), 1);
eq("U-16 percent: half rounds up (1 of 8 = 12.5 -> 13)", percentOf(1, 8), 13);
eq("U-17 percent: 0 of 0 = 0", percentOf(0, 0), 0);
eq("U-18 percent: all = 100", percentOf(7, 7), 100);
eq("U-19 percent of 1/3 = 33, 2/3 = 67", [percentOf(1, 3), percentOf(2, 3)], [33, 67]);

// ---------- validation
const good = { rating: 4, title: "Reliable and on time", text: "We ordered twice and both deliveries arrived on schedule with good quality.", categoryRatings: { "product-quality": 5 }, wouldRecommend: true };
const ok = validateReviewInput(good);
check("V-01 a valid review passes and is normalised", ok.ok && ok.value.rating === 4 && ok.value.categoryRatings["product-quality"] === 5 && ok.value.wouldRecommend === true);
const bad = (name, patch, field) => { const r = validateReviewInput({ ...good, ...patch }); check(name, !r.ok && field in r.fields, JSON.stringify(r.fields ?? "passed")); };
bad("V-02 missing rating", { rating: undefined }, "rating");
bad("V-03 rating 0", { rating: 0 }, "rating");
bad("V-04 rating 6", { rating: 6 }, "rating");
bad("V-05 rating 3.5", { rating: 3.5 }, "rating");
bad("V-06 rating text", { rating: "abc" }, "rating");
bad("V-07 rating null", { rating: null }, "rating");
bad("V-08 rating array", { rating: [5] }, "rating");
check("V-09 rating as digit text '5' is accepted as 5", validateReviewInput({ ...good, rating: "5" }).value?.rating === 5);
bad("V-10 title one char short", { title: "x".repeat(REVIEW_LIMITS.titleMin - 1) }, "title");
check("V-11 title at the minimum passes", validateReviewInput({ ...good, title: "x".repeat(REVIEW_LIMITS.titleMin) }).ok);
check("V-12 title at the maximum passes", validateReviewInput({ ...good, title: "x".repeat(REVIEW_LIMITS.titleMax) }).ok);
bad("V-13 title one char long", { title: "x".repeat(REVIEW_LIMITS.titleMax + 1) }, "title");
bad("V-14 title only spaces", { title: "     " }, "title");
bad("V-15 title not a string", { title: 12345 }, "title");
bad("V-16 text one char short", { text: "x".repeat(REVIEW_LIMITS.textMin - 1) }, "text");
check("V-17 text at the minimum passes", validateReviewInput({ ...good, text: "x".repeat(REVIEW_LIMITS.textMin) }).ok);
check("V-18 text at the maximum passes", validateReviewInput({ ...good, text: "x".repeat(REVIEW_LIMITS.textMax) }).ok);
bad("V-19 text one char long", { text: "x".repeat(REVIEW_LIMITS.textMax + 1) }, "text");
bad("V-20 unknown category key", { categoryRatings: { "made-up": 3 } }, "categoryRatings");
bad("V-21 category rating 0", { categoryRatings: { communication: 0 } }, "categoryRatings");
bad("V-22 category rating 6", { categoryRatings: { communication: 6 } }, "categoryRatings");
bad("V-23 category rating text", { categoryRatings: { communication: "great" } }, "categoryRatings");
bad("V-24 category ratings as an array", { categoryRatings: ["x"] }, "categoryRatings");
bad("V-25 category ratings as a string", { categoryRatings: "x" }, "categoryRatings");
check("V-26 category ratings may be left out", validateReviewInput({ ...good, categoryRatings: undefined }).ok && validateReviewInput({ ...good, categoryRatings: {} }).ok);
check("V-27 a partial set of categories is fine", validateReviewInput({ ...good, categoryRatings: { communication: 3, "value-for-money": 1 } }).ok);
bad("V-28 wouldRecommend must be a boolean", { wouldRecommend: "yes" }, "wouldRecommend");
check("V-29 wouldRecommend may be null or absent", validateReviewInput({ ...good, wouldRecommend: null }).value?.wouldRecommend === null && validateReviewInput({ ...good, wouldRecommend: undefined }).value?.wouldRecommend === null);
check("V-30 not an object at all -> every required field fails", ["rating", "title", "text"].every((f) => f in (validateReviewInput(null).fields ?? {})) && !validateReviewInput("x").ok && !validateReviewInput([]).ok);
check("V-31 client-controlled fields are not carried over", (() => { const r = validateReviewInput({ ...good, verifiedBuyer: true, status: "APPROVED", buyerId: "x", moderatedBy: "me", helpfulCount: 99 }); return r.ok && Object.keys(r.value).sort().join() === ["categoryRatings", "rating", "text", "title", "wouldRecommend"].join(); })());

// ---------- contact details and spam
for (const [label, text] of [["email", "Call me at someone@example.com for a better price on this order."], ["link", "Great supplier, see https://example.com/offer for details of the deal."], ["www link", "Great supplier, visit www.example.com for the deal they offered me."], ["phone", "Reach me on 98765 43210 and I will tell you all about the supplier."], ["phone +91", "Call +91 98765-43210 if you want to know about their delivery times."]]) {
  const r = validateReviewInput({ ...good, text });
  check(`C-01 contact details refused: ${label}`, !r.ok && /remove email addresses, phone numbers and links/.test(r.fields.text ?? ""));
}
check("C-02 title is checked too", !validateReviewInput({ ...good, title: "mail me a@b.co now please" }).ok);
check("C-03 ordinary numbers are fine (quantities, years, order sizes)", validateReviewInput({ ...good, text: "We ordered 2500 pieces in 2024 and the 3rd batch of 1200 pieces arrived in 12 days." }).ok);
check("C-04 negative opinions are not blocked", validateReviewInput({ ...good, rating: 1, title: "Very poor service", text: "The goods arrived late and damaged and nobody answered our calls for two weeks." }).ok);
check("C-05 hasContactDetails on clean text is false", hasContactDetails("Perfectly ordinary feedback about the quality of the fabric.") === false);

// ---------- text handling: safe to store, words never changed
eq("T-01 title collapses whitespace and control characters", normaliseTitle("  Good \t\n supplier\u0000 "), "Good supplier");
eq("T-02 text keeps single line breaks", normaliseText("one\ntwo"), "one\ntwo");
eq("T-03 text limits blank lines to one", normaliseText("a\n\n\n\nb"), "a\n\nb");
eq("T-04 text drops control characters but not words", normaliseText("hello\u0007 world"), "hello world");
eq("T-05 markup is left as written (it is rendered as plain text, never as HTML)", normaliseText("<b>bold</b> & <script>x</script>"), "<b>bold</b> & <script>x</script>");
check("T-06 a negative or abusive-looking word is not rewritten", normaliseText("This was terrible, awful, a scam") === "This was terrible, awful, a scam");

// ---------- public name
eq("N-01 two names -> first name and last initial", publicDisplayName("Priya Sharma"), "Priya S.");
eq("N-02 three names -> first and last initial", publicDisplayName("Amit Kumar Desai"), "Amit D.");
eq("N-03 one name stays", publicDisplayName("Rajesh"), "Rajesh");
eq("N-04 blank -> Buyer", publicDisplayName("   "), "Buyer");
eq("N-05 an email-like name never leaks beyond the first word", publicDisplayName("a@b.com"), "a@b.com");
eq("N-06 lower-case initial is upper-cased", publicDisplayName("meera iyer"), "meera I.");
eq("N-07 very long first name is cut", publicDisplayName("A".repeat(60) + " Z").length <= 28, true);
eq("N-08 initials", [initialsOf("Priya S."), initialsOf("Rajesh"), initialsOf("Buyer")], ["PS", "R", "B"]);

// ---------- edit window
const now = new Date("2026-11-10T10:00:00Z");
check("W-01 policy is 7 days", EDIT_WINDOW_DAYS === 7);
check("W-02 submitted today -> editable", withinEditWindow(new Date("2026-11-10T09:00:00Z"), now));
check("W-03 exactly 7 days old -> still editable (boundary included)", withinEditWindow(new Date("2026-11-03T10:00:00Z"), now));
check("W-04 7 days and 1 second -> locked", !withinEditWindow(new Date("2026-11-03T09:59:59Z"), now));
check("W-05 a month old -> locked", !withinEditWindow(new Date("2026-10-01T10:00:00Z"), now));

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log("FAILED:\n" + failures.join("\n"));
  process.exit(1);
}
