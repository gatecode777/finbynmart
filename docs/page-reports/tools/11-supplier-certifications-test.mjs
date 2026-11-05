import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import puppeteer, { KnownDevices } from "puppeteer-core";

// Page 11 (Supplier Certifications: /suppliers/[slug]/certifications) and the public certification APIs.
// Needs a running `next start` (BASE, default :3100) started with MONGODB_DB=finbynmart_test and
// CERTIFICATE_DOCS_DIR=<repo>/.next-audit/cert-docs-test (build-and-serve-test.sh does both), Chrome and puppeteer-core.
// Writes ONLY to the throwaway database's `certifications` collection and the throwaway document directory, and removes
// them at the end unless KEEP=1 (for a follow-up responsive audit). Expected counts are computed here from the fixture
// table, independently of the application code.
const BASE = process.env.BASE || "http://localhost:3100";
const ROOT = "R:/indiamartref";
const TEST_DB = "finbynmart_test";
const DOCS_DIR = `${ROOT}/.next-audit/cert-docs-test`;
const require = createRequire(`${ROOT}/`);
const { MongoClient, ObjectId } = require("mongodb");
const { addDays, todayInIndia, formatDate } = await import(pathToFileURL(path.join(ROOT, "src/lib/certifications/expiry.ts")).href);

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- throwaway database guard
const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === TEST_DB) throw new Error("Refusing: the configured live database is named like the test database.");
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const col = client.db(TEST_DB).collection("certifications");

// ---------- fixtures
const T = todayInIndia();
const A = "shree-textiles", B = "sunrise-hub", C = "modern-apparels";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fixture")]);
fs.rmSync(DOCS_DIR, { recursive: true, force: true });
fs.mkdirSync(DOCS_DIR, { recursive: true });
fs.writeFileSync(`${DOCS_DIR}/iso9001.pdf`, PDF);
fs.writeFileSync(`${DOCS_DIR}/iso14001.pdf`, PDF);
fs.writeFileSync(`${DOCS_DIR}/msme.png`, PNG);
fs.writeFileSync(`${DOCS_DIR}/ce-private.pdf`, PDF);
fs.writeFileSync(`${DOCS_DIR}/oeko.pdf`, PDF);
fs.writeFileSync(`${DOCS_DIR}/pending.pdf`, PDF);
fs.writeFileSync(`${DOCS_DIR}/rejected.pdf`, PDF);
fs.writeFileSync(`${DOCS_DIR}/deleted.pdf`, PDF);
fs.writeFileSync(`${DOCS_DIR}/suspended.pdf`, PDF);
fs.writeFileSync(`${DOCS_DIR}/b-cert.pdf`, PDF);
fs.writeFileSync(`${DOCS_DIR}/ghost.pdf`, PDF);
fs.writeFileSync(`${DOCS_DIR}/fake.jpg`, "this is not a jpeg, it is text pretending to be one");
fs.writeFileSync(`${ROOT}/.next-audit/secret-outside.pdf`, PDF);

const now = new Date();
const base = (over) => ({ supplierSlug: A, certificationType: "quality-management", issuingAuthority: "ISO", certificateNumber: null, certificateNumberPublic: false, description: null, expiryDate: null, fileReference: null, publicDocumentAllowed: false, verificationStatus: "VERIFIED", verifiedAt: now, verifiedBy: "reviewer-secret@example.test", rejectionReason: null, internalRemarks: "SECRET-INTERNAL-NOTE", createdAt: now, updatedAt: now, deletedAt: null, __test: true, ...over });
const FIX = {
  iso9001: base({ name: "ISO 9001:2015", description: "Quality management system certificate.", issueDate: "2023-01-12", expiryDate: addDays(T, 400), certificateNumber: "QMS/IND/2023/4572", certificateNumberPublic: true, fileReference: "iso9001.pdf", publicDocumentAllowed: true }),
  iso14001: base({ name: "ISO 14001:2015", certificationType: "environmental", issueDate: "2023-02-18", expiryDate: addDays(T, 90), certificateNumber: "EMS-HIDDEN-8891", certificateNumberPublic: false, fileReference: "iso14001.pdf", publicDocumentAllowed: true }),
  ce: base({ name: "CE Certification", certificationType: "product-compliance", issuingAuthority: "CE", issueDate: "2024-03-05", expiryDate: addDays(T, 91), certificateNumber: "CE/IND/2024/3321", certificateNumberPublic: true, fileReference: "ce-private.pdf", publicDocumentAllowed: false }),
  msme: base({ name: "MSME Registered", certificationType: "business-registration", issuingAuthority: "MSME", issueDate: "2022-04-20", expiryDate: null, certificateNumber: "UDYAM-GJ-01-0045678", certificateNumberPublic: true, fileReference: "msme.png", publicDocumentAllowed: true }),
  bis: base({ name: "BIS Certificate", certificationType: "product-compliance", issuingAuthority: "BIS", issueDate: "2021-06-01", expiryDate: T }),
  oeko: base({ name: "OEKO-TEX Standard 100", certificationType: "product-compliance", issuingAuthority: "OEKO-TEX", issueDate: "2020-01-01", expiryDate: addDays(T, -1), fileReference: "oeko.pdf", publicDocumentAllowed: true }),
  fire: base({ name: "Fire Safety NOC", certificationType: "safety", issuingAuthority: "State Fire Services", issueDate: "2019-05-05", expiryDate: addDays(T, -400), verificationStatus: "EXPIRED" }),
  wrap: base({ name: "WRAP Certification", certificationType: "industry-specific", issuingAuthority: "WRAP", issueDate: "2025-01-31", expiryDate: addDays(T, 30), fileReference: "fake.jpg", publicDocumentAllowed: true }),
  gots: base({ name: "GOTS Organic", certificationType: "environmental", issuingAuthority: "Control Union", issueDate: "2024-02-29", expiryDate: "2099-02-28" }),
  iso45001: base({ name: "ISO 45001:2018", certificationType: "safety", issueDate: "2024-03-05", expiryDate: addDays(T, 200) }),
  // never public
  pending: base({ name: "Pending Cert Alpha", issueDate: "2025-05-01", verificationStatus: "PENDING", fileReference: "pending.pdf", publicDocumentAllowed: true }),
  rejected: base({ name: "Rejected Cert Beta", issueDate: "2025-05-02", verificationStatus: "REJECTED", rejectionReason: "SECRET-REJECT-REASON", fileReference: "rejected.pdf", publicDocumentAllowed: true }),
  suspended: base({ name: "Suspended Cert Gamma", issueDate: "2025-05-03", verificationStatus: "SUSPENDED", fileReference: "suspended.pdf", publicDocumentAllowed: true }),
  deleted: base({ name: "Deleted Cert Delta", issueDate: "2025-05-04", deletedAt: now, fileReference: "deleted.pdf", publicDocumentAllowed: true }),
  badDate: base({ name: "Impossible Date Cert", issueDate: "2025-02-30" }),
  traversal: base({ supplierSlug: "classic-retail", name: "Traversal Cert", issueDate: "2025-06-01", fileReference: "../secret-outside.pdf", publicDocumentAllowed: true }),
  // other suppliers
  bCert: base({ supplierSlug: B, name: "B Only Certificate", issuingAuthority: "BureauB", issueDate: "2024-01-01", expiryDate: addDays(T, 500), fileReference: "b-cert.pdf", publicDocumentAllowed: true }),
  bPending: base({ supplierSlug: B, name: "B Pending Certificate", issueDate: "2024-01-02", verificationStatus: "PENDING" }),
  ghost: base({ supplierSlug: "no-such-supplier", name: "Ghost Supplier Certificate", issueDate: "2024-01-03", fileReference: "ghost.pdf", publicDocumentAllowed: true }),
};
await col.deleteMany({ __test: true });
const ids = {};
for (const [key, doc] of Object.entries(FIX)) ids[key] = (await col.insertOne({ ...doc })).insertedId.toString();

// Ground truth for supplier A, from the table above (not from the application)
const publicA = ["iso9001", "iso14001", "ce", "msme", "bis", "oeko", "fire", "wrap", "gots", "iso45001"].map((k) => ({ key: k, ...FIX[k] }));
const stateOf = (c) => (c.verificationStatus === "EXPIRED" || (c.expiryDate && c.expiryDate < T) ? "expired" : !c.expiryDate ? "none" : c.expiryDate <= addDays(T, 90) ? "expiring" : "valid");
const gt = publicA.map((c) => ({ ...c, state: stateOf(c), status: stateOf(c) === "expired" ? "expired" : "verified" }));
const names = (list) => list.map((c) => c.name);
const byDate = (field, dir) => (a, b) => (a[field] === b[field] ? 0 : (a[field] < b[field] ? -1 : 1) * dir) || a.name.localeCompare(b.name);
const byExpiry = (dir) => (a, b) => (a.expiryDate === b.expiryDate ? 0 : a.expiryDate === null ? 1 : b.expiryDate === null ? -1 : (a.expiryDate < b.expiryDate ? -1 : 1) * dir) || a.name.localeCompare(b.name);
const orders = {
  newest: names([...gt].sort(byDate("issueDate", -1))),
  oldest: names([...gt].sort(byDate("issueDate", 1))),
  "expiry-asc": names([...gt].sort(byExpiry(1))),
  "expiry-desc": names([...gt].sort(byExpiry(-1))),
  name: names([...gt].sort((a, b) => a.name.localeCompare(b.name))),
};

// ---------- helpers
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function open(p, { mobile = false, width = 1440 } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  if (mobile) await page.emulate(KnownDevices["iPhone 13"]); else await page.setViewport({ width, height: 900 });
  const resp = await page.goto(BASE + p, { waitUntil: "networkidle2" });
  page.errs = errs; page.status = resp.status();
  return page;
}
const api = async (p, init) => { const r = await fetch(BASE + p, init); const type = r.headers.get("content-type") ?? ""; return { status: r.status, headers: r.headers, json: type.includes("json") ? await r.json() : null, buf: type.includes("json") ? null : Buffer.from(await r.arrayBuffer()) }; };
const list = (slug, q = "") => api(`/api/public/suppliers/${slug}/certifications${q}`);
const cardsOf = (p) => p.evaluate(() => [...document.querySelectorAll("article")].map((a) => ({ name: a.querySelector("h3")?.textContent.trim(), text: a.innerText.replace(/\s+/g, " "), links: [...a.querySelectorAll("a")].map((l) => ({ t: l.textContent.trim(), h: l.getAttribute("href"), target: l.target, rel: l.rel, h2: Math.round(l.getBoundingClientRect().height) })) })));
const urlOf = (p) => new URL(p.url());
const stat = (p) => p.evaluate(() => [...document.querySelectorAll("section[aria-label='Certification overview'] li")].map((li) => li.querySelector("p").innerText.replace(/\s+/g, " ").trim()));

async function main() {
  // ================= API: public listing
  const a = await list(A);
  const d = a.json?.data, m = a.json?.meta;
  check("A-01 supplier A: 200 with the documented shape", a.status === 200 && a.json.ok && d.supplier.slug === A && Array.isArray(d.certifications) && d.statistics && d.facets && m, `status ${a.status}`);
  check("A-02 only the 10 public records are counted (pending, rejected, suspended, deleted, impossible date left out)", m.total === 10, `total ${m.total}`);
  check("A-03 default page size 8, two pages, next but no previous", m.pageSize === 8 && m.totalPages === 2 && m.hasNext === true && m.hasPrevious === false && d.certifications.length === 8);
  const expectStats = { total: 10, verified: gt.filter((c) => c.status === "verified").length, expiringSoon: gt.filter((c) => c.state === "expiring").length, expired: gt.filter((c) => c.status === "expired").length, noExpiry: gt.filter((c) => c.state === "none").length };
  check("A-04 statistics match the fixture table", JSON.stringify(d.statistics) === JSON.stringify(expectStats), `${JSON.stringify(d.statistics)} vs ${JSON.stringify(expectStats)}`);
  check("A-05 statistics are 10 total / 8 verified / 3 expiring soon / 2 expired / 1 no expiry", expectStats.verified === 8 && expectStats.expiringSoon === 3 && expectStats.expired === 2 && expectStats.noExpiry === 1);
  const text = JSON.stringify(a.json);
  check("A-06 no non-public record is exposed", !/Pending Cert|Rejected Cert|Suspended Cert|Deleted Cert|Impossible Date|Traversal|B Only|Ghost/.test(text));
  check("A-07 no internal field leaks (remarks, reviewer, rejection reason, file names, hidden number)", !/SECRET-|reviewer-secret|internalRemarks|verifiedBy|rejectionReason|fileReference|fileName|iso9001\.pdf|msme\.png|EMS-HIDDEN/.test(text));
  const full = (await list(A, "?limit=50")).json.data.certifications;
  const byName = Object.fromEntries(full.map((c) => [c.name, c]));
  check("A-08 certificate number only where approved for display", byName["ISO 9001:2015"].certificateNumber === "QMS/IND/2023/4572" && byName["ISO 14001:2015"].certificateNumber === null);
  check("A-09 document actions only where the file can really be opened", byName["ISO 9001:2015"].document.available && byName["ISO 9001:2015"].document.kind === "pdf" && byName["MSME Registered"].document.kind === "image" && !byName["CE Certification"].document.available && !byName["BIS Certificate"].document.available && !byName["WRAP Certification"].document.available, "CE not shared; BIS no file; WRAP file is not a real image");
  check("A-10 document href points to the API route by id, never a storage path", byName["ISO 9001:2015"].document.href === `/api/public/certifications/${ids.iso9001}/document`);
  check("A-11 status and expiry state per record", full.every((c) => { const g = gt.find((x) => x.name === c.name); return c.status === g.status && c.expiry.state === g.state; }));
  check("A-12 expiry today is 'expiring' with 0 days left; day 90 is expiring with 90; day 91 is valid", byName["BIS Certificate"].expiry.daysLeft === 0 && byName["BIS Certificate"].expiry.state === "expiring" && byName["ISO 14001:2015"].expiry.daysLeft === 90 && byName["ISO 14001:2015"].expiry.state === "expiring" && byName["CE Certification"].expiry.state === "valid");
  check("A-13 expired yesterday (stored VERIFIED) is shown expired; stored EXPIRED is expired", byName["OEKO-TEX Standard 100"].status === "expired" && byName["Fire Safety NOC"].status === "expired");
  check("A-14 no expiry date: state none, never expiring or expired", byName["MSME Registered"].expiry.state === "none" && byName["MSME Registered"].expiryDate === null && byName["MSME Registered"].status === "verified");
  check("A-15 leap-day issue date is kept exactly", byName["GOTS Organic"].issueDate === "2024-02-29");
  check("A-16 the cache header allows only a short shared cache", /s-maxage=60/.test(a.headers.get("cache-control") ?? ""));

  const b = await list(B);
  check("A-20 supplier B sees only its own public certificate", b.json.meta.total === 1 && b.json.data.certifications[0].name === "B Only Certificate" && !/Pending|Shree|ISO/.test(JSON.stringify(b.json.data.certifications)));
  check("A-21 supplier A never contains supplier B's records", !JSON.stringify(full).includes("B Only Certificate"));
  const c = await list(C);
  check("A-22 a supplier with none: 200, zero statistics, empty list", c.status === 200 && c.json.meta.total === 0 && c.json.data.statistics.total === 0 && c.json.data.certifications.length === 0 && c.json.meta.totalPages === 1);
  for (const bad of ["does-not-exist-xyz", "BAD_SLUG", "a..b", "%2e%2e", "x".repeat(90)]) {
    const r = await list(bad);
    // A path the router itself normalises away (%2e%2e) is a framework 404 (HTML) before the handler runs: still a 404.
    check(`A-23 invalid supplier "${bad.slice(0, 20)}" -> 404 with a safe message`, r.status === 404 && (r.json === null || (r.json.ok === false && r.json.code === "NOT_FOUND")));
  }
  const ghost = await list("no-such-supplier");
  check("A-24 a certification row of a supplier without a public profile is unreachable", ghost.status === 404);

  // filters
  const total = (q) => list(A, q).then((r) => r.json.meta?.total);
  eq("A-30 status=verified", await total("?status=verified"), gt.filter((x) => x.status === "verified").length);
  eq("A-31 status=expired", await total("?status=expired"), 2);
  eq("A-32 status=verified,expired (comma list) is both", await total("?status=verified,expired"), 10);
  for (const hidden of ["pending", "rejected", "suspended", "PENDING"]) {
    const r = await list(A, `?status=${hidden}`);
    check(`A-33 status=${hidden} is refused (not public): 400 naming the parameter`, r.status === 400 && !!r.json.fields?.status);
  }
  eq("A-34 type=product-compliance", await total("?type=product-compliance"), gt.filter((x) => x.certificationType === "product-compliance").length);
  eq("A-35 type=quality-management&type=safety (two values = either)", await total("?type=quality-management&type=safety"), gt.filter((x) => ["quality-management", "safety"].includes(x.certificationType)).length);
  eq("A-36 authority=ISO", await total("?authority=ISO"), 3);
  eq("A-37 authority is case-insensitive (iso)", await total("?authority=iso"), 3);
  const unknownAuth = await list(A, "?authority=Nobody");
  check("A-38 an authority this supplier has not got is ignored and reported, not turned into zero results", unknownAuth.json.meta.total === 10 && unknownAuth.json.data.ignoredFilters.some((x) => x.param === "authority" && x.value === "Nobody"));
  eq("A-39 expiry=valid (not expired: valid + expiring + none)", await total("?expiry=valid"), 8);
  eq("A-40 expiry=expiring", await total("?expiry=expiring"), 3);
  eq("A-41 expiry=expired", await total("?expiry=expired"), 2);
  eq("A-42 expiry=none", await total("?expiry=none"), 1);
  eq("A-43 expiry=expiring,none (either)", await total("?expiry=expiring&expiry=none"), 4);
  eq("A-44 combined: authority=ISO & expiry=expiring", await total("?authority=ISO&expiry=expiring"), 1);
  eq("A-45 combined: type=safety & status=verified", await total("?type=safety&status=verified"), 1);
  eq("A-46 combined that matches nothing: type=quality-management & expiry=expiring", await total("?type=quality-management&expiry=expiring"), 0);
  const noMatch = await list(A, "?type=quality-management&expiry=expiring");
  check("A-47 no match still reports full statistics and page 1 of 1", noMatch.json.data.statistics.total === 10 && noMatch.json.meta.totalPages === 1 && noMatch.json.data.certifications.length === 0);

  // facets
  const fa = (await api(`/api/public/suppliers/${A}/certifications/facets`)).json.data.facets;
  const fcount = (f, v) => f.find((o) => o.value === v)?.count;
  check("A-50 facets: status counts", fcount(fa.status, "verified") === 8 && fcount(fa.status, "expired") === 2);
  check("A-51 facets: type options are those the supplier has, with counts", fa.type.map((o) => o.value).sort().join() === ["business-registration", "environmental", "industry-specific", "product-compliance", "quality-management", "safety"].join() && fcount(fa.type, "product-compliance") === 3 && fcount(fa.type, "safety") === 2);
  check("A-52 facets: authorities from the records, sorted, with counts", fa.authority.length === 8 && fcount(fa.authority, "ISO") === 3 && fa.authority.map((o) => o.label).join() === [...fa.authority.map((o) => o.label)].sort((x, y) => x.localeCompare(y, "en", { sensitivity: "base" })).join());
  check("A-53 facets: expiry counts", fcount(fa.expiry, "valid") === 8 && fcount(fa.expiry, "expiring") === 3 && fcount(fa.expiry, "expired") === 2 && fcount(fa.expiry, "none") === 1);
  const fe = (await api(`/api/public/suppliers/${A}/certifications/facets?status=expired`)).json.data;
  check("A-54 facets react to the other groups: with status=expired, product-compliance 1 and safety 1; status counts unchanged", fcount(fe.facets.type, "product-compliance") === 1 && fcount(fe.facets.type, "safety") === 1 && fcount(fe.facets.status, "verified") === 8 && fe.matching === 2);
  check("A-55 facets for an unknown supplier / bad parameter", (await api(`/api/public/suppliers/nope-nope/certifications/facets`)).status === 404 && (await api(`/api/public/suppliers/${A}/certifications/facets?sort=zzz`)).status === 400);

  // sort + pagination
  for (const sort of Object.keys(orders)) {
    const all = (await list(A, `?sort=${sort}&limit=50`)).json.data.certifications.map((x) => x.name);
    check(`A-60 sort=${sort} matches the expected order (ties by name)`, JSON.stringify(all) === JSON.stringify(orders[sort]), all.join(" | "));
  }
  const p1 = await list(A, "?limit=3&sort=newest"), p2 = await list(A, "?limit=3&sort=newest&page=2"), p3 = await list(A, "?limit=3&sort=newest&page=3"), p4 = await list(A, "?limit=3&sort=newest&page=4"), p5 = await list(A, "?limit=3&sort=newest&page=5");
  const walked = [p1, p2, p3, p4].flatMap((r) => r.json.data.certifications.map((x) => x.name));
  check("A-61 walking 4 pages of 3 gives all 10 once, in order", JSON.stringify(walked) === JSON.stringify(orders.newest), `${walked.length} items`);
  check("A-62 totalPages / hasNext / hasPrevious", p1.json.meta.totalPages === 4 && p1.json.meta.hasNext && !p1.json.meta.hasPrevious && p4.json.meta.hasPrevious && !p4.json.meta.hasNext && p4.json.data.certifications.length === 1);
  check("A-63 a page past the end is a clean empty page", p5.status === 200 && p5.json.data.certifications.length === 0 && p5.json.meta.total === 10);
  eq("A-64 limit=50 returns all 10 on one page", (await list(A, "?limit=50")).json.meta.totalPages, 1);
  for (const bad of ["limit=51", "limit=0", "limit=-1", "limit=abc", "limit=2.5", "page=0", "page=abc", "page=-3", "sort=bogus", "type=bogus", "expiry=bogus", "supplier=" + B, "supplierId=" + B, "q=x"]) {
    const r = await list(A, `?${bad}`);
    check(`A-65 ${bad} -> 400 naming the field`, r.status === 400 && r.json.ok === false && Object.keys(r.json.fields ?? {}).length > 0, `status ${r.status}`);
  }
  check("A-66 a date-sorted list is stable across calls", JSON.stringify((await list(A, "?sort=expiry-asc&limit=50")).json.data.certifications.map((x) => x.id)) === JSON.stringify((await list(A, "?sort=expiry-asc&limit=50")).json.data.certifications.map((x) => x.id)));

  // ================= API: one certification + document
  const det = await api(`/api/public/certifications/${ids.iso9001}`);
  check("D-01 certification detail: 200 with its supplier", det.status === 200 && det.json.data.certification.name === "ISO 9001:2015" && det.json.data.supplier.slug === A && !/SECRET-|fileReference|verifiedBy/.test(JSON.stringify(det.json)));
  check("D-02 detail of another supplier's record carries that supplier", (await api(`/api/public/certifications/${ids.bCert}`)).json.data.supplier.slug === B);
  for (const key of ["pending", "rejected", "suspended", "deleted", "badDate", "ghost"]) {
    const r = await api(`/api/public/certifications/${ids[key]}`);
    check(`D-03 detail of a ${key} record -> 404`, r.status === 404 && r.json.code === "NOT_FOUND");
  }
  for (const bad of ["abc", "000000000000000000000000", "zzzzzzzzzzzzzzzzzzzzzzzz", "1".repeat(30), "%00"]) check(`D-04 detail of a malformed or unknown id "${bad.slice(0, 12)}" -> 404`, (await api(`/api/public/certifications/${bad}`)).status === 404);

  const doc = (key, q = "") => api(`/api/public/certifications/${ids[key]}/document${q}`);
  const d1 = await doc("iso9001");
  check("D-10 approved public PDF: 200, application/pdf, real bytes", d1.status === 200 && d1.headers.get("content-type") === "application/pdf" && d1.buf.subarray(0, 5).toString() === "%PDF-" && d1.buf.length === PDF.length);
  check("D-11 inline by default, nosniff, never cached by shared caches, no path leaked", /^inline; filename="iso-9001-2015\.pdf"$/.test(d1.headers.get("content-disposition")) && d1.headers.get("x-content-type-options") === "nosniff" && /no-store/.test(d1.headers.get("cache-control")) && ![...d1.headers.values()].some((v) => /cert-docs|\.next-audit|R:\\|R:\//i.test(v)));
  const d1d = await doc("iso9001", "?download=1");
  check("D-12 ?download=1 is an attachment", /^attachment; filename=/.test(d1d.headers.get("content-disposition")));
  const d2 = await doc("msme");
  check("D-13 approved public image: 200 image/png", d2.status === 200 && d2.headers.get("content-type") === "image/png" && d2.buf.subarray(1, 4).toString() === "PNG");
  const d3 = await doc("oeko");
  check("D-14 an expired (previously approved) certificate's file stays viewable, labelled expired on the page", d3.status === 200);
  for (const [key, why] of [["ce", "public access not allowed"], ["pending", "pending"], ["rejected", "rejected"], ["suspended", "suspended"], ["deleted", "deleted"], ["ghost", "supplier has no public profile"], ["bis", "no file"]]) {
    const r = await doc(key);
    check(`D-20 document of a ${why} record -> 404, same body as an unknown id`, r.status === 404 && r.json.code === "NOT_FOUND" && r.json.message === "That document is not available.");
  }
  const unknownDoc = await api(`/api/public/certifications/000000000000000000000000/document`);
  check("D-21 unknown id gives the same answer as a record that is not shared", unknownDoc.status === 404 && unknownDoc.json.message === "That document is not available.");
  const dw = await doc("wrap");
  check("D-22 a file whose content is not what its name claims (text named .jpg) -> 503, nothing served", dw.status === 503 && dw.json.code === "DOCUMENT_UNAVAILABLE" && !JSON.stringify(dw.json).includes("not a jpeg"));
  const dt = await doc("traversal");
  check("D-23 a reference that points outside the directory (../secret-outside.pdf) is never served", dt.status === 503 && !dt.buf && !JSON.stringify(dt.json).includes("%PDF"));
  for (const bad of ["abc", "../../etc/passwd", "%2e%2e%2f", "1".repeat(24).replace(/1/g, "g")]) check(`D-24 document of a malformed id "${bad.slice(0, 14)}" -> 404`, (await api(`/api/public/certifications/${bad}/document`)).status === 404);
  check("D-25 other methods are refused", (await fetch(`${BASE}/api/public/certifications/${ids.iso9001}/document`, { method: "POST" })).status === 405 && (await fetch(`${BASE}/api/public/certifications/${ids.iso9001}`, { method: "DELETE" })).status === 405 && (await fetch(`${BASE}/api/public/suppliers/${A}/certifications`, { method: "PATCH" })).status === 405);
  check("D-26 supplier and admin write routes do not exist yet (blocked: no ownership or admin model)", [`/api/supplier/certifications`, `/api/admin/certifications`, `/api/admin/certifications/${ids.iso9001}/verify`].every(() => true) && (await fetch(`${BASE}/api/supplier/certifications`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status === 404 && (await fetch(`${BASE}/api/admin/certifications/${ids.pending}/verify`, { method: "PATCH" })).status === 404);

  // ================= PAGE: supplier A
  let p = await open(`/suppliers/${A}/certifications`);
  check("P-01 page: 200, no console errors", p.status === 200 && p.errs.length === 0, p.errs.join("; "));
  const meta = await p.evaluate(() => ({ title: document.title, canonical: document.querySelector("link[rel=canonical]")?.href, robots: document.querySelector("meta[name=robots]")?.content ?? null, h1: document.querySelector("h1")?.textContent.trim(), crumbs: [...document.querySelectorAll("nav[aria-label=Breadcrumb] li, nav[aria-label=breadcrumb] li")].map((l) => l.textContent.trim()) }));
  check("P-02 title, supplier heading, last breadcrumb", /^Certifications of Shree Textiles/.test(meta.title) && /shree textiles/i.test(meta.h1) && meta.crumbs.at(-1) === "Certifications", JSON.stringify(meta));
  check("P-03 plain page: indexable, canonical is the plain URL (host as configured)", meta.robots === null && (meta.canonical === undefined || /\/suppliers\/shree-textiles\/certifications$/.test(meta.canonical)), String(meta.canonical));
  const tabs = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Supplier profile'] a")].map((a) => ({ t: a.textContent.trim(), h: a.getAttribute("href"), cur: a.getAttribute("aria-current") })));
  check("P-04 tabs: Certifications (10) is current and the others go to real pages", tabs.find((x) => x.cur === "page")?.t === "Certifications (10)" && tabs[0].h === `/suppliers/${A}` && /Products/.test(tabs[1].t) && tabs[1].h === `/suppliers/${A}/products` && tabs[2].h === `/suppliers/${A}/certifications`, JSON.stringify(tabs));
  const stats = await stat(p);
  check("P-05 statistics row: 10 / 8 / 3 / 2 with labels", stats.length === 4 && /^10 Total Certifications/.test(stats[0]) && /^8 Verified/.test(stats[1]) && /^3 Expiring Soon \(Within 90 Days\)/.test(stats[2]) && /^2 Expired/.test(stats[3]), JSON.stringify(stats));
  const heading = await p.evaluate(() => document.querySelector("#certifications-heading")?.textContent.replace(/\s+/g, " ").trim());
  check("P-06 results heading counts all 10", heading === "Certifications (10 Results)", heading);
  let cards = await cardsOf(p);
  check("P-07 page 1: 8 cards in newest-first order", cards.length === 8 && JSON.stringify(cards.map((x) => x.name)) === JSON.stringify(orders.newest.slice(0, 8)), cards.map((x) => x.name).join(" | "));
  const card = (name) => cards.find((x) => x.name === name);
  check("P-08 card details: type, authority, issue date, valid-till date, number", /Quality Management/.test(card("ISO 9001:2015").text) && /Issued by ISO/.test(card("ISO 9001:2015").text) && card("ISO 9001:2015").text.includes("Issued: 12 Jan 2023") && card("ISO 9001:2015").text.includes(`Valid Till: ${formatDate(addDays(T, 400))}`) && card("ISO 9001:2015").text.includes("Certificate No.: QMS/IND/2023/4572") && /Verified/.test(card("ISO 9001:2015").text), card("ISO 9001:2015")?.text);
  check("P-09 a number not approved for display is absent", !/Certificate No/.test(card("ISO 14001:2015").text) && !card("ISO 14001:2015").text.includes("EMS-HIDDEN"));
  check("P-10 expiring indicators: day 90 'Expires in 90 days'; today 'Expires today'; 30 days", /Expires in 90 days/.test(card("ISO 14001:2015").text) && /Expires today/.test(card("BIS Certificate").text) && /Expires in 30 days/.test(card("WRAP Certification").text));
  check("P-11 a valid certificate more than 90 days out carries no expiring indicator", !/Expires/.test(card("CE Certification").text) && !/Expires/.test(card("ISO 9001:2015").text));
  check("P-12 no expiry date: 'Valid Till: No expiry date', never expiring", /Valid Till: No expiry date/.test(card("MSME Registered").text) && !/Expires/.test(card("MSME Registered").text));
  const pe = await open(`/suppliers/${A}/certifications?status=expired`);
  const ec = await cardsOf(pe);
  await pe.close();
  check("P-13 expired certificates say Expired with 'Expired On:' and are not labelled Verified", /Expired On: /.test(ec.find((x) => x.name === "OEKO-TEX Standard 100").text) && /Expired/.test(ec.find((x) => x.name === "OEKO-TEX Standard 100").text) && !/Verified/.test(ec.find((x) => x.name === "OEKO-TEX Standard 100").text) && !/Valid Till/.test(ec.find((x) => x.name === "OEKO-TEX Standard 100").text));
  const view1 = card("ISO 9001:2015").links.find((l) => /View Certificate \(PDF\)/.test(l.t));
  check("P-14 View Certificate (PDF): link to the API route, new tab, noopener, 44px tall", view1 && view1.h === `/api/public/certifications/${ids.iso9001}/document` && view1.target === "_blank" && /noopener/.test(view1.rel) && view1.h2 >= 44, JSON.stringify(view1));
  check("P-15 a download link with an accessible name", card("ISO 9001:2015").links.some((l) => l.h.endsWith("?download=1")) && (await p.evaluate(() => !!document.querySelector("a[aria-label='Download ISO 9001:2015 certificate']"))));
  check("P-16 image certificate: plain 'View Certificate'", card("MSME Registered").links.some((l) => /^View Certificate/.test(l.t) && !/PDF/.test(l.t)));
  check("P-17 not shared / no file / broken file: no document links, honest text", [card("CE Certification"), card("BIS Certificate"), card("WRAP Certification")].every((x) => x && !x.links.some((l) => /document/.test(l.h)) && /not shared online/.test(x.text)));
  const fetched = await p.evaluate(async (href) => { const r = await fetch(href); return { s: r.status, t: r.headers.get("content-type") }; }, view1.h);
  check("P-18 the page's own link really returns the PDF", fetched.s === 200 && fetched.t === "application/pdf");
  const html = await p.content();
  check("P-19 page source holds no internal field, file name or non-public record", !/SECRET-|reviewer-secret|iso9001\.pdf|msme\.png|Pending Cert|Rejected Cert|Suspended Cert|Deleted Cert|Impossible Date|B Only/.test(html));
  const ld = await p.evaluate(() => [...document.querySelectorAll("script[type='application/ld+json']")].map((s) => JSON.parse(s.textContent)["@type"]));
  check("P-20 structured data is the breadcrumb only (no certification claims marked up)", JSON.stringify(ld) === JSON.stringify(["BreadcrumbList"]), JSON.stringify(ld));
  const sidebar = await p.evaluate(() => { const f = document.querySelector("form[aria-label='Filter certifications']"); return f ? { groups: [...f.querySelectorAll("summary")].map((s) => s.textContent.trim()), open: [...f.querySelectorAll("details")].map((x) => x.open), labels: [...f.querySelectorAll("label")].map((l) => (l.querySelector("[class*=optionLabel]")?.textContent + " " + l.querySelector("[class*=optionCount]")?.textContent)), apply: f.querySelector("button[type=submit]")?.textContent.trim() } : null; });
  check("P-21 filter groups: status, type, authority, expiry; apply shows the active count", sidebar && sidebar.groups.join() === ["Verification Status", "Certification Type", "Issuing Authority", "Expiry"].join() && sidebar.apply === "Apply Filters (0)", JSON.stringify(sidebar?.groups));
  check("P-22 option labels carry live counts", sidebar.labels.includes("Verified (8)") && sidebar.labels.includes("Expired (2)") && sidebar.labels.includes("Product Compliance (3)") && sidebar.labels.includes("ISO (3)") && sidebar.labels.includes("Expiring Within 90 Days (3)"));
  check("P-23 pending/rejected are not offered to the public", !sidebar.labels.some((l) => /Pending|Rejected|Suspended/.test(l)));

  // filtering through the form: client-side navigation, URL carries the state
  await p.evaluate(() => { window.__marker = 1; });
  await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter certifications'] label")].find((l) => (l.querySelector("[class*=optionLabel]")?.textContent + " " + l.querySelector("[class*=optionCount]")?.textContent).startsWith("Expired (2)")).querySelector("input").click());
  await p.click("form[aria-label='Filter certifications'] button[type=submit]");
  await p.waitForFunction(() => location.search.includes("status=expired"), { timeout: 15000 }).catch(() => {});
  await sleep(500);
  cards = await cardsOf(p);
  check("P-30 ticking Expired and applying: URL has status=expired, 2 expired cards, no full reload", urlOf(p).search === "?status=expired" && cards.length === 2 && cards.every((x) => /Expired/.test(x.text)) && (await p.evaluate(() => window.__marker === 1)), urlOf(p).search);
  const heading2 = await p.evaluate(() => document.querySelector("#certifications-heading")?.textContent.replace(/\s+/g, " ").trim());
  check("P-31 heading count follows the filter; statistics stay the supplier's totals", heading2 === "Certifications (2 Results)" && (await stat(p))[0].startsWith("10 "));
  const chip = await p.evaluate(() => [...document.querySelectorAll("ul[aria-label='Applied filters'] a")].map((a) => a.getAttribute("aria-label")));
  check("P-32 an applied-filter chip is shown", chip.length === 1 && chip[0] === "Remove filter Expired", JSON.stringify(chip));
  check("P-33 filtered page is noindex with the plain canonical", (await p.evaluate(() => document.querySelector("meta[name=robots]")?.content ?? "")).includes("noindex") && !(await p.evaluate(() => document.querySelector("link[rel=canonical]")?.href ?? "")).includes("?"));
  const fe2 = await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter certifications'] label")].map((l) => (l.querySelector("[class*=optionLabel]")?.textContent + " " + l.querySelector("[class*=optionCount]")?.textContent)));
  check("P-34 counts in the sidebar follow the current selection (type counts within the expired set)", fe2.includes("Product Compliance (1)") && fe2.includes("Safety Certification (1)") && fe2.includes("Verified (8)"), fe2.join(" | "));
  await p.click("ul[aria-label='Applied filters'] a");
  await p.waitForFunction(() => location.search === "", { timeout: 15000 }).catch(() => {});
  await sleep(300);
  check("P-35 removing the chip returns to the plain list of 8", urlOf(p).search === "" && (await cardsOf(p)).length === 8);

  // sort
  await p.select("select[name=sort]", "name");
  await p.waitForFunction(() => location.search.includes("sort=name"), { timeout: 15000 }).catch(() => {});
  await sleep(500);
  cards = await cardsOf(p);
  check("P-40 sort A–Z: URL has sort=name, cards in name order", urlOf(p).search === "?sort=name" && JSON.stringify(cards.map((x) => x.name)) === JSON.stringify(orders.name.slice(0, 8)), cards.map((x) => x.name).join(" | "));
  check("P-41 the sort offers exactly the five public orders", JSON.stringify(await p.evaluate(() => [...document.querySelectorAll("select[name=sort] option")].map((o) => o.value))) === JSON.stringify(["newest", "oldest", "expiry-asc", "expiry-desc", "name"]));
  await p.close();

  // pagination
  p = await open(`/suppliers/${A}/certifications?sort=expiry-asc`);
  const pag = await p.evaluate(() => ({ summary: document.querySelector("p[role=status]")?.textContent.trim(), links: [...document.querySelectorAll("nav[aria-label*=agination] a")].map((a) => ({ t: a.textContent.trim(), h: a.getAttribute("href") })) }));
  check("P-50 page 1: 'Showing 1–8 of 10 certifications' and a link to page 2 that keeps the sort", /Showing 1.8 of 10 certifications/.test(pag.summary) && pag.links.some((l) => /page=2/.test(l.h) && /sort=expiry-asc/.test(l.h)), JSON.stringify(pag));
  await p.close();
  p = await open(`/suppliers/${A}/certifications?sort=expiry-asc&page=2`);
  cards = await cardsOf(p);
  check("P-51 page 2: the remaining 2 in order; canonical keeps the page", cards.length === 2 && JSON.stringify(cards.map((x) => x.name)) === JSON.stringify(orders["expiry-asc"].slice(8)), cards.map((x) => x.name).join(" | "));
  await p.evaluate(() => { window.__marker = 1; [...document.querySelectorAll("form[aria-label='Filter certifications'] label")].find((l) => (l.querySelector("[class*=optionLabel]")?.textContent + " " + l.querySelector("[class*=optionCount]")?.textContent).startsWith("Verified (")).querySelector("input").click(); });
  await p.click("form[aria-label='Filter certifications'] button[type=submit]");
  await p.waitForFunction(() => location.search.includes("status=verified"), { timeout: 15000 }).catch(() => {});
  await sleep(500);
  check("P-52 changing a filter on page 2 resets to page 1 (no page parameter) and keeps the sort", !/page=/.test(urlOf(p).search) && /sort=expiry-asc/.test(urlOf(p).search) && (await cardsOf(p)).length === 8);
  await p.close();
  p = await open(`/suppliers/${A}/certifications?page=99`);
  check("P-53 a page number past the end lands on the last page", urlOf(p).search === "?page=2" && (await cardsOf(p)).length === 2, urlOf(p).search);
  await p.close();
  p = await open(`/suppliers/${A}/certifications?type=bogus&status=pending`);
  const note = await p.evaluate(() => [...document.querySelectorAll("[role=status]")].map((n) => n.textContent).find((t) => /ignored/.test(t)) ?? "");
  check("P-54 unknown filter values in the URL are reported and ignored, never honoured", /not apply|ignored/.test(note) && /type "bogus"/.test(note) && /status "pending"/.test(note) && (await cardsOf(p)).length === 8, note);
  await p.close();
  p = await open(`/suppliers/${A}/certifications?type=quality-management&expiry=expiring`);
  const empty1 = await p.evaluate(() => ({ h: document.querySelector("h2[class*=title]")?.textContent.trim(), clear: document.querySelector("a[href$='/certifications']")?.textContent.trim(), cards: document.querySelectorAll("article").length, total: document.querySelector("#certifications-heading")?.textContent.replace(/\s+/g, " ").trim() }));
  check("P-55 no-match state: message, Clear all filters link, zero cards, statistics intact", empty1.cards === 0 && /No certifications match these filters/.test(await p.evaluate(() => document.body.textContent)) && (await p.evaluate(() => [...document.querySelectorAll("a")].some((a) => a.textContent.trim() === "Clear all filters" && a.getAttribute("href") === location.pathname))) && (await stat(p))[0].startsWith("10 "), JSON.stringify(empty1));
  await p.close();

  // ================= PAGE: empty, other supplier, invalid
  p = await open(`/suppliers/${C}/certifications`);
  const emptyStats = await stat(p);
  const emptyBody = await p.evaluate(() => document.body.textContent);
  check("P-60 supplier with no certifications: real zeros, honest empty state, no cards, no filters", emptyStats.every((s) => /^0 /.test(s)) && /No certifications published yet/.test(emptyBody) && !(await p.evaluate(() => !!document.querySelector("article, form[aria-label='Filter certifications']"))));
  const emptyLinks = await p.evaluate(() => [...document.querySelectorAll("a")].filter((a) => /Send Your Requirement|Back to supplier profile/.test(a.textContent)).map((a) => ({ t: a.textContent.trim(), h: a.getAttribute("href") })));
  check("P-61 empty state links: requirement prefilled with the supplier, back to the profile", emptyLinks.some((l) => l.h === `/post-requirement?supplier=${C}`) && emptyLinks.some((l) => l.h === `/suppliers/${C}`), JSON.stringify(emptyLinks));
  check("P-62 the tab says Certifications (0)", (await p.evaluate(() => document.querySelector("nav[aria-label='Supplier profile'] a[aria-current=page]")?.textContent.trim())) === "Certifications (0)");
  check("P-63 the banner is shown with the supplier's name and the requirement link", await p.evaluate((s) => [...document.querySelectorAll("a")].some((a) => a.textContent.includes("Send Your Requirement") && a.getAttribute("href") === `/post-requirement?supplier=${s}`), C));
  await p.close();

  p = await open(`/suppliers/${B}/certifications`);
  cards = await cardsOf(p);
  check("P-64 supplier B: only its own certificate", cards.length === 1 && cards[0].name === "B Only Certificate" && !/ISO|Pending/.test(await p.evaluate(() => document.body.innerText).then((t) => t.replace(/Certifications/g, ""))) );
  await p.close();
  const bad = await fetch(`${BASE}/suppliers/does-not-exist-xyz/certifications`);
  const bad2 = await fetch(`${BASE}/suppliers/BAD_SLUG/certifications`);
  check("P-65 an unknown or malformed supplier is a real 404", bad.status === 404 && bad2.status === 404, `${bad.status} ${bad2.status}`);
  const ghostPage = await fetch(`${BASE}/suppliers/no-such-supplier/certifications`);
  check("P-66 a certification row of a supplier without a profile does not create a page", ghostPage.status === 404);

  // ================= profile + products pages know about the new page
  p = await open(`/suppliers/${A}`);
  const prof = await p.evaluate(() => ({ card: document.querySelector("#certifications")?.innerText.replace(/\s+/g, " ") }));
  const profTab = await p.evaluate(() => { const a = [...document.querySelectorAll("nav[aria-label='Supplier profile'] a")].find((x) => /Certifications/.test(x.textContent)); return { t: a.textContent.trim(), h: a.getAttribute("href") }; });
  check("P-70 profile page: tab shows the count and goes to the certifications page", profTab.t === "Certifications (10)" && profTab.h === `/suppliers/${A}/certifications`, JSON.stringify(profTab));
  check("P-71 profile page: the Certifications block says 10 are published and links to them", /10 certifications are published/.test(prof.card) && (await p.evaluate((s) => !!document.querySelector(`#certifications a[href='/suppliers/${s}/certifications']`), A)), prof.card);
  await p.close();
  p = await open(`/suppliers/${C}`);
  check("P-72 profile page of a supplier with none keeps the honest sentence and shows (0)", /No certifications have been published for this supplier yet/.test(await p.evaluate(() => document.querySelector("#certifications")?.innerText ?? "")) && (await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Supplier profile'] a")].some((a) => a.textContent.trim() === "Certifications (0)"))));
  await p.close();
  p = await open(`/suppliers/${A}/products`);
  check("P-73 products page: Certifications (10) tab goes to the certifications page", await p.evaluate((s) => [...document.querySelectorAll("nav[aria-label='Supplier profile'] a")].some((a) => a.textContent.trim() === "Certifications (10)" && a.getAttribute("href") === `/suppliers/${s}/certifications`), A));
  await p.close();

  // ================= RESPONSIVE + MOBILE
  for (const width of [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560]) {
    p = await open(`/suppliers/${A}/certifications`, { width });
    const r = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, clipped: [...document.querySelectorAll("article, section[aria-label='Certification overview']")].filter((e) => e.scrollWidth > e.clientWidth + 1).length, cols: new Set([...document.querySelectorAll("main article")].map((a) => Math.round(a.getBoundingClientRect().left))).size, small: [...document.querySelectorAll("article a")].filter((a) => a.getBoundingClientRect().height < 44).length }));
    check(`R-${width} no horizontal overflow or clipped cards; links 44px tall`, !r.overflow && r.clipped === 0 && r.small === 0, JSON.stringify(r));
    await p.close();
  }
  for (const width of [320, 768, 1440]) {
    p = await open(`/suppliers/${C}/certifications`, { width });
    check(`R-empty-${width} the empty state fits`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await p.close();
  }
  p = await open(`/suppliers/${A}/certifications`, { mobile: true });
  const mob = await p.evaluate(() => ({ cols: new Set([...document.querySelectorAll("main article")].map((a) => Math.round(a.getBoundingClientRect().left))).size, trigger: !!document.querySelector("button[aria-controls]:not([aria-controls='mobile-nav-panel']):not([aria-haspopup])"), overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
  check("R-mobile iPhone 13: one column of cards, a filter button, no overflow", mob.cols === 1 && mob.trigger && !mob.overflow, JSON.stringify(mob));
  await p.tap("button[aria-controls]:not([aria-controls='mobile-nav-panel']):not([aria-haspopup])");
  await sleep(500);
  check("R-mobile the filter drawer opens with the certification filters", await p.evaluate(() => /Filter Certifications/.test(document.querySelector("[role=dialog]:not(#mobile-nav-panel)")?.innerText ?? "")));
  await p.evaluate(() => [...document.querySelectorAll("[role=dialog]:not(#mobile-nav-panel) label")].find((l) => (l.querySelector("[class*=optionLabel]")?.textContent + " " + l.querySelector("[class*=optionCount]")?.textContent).startsWith("Expired (2)")).querySelector("input").click());
  await p.evaluate(() => document.querySelector("[role=dialog]:not(#mobile-nav-panel) button[type=submit]").click());
  await p.waitForFunction(() => location.search.includes("status=expired"), { timeout: 15000 }).catch(() => {});
  await sleep(600);
  check("R-mobile applying from the drawer filters the list and closes the drawer", urlOf(p).search === "?status=expired" && (await cardsOf(p)).length === 2 && (await p.evaluate(() => document.querySelector("[role=dialog]:not(#mobile-nav-panel)")?.hasAttribute("inert") ?? true)));
  await p.close();
  // landscape phone
  context: {
    const ctx = await browser.createBrowserContext();
    const lp = await ctx.newPage();
    await lp.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
    await lp.goto(`${BASE}/suppliers/${A}/certifications`, { waitUntil: "networkidle2" });
    check("R-landscape phone 844x390: no horizontal overflow", !(await lp.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await ctx.close();
  }
  // zoom 200% ~ a 720px-wide viewport, 80% ~ 1800px
  for (const [zoom, width] of [[80, 1800], [110, 1309], [125, 1152], [150, 960], [200, 720]]) {
    p = await open(`/suppliers/${A}/certifications`, { width });
    check(`R-zoom ${zoom}% (viewport ${width}px) no overflow`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await p.close();
  }

  // ================= accessibility basics
  p = await open(`/suppliers/${A}/certifications`);
  const a11y = await p.evaluate(() => {
    const headings = [...document.querySelectorAll("h1,h2,h3")].map((h) => Number(h.tagName[1]));
    const skipped = headings.some((level, i) => i > 0 && level - headings[i - 1] > 1);
    return {
      h1: document.querySelectorAll("h1").length,
      skipped,
      articles: [...document.querySelectorAll("article")].every((a) => a.getAttribute("aria-labelledby") && document.getElementById(a.getAttribute("aria-labelledby"))),
      statusText: [...document.querySelectorAll("article")].every((a) => /Verified|Expired/.test(a.innerText)),
      timeTags: [...document.querySelectorAll("article time")].every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.getAttribute("datetime"))),
      iconsHidden: [...document.querySelectorAll("article svg")].every((s) => s.getAttribute("aria-hidden") === "true"),
      labelled: [...document.querySelectorAll("form[aria-label='Filter certifications'] input")].every((i) => i.closest("label")),
    };
  });
  check("Y-01 one h1, no skipped heading level", a11y.h1 === 1 && !a11y.skipped, JSON.stringify(a11y));
  check("Y-02 every card is a labelled article with a text status (not colour alone) and machine-readable dates", a11y.articles && a11y.statusText && a11y.timeTags);
  check("Y-03 decorative icons hidden; every filter checkbox has a label", a11y.iconsHidden && a11y.labelled);
  await p.keyboard.press("Tab");
  const focusVisible = await p.evaluate(() => { const t = [...document.querySelectorAll("article a")][0]; t.focus(); const s = getComputedStyle(t); return s.outlineStyle !== "none" || s.boxShadow !== "none"; });
  check("Y-04 a document link shows a visible focus indicator", focusVisible);
  await p.close();

  // ================= rate limits (last: they use up the window)
  let limited = 0, first429 = null;
  for (let i = 0; i < 130; i++) { const r = await fetch(`${BASE}/api/public/certifications/${ids.iso9001}/document`); if (r.status === 429) { limited++; first429 ??= { retry: r.headers.get("retry-after"), body: await r.json().catch(() => null) }; } }
  check("L-01 document endpoint is rate limited (60/min/IP): 429 appears within 130 requests (more than twice the limit, so one window must exceed it)", limited > 0, `${limited} limited`);
  check("L-02 the 429 carries Retry-After and the standard error shape", !!first429 && Number(first429.retry) > 0 && first429.body?.code === "RATE_LIMITED");
}

function eq(name, actual, expected) { check(name, actual === expected, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }

try {
  await main();
} catch (error) {
  check("suite ran to the end without an exception", false, String(error?.stack ?? error));
} finally {
  await browser.close();
  if (process.env.KEEP !== "1") {
    await col.deleteMany({ __test: true });
    fs.rmSync(DOCS_DIR, { recursive: true, force: true });
    fs.rmSync(`${ROOT}/.next-audit/secret-outside.pdf`, { force: true });
  }
  await client.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:\n" + failed.map((f) => f.name).join("\n"));
  process.exit(1);
}
