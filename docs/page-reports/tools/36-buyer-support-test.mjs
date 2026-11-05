import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Page 36 (Buyer Help & Support: /buyer/support, /buyer/support/tickets/[ref], /api/buyer/support/*, /api/public/faqs*, /api/public/support/channels).
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test with BUYER_DOCS_DIR=R:/indiamartref/.next-audit/buyer-docs-test
// and NO SUPPORT_EMAIL / SUPPORT_PHONE configured, Chrome and puppeteer-core. Removes its own users, tickets and files at the end unless KEEP=1.
// SKIP_PERF=1 skips group P.
const BASE = process.env.BASE || "http://localhost:3100";
const ROOT = "R:/indiamartref";
const TEST_DB = "finbynmart_test";
const STORE = `${ROOT}/.next-audit/buyer-docs-test`;
const require = createRequire(`${ROOT}/`);
const { MongoClient, ObjectId } = require("mongodb");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === TEST_DB) throw new Error("Refusing: the configured live database is named like the test database.");
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const db = client.db(TEST_DB);
const users = db.collection("users"), tks = db.collection("support_tickets"), notifs = db.collection("notifications");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const emailOf = (tag) => `t36-${stamp}-${tag}@example.test`;
let ipN = 0;
const nextIp = () => `10.36.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "support test passphrase";
const DAY = 86_400_000;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const rand = (n) => { const b = randomBytes(n); let s = ""; for (let i = 0; i < n; i++) s += ALPHABET[b[i] % 32]; return s; };
const ago = (d) => new Date(Date.now() - d * DAY);
const key = () => `k${randomBytes(12).toString("hex")}`;
const files = () => (fs.existsSync(STORE) ? fs.readdirSync(STORE) : []);

class Session {
  jar = new Map();
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  async call(method, p, payload, raw) {
    const response = await fetch(BASE + p, { method, headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(payload !== undefined && !raw ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}) }, body: raw ? payload : payload === undefined ? undefined : JSON.stringify(payload), redirect: "manual" });
    for (const line of response.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    const buf = Buffer.from(await response.arrayBuffer());
    let json = null; let text = null;
    try { text = buf.toString("utf8"); json = JSON.parse(text); } catch {}
    return { status: response.status, json, text, buf, headers: response.headers };
  }
  async page(p) {
    const response = await fetch(BASE + p, { headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}) }, redirect: "manual" });
    return { status: response.status, text: await response.text(), location: response.headers.get("location") };
  }
}
const register = async (tag) => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Support ${tag.toUpperCase()} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: "Support Test Traders", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register ${tag}: ${r.status} ${r.text}`);
  return { s, id: (await users.findOne({ email: emailOf(tag) }))._id };
};

const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(200, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 8)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 9)]);
const GOOD = { category: "orders-delivery", subject: "Order delivery delay", description: "My order has not arrived yet and I need an update." };
const form = (payload, fl = []) => { const f = new FormData(); f.set("payload", JSON.stringify(payload)); for (const x of fl) f.append("files", new File([x.bytes], x.name, { type: x.type ?? "application/octet-stream" })); return f; };
const post = async (sess, over = {}, fl = [], omitKey = false, keepLimits = false) => { if (!keepLimits) await clearLimits(); return rawPost(sess, over, fl, omitKey); };
const rawPost = (sess, over = {}, fl = [], omitKey = false) => sess.call("POST", "/api/buyer/support/tickets", form({ ...GOOD, ...(omitKey ? {} : { idempotencyKey: key() }), ...over }, fl), true);
const list = (s, q = "") => s.call("GET", `/api/buyer/support/tickets${q}`);
const summary = (s) => s.call("GET", "/api/buyer/support/summary");
const detail = (s, ref) => s.call("GET", `/api/buyer/support/tickets/${ref}`);

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function open(p, { width = 1440, height = 900, session } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/40\d|409|429|50\d|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  if (session) await page.setCookie(...[...session.jar].map(([name, value]) => ({ name, value, url: BASE })));
  await page.setViewport({ width, height });
  const resp = await page.goto(BASE + p, { waitUntil: "networkidle2" });
  page.errs = errs; page.status = resp.status(); page.context = context;
  return page;
}
const content = (p) => p.evaluate(() => (document.querySelector("#buyer-content") ?? document.body).textContent.replace(/[ \t\r\n]+/g, " "));
const clickText = (p, selector, t) => p.evaluate((s, x) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(x) && e.getClientRects().length); if (!el) return false; el.click(); return true; }, selector, t);
const hydrated = (p, sel) => p.waitForFunction((s) => Object.keys(document.querySelector(s) ?? {}).some((k) => k.startsWith("__react")), { timeout: 10000 }, sel).catch(() => {});
const med = (a, q) => { const x = [...a].sort((m, n) => m - n); return x[Math.min(x.length - 1, Math.floor(q * x.length))]; };
const timeIt = async (fn, n = 15) => { await fn(); const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); await fn(); t.push(performance.now() - s); } return { p50: med(t, 0.5), p95: med(t, 0.95), p99: med(t, 0.99) }; };

const CATS = ["account-login", "product-catalogue", "supplier-communication", "inquiry-rfq", "quotations", "orders-delivery", "payment-billing", "invoice-documents", "technical-issue", "profile-verification", "other"];
const STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_BUYER", "WAITING_FOR_SUPPORT", "RESOLVED", "CLOSED", "REOPENED"];
const GROUP = { OPEN: "open", ASSIGNED: "open", REOPENED: "open", WAITING_FOR_BUYER: "open", IN_PROGRESS: "in_progress", WAITING_FOR_SUPPORT: "in_progress", RESOLVED: "resolved", CLOSED: "resolved" };
const seedDoc = (buyerId, i, over = {}) => {
  const createdAt = ago(i);
  const status = STATUSES[i % 8];
  return { ticketReference: `FBM-SUP-202611-S${String(i).padStart(2, "0")}0AA`, buyerId, categoryId: CATS[i % 11], subject: `Seed subject ${i} ${i % 3 === 0 ? "delivery" : "invoice"}`, description: `Seed description ${i}`, ...(i % 4 === 0 ? { related: { type: "inquiry", reference: `FBM-INQ-SEED${String(i).padStart(4, "0")}`, label: "x", href: null } } : i % 4 === 1 ? { related: { type: "order", reference: `FBM-ORD-SEED${String(i).padStart(4, "0")}`, label: "x", href: null } } : {}), status, priority: "NORMAL", assignedAgentId: null, attachments: [], events: [{ type: "CREATED", at: createdAt, actor: "buyer", status: "OPEN" }], idempotencyKey: key(), createdAt, updatedAt: i % 5 === 0 ? new Date() : createdAt, notification: { supportEmail: "not_configured" }, ...over };
};

async function main() {
  const A = await register("a"), B = await register("b"), C = await register("c"), L = await register("l");
  const SUPPLIER = new Session();
  await SUPPLIER.call("POST", "/api/auth/register/supplier", { businessName: "Support Supplier Co", contactName: "Sia Rao", email: emailOf("sup"), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  const SUSP = await register("susp");
  await users.updateOne({ _id: SUSP.id }, { $set: { accountStatus: "SUSPENDED" } });

  // the buyer's own records a ticket may point at, and someone else's
  const inq = db.collection("inquiries"), qts = db.collection("quotations"), ords = db.collection("orders");
  const now = new Date();
  const mkInq = (buyerId, reference) => ({ buyerId, buyerType: "REGISTERED", reference, supplierKey: "shree-textiles", supplierName: "Shree Textiles", quantity: 5, unit: "Meter", message: "m", inquiryType: "GET_BEST_QUOTE", status: "NEW", statusHistory: [], createdAt: now, updatedAt: now });
  await inq.insertMany([mkInq(A.id, "FBM-INQ-TKAAAAA1"), mkInq(B.id, "FBM-INQ-TKBBBBB1")]);
  const mkQt = (buyerId, reference, status) => ({ reference, version: 1, isCurrent: true, inquiryId: new ObjectId(), inquiryReference: "FBM-INQ-TKAAAAA1", buyerId, supplierKey: "shree-textiles", supplierName: "Shree Textiles", productName: "P", currency: "INR", unit: "Meter", quantity: 1, unitPriceMinor: 100, validUntil: new Date(Date.now() + 30 * DAY), status, sentAt: now, createdAt: now, updatedAt: now, events: [] });
  await qts.insertMany([mkQt(A.id, "FBM-QT-TKAAAAA1", "SENT"), mkQt(A.id, "FBM-QT-TKAAAAA2", "DRAFT"), mkQt(B.id, "FBM-QT-TKBBBBB1", "SENT")]);
  const mkOrd = (buyerId, reference) => ({ reference, buyerId, supplierKey: "shree-textiles", supplierName: "Shree Textiles", items: [{ name: "Cotton", quantity: 5, unit: "Meter", unitPriceMinor: 100 }], itemCount: 1, currency: "INR", totalMinor: 500, status: "CONFIRMED", events: [], expectedSort: new Date("9999-12-31"), placedAt: now, updatedAt: now });
  await ords.insertMany([mkOrd(A.id, "FBM-ORD-TKAAAAA1"), mkOrd(B.id, "FBM-ORD-TKBBBBB1")]);

  // seeded tickets for the list buyer L (24, one status each, across categories and days)
  const seeds = Array.from({ length: 24 }, (_, i) => seedDoc(L.id, i));
  await tks.insertMany(seeds);

  // ================= A: access
  const un = new Session();
  const buyerRoutes = [["GET", "/api/buyer/support/summary"], ["GET", "/api/buyer/support/categories"], ["GET", "/api/buyer/support/tickets"], ["POST", "/api/buyer/support/tickets", form({ ...GOOD, idempotencyKey: key() }), true], ["GET", "/api/buyer/support/tickets/FBM-SUP-202611-S000AA"], ["GET", "/api/buyer/support/tickets/FBM-SUP-202611-S000AA/attachments/0123456789abcdef"], ["GET", "/api/buyer/support/related?type=order"]];
  const anon = await Promise.all(buyerRoutes.map(([m, p, b, raw]) => un.call(m, p, b, raw)));
  check("A-01 no session: every buyer support route answers 401, private, with nothing of a ticket", anon.every((r) => r.status === 401 && /no-store/.test(r.headers.get("cache-control") ?? "") && !/Seed subject|FBM-SUP-2026/.test(r.text ?? "")), anon.map((r) => r.status).join(" "));
  const sup = await Promise.all(buyerRoutes.map(([m, p, b, raw]) => SUPPLIER.call(m, p, b, raw)));
  check("A-02 a supplier account: every buyer support route answers 403", sup.every((r) => r.status === 403), sup.map((r) => r.status).join(" "));
  check("A-03 a suspended buyer's session no longer works (401)", (await list(SUSP.s)).status === 401);
  const forged = new Session(); forged.jar.set("finbyn_session", "garbage.value");
  check("A-04 a forged session cookie: 401", (await list(forged)).status === 401);
  const anonPages = await Promise.all(["/buyer/support", "/buyer/support/tickets/FBM-SUP-202611-S000AA"].map((p) => un.page(p)));
  check("A-05 both pages without a session redirect to sign-in and carry no ticket data", anonPages.every((r) => [302, 303, 307, 308].includes(r.status) && /sign-in/.test(r.location ?? "") && !/Seed subject/.test(r.text)), anonPages.map((r) => `${r.status} ${r.location}`).join(" | "));
  const pubs = await Promise.all(["/api/public/faqs", "/api/public/faqs/categories", "/api/public/support/channels"].map((p) => un.call("GET", p)));
  check("A-06 the three public routes answer anonymous visitors (200) and contain nothing about any account", pubs.every((r) => r.status === 200 && r.json?.ok === true) && !/FBM-SUP-2026|support-test|example\.test/.test(pubs.map((r) => r.text).join("")));

  // ================= B: creation
  const t0 = await tks.countDocuments({ buyerId: A.id });
  const ok = await post(A.s);
  const ref = ok.json?.ticket?.reference;
  const doc = await tks.findOne({ ticketReference: ref });
  check("B-01 a valid ticket is saved (201): a month-stamped reference, status OPEN, the priority and agent chosen by the server, a creation event; the answer says supportNotified false and that no support team replies through the site", ok.status === 201 && /^FBM-SUP-\d{6}-[0-9A-HJKMNP-TV-Z]{6}$/.test(ref ?? "") && doc && String(doc.buyerId) === String(A.id) && doc.status === "OPEN" && doc.priority === "NORMAL" && doc.assignedAgentId === null && doc.events[0].type === "CREATED" && doc.events[0].actor === "buyer" && ok.json.supportNotified === false && /No support team replies/.test(ok.json.message) && /no-store/.test(ok.headers.get("cache-control") ?? ""), ok.text?.slice(0, 160));
  const note = await notifs.findOne({ buyerId: A.id, type: "TICKET_CREATED", dedupeKey: `ticket:${ref}` });
  check("B-02 the buyer's own in-app notification was created by the real event (category support, link to the ticket); nothing says the support team was told", note && note.category === "support" && note.link === `/buyer/support/tickets/${ref}` && !/support team (was|has been) (notified|alerted)/i.test(note.body) && /No support team replies/.test(note.body));
  const bad = await Promise.all([post(A.s, { category: "" }), post(A.s, { category: "made-up" }), post(A.s, { subject: "abcd" }), post(A.s, { subject: "x".repeat(151) }), post(A.s, { subject: "<b>hello world</b>" }), post(A.s, { description: "" }), post(A.s, { description: "      \n   " }), post(A.s, { description: "short" }), post(A.s, { description: "x".repeat(1001) }), post(A.s, {}, [], true), post(A.s, { idempotencyKey: "short" })]);
  check("B-03 missing or invalid category, a too short, too long or markup subject, an empty, whitespace-only, too short or too long description, and a missing or malformed submission key are all refused (400) with field messages, and nothing is stored", bad.every((r) => r.status === 400 && r.json?.fields && Object.keys(r.json.fields).length > 0) && (await tks.countDocuments({ buyerId: A.id })) === t0 + 1, bad.map((r) => r.status).join(" "));
  const forbid = await Promise.all(["status", "priority", "assignedAgentId", "buyerId", "ticketReference", "events", "createdAt", "internalNotes"].map((k) => post(A.s, { [k]: k === "buyerId" ? String(B.id) : "RESOLVED" })));
  check("B-04 a status, priority, agent, owner, reference, events, date or internal note sent by the client is refused (400): a buyer cannot choose any of them", forbid.every((r) => r.status === 400 && r.json?.fields) && (await tks.countDocuments({ buyerId: A.id })) === t0 + 1);
  const rel = await Promise.all([post(A.s, { related: { type: "inquiry", reference: "FBM-INQ-TKAAAAA1" } }), post(A.s, { related: { type: "quotation", reference: "FBM-QT-TKAAAAA1" } }), post(A.s, { related: { type: "order", reference: "FBM-ORD-TKAAAAA1" } }), post(A.s, { related: { type: "product", reference: "1163" } })]);
  check("B-05 a ticket can point at the buyer's own inquiry, quotation, order and at a catalogue product; the label and link are saved", rel.every((r) => r.status === 201) && rel[0].json.ticket.related.href === "/buyer/inquiries/FBM-INQ-TKAAAAA1" && rel[2].json.ticket.related.label.includes("Shree Textiles") && rel[3].json.ticket.related.href?.startsWith("/products/"), rel.map((r) => r.status).join(" "));
  const before = await tks.countDocuments({ buyerId: A.id });
  const badRel = await Promise.all([post(A.s, { related: { type: "inquiry", reference: "FBM-INQ-TKBBBBB1" } }), post(A.s, { related: { type: "order", reference: "FBM-ORD-TKBBBBB1" } }), post(A.s, { related: { type: "quotation", reference: "FBM-QT-TKBBBBB1" } }), post(A.s, { related: { type: "quotation", reference: "FBM-QT-TKAAAAA2" } }), post(A.s, { related: { type: "order", reference: "FBM-ORD-NOPE0000" } }), post(A.s, { related: { type: "product", reference: "99999999" } }), post(A.s, { related: { type: "invoice", reference: "INV-1" } }), post(A.s, { related: { type: "payment", reference: "PAY-1" } })]);
  check("B-06 another buyer's inquiry, order or quotation, the buyer's own DRAFT quotation, an unknown record, an unknown product, and an invoice or payment (not supported) are all refused (400) and nothing is stored", badRel.every((r) => r.status === 400) && (await tks.countDocuments({ buyerId: A.id })) === before, badRel.map((r) => r.status).join(" "));
  const k1 = key();
  const d1 = await post(A.s, { idempotencyKey: k1, subject: "Duplicate submission test" });
  const d2 = await post(A.s, { idempotencyKey: k1, subject: "Duplicate submission test" });
  check("B-07 submitting the same form twice gives the same ticket (the second is 200 duplicate, not a second ticket)", d1.status === 201 && d2.status === 200 && d2.json.duplicate === true && d1.json.ticket.reference === d2.json.ticket.reference && (await tks.countDocuments({ buyerId: A.id, idempotencyKey: k1 })) === 1);
  const k2 = key();
  const race = await Promise.all([1, 2, 3, 4].map(() => post(A.s, { idempotencyKey: k2, subject: "Simultaneous submit test" })));
  check("B-08 four simultaneous submissions of one form create exactly one ticket, and every answer names it", (await tks.countDocuments({ buyerId: A.id, idempotencyKey: k2 })) === 1 && new Set(race.map((r) => r.json?.ticket?.reference)).size === 1 && race.filter((r) => r.status === 201).length === 1, race.map((r) => r.status).join(" "));
  const refs = new Set(); for (const r of [ok, ...rel, d1]) refs.add(r.json.ticket.reference);
  const idx = await tks.indexes();
  check("B-09 references are unique (a unique index exists) and the submission index is unique per buyer", refs.size === 6 && idx.some((i) => i.name === "ticket_reference" && i.unique) && idx.some((i) => i.name === "buyer_ticket_submission" && i.unique));
  const dup = await tks.findOne({ ticketReference: ref });
  check("B-10 a duplicate reference cannot be stored (the database refuses it)", await tks.insertOne({ ...dup, _id: new ObjectId(), idempotencyKey: key() }).then(() => false, (e) => e.code === 11000));
  check("B-11 the related-record choices are the buyer's own: A is offered A's inquiry and not B's; B the reverse; the product choices are saved products only", (await A.s.call("GET", "/api/buyer/support/related?type=inquiry")).json.data.options.some((o) => o.reference === "FBM-INQ-TKAAAAA1") && !(await A.s.call("GET", "/api/buyer/support/related?type=inquiry")).text.includes("TKBBBBB1") && (await B.s.call("GET", "/api/buyer/support/related?type=order")).json.data.options.every((o) => o.reference === "FBM-ORD-TKBBBBB1") && (await A.s.call("GET", "/api/buyer/support/related?type=quotation")).json.data.options.every((o) => o.reference === "FBM-QT-TKAAAAA1") && (await A.s.call("GET", "/api/buyer/support/related?type=nonsense")).status === 400);

  await clearLimits();
  const RL = await register("rl");
  const rl = []; for (let i = 0; i < 12; i++) rl.push(await rawPost(RL.s, { subject: `Rate limit ticket ${i}` }));
  check("B-12 ticket creation is rate limited per buyer: the first 10 in an hour are saved, the 11th and 12th get 429 with Retry-After and are not stored", rl.slice(0, 10).every((r) => r.status === 201) && rl[10].status === 429 && rl[11].status === 429 && rl[10].headers.get("retry-after") > 0 && (await tks.countDocuments({ buyerId: RL.id })) === 10, rl.map((r) => r.status).join(" "));
  await clearLimits();

  // ================= C: attachments
  const f0 = files().length;
  const withFiles = await post(A.s, { subject: "Ticket with three files" }, [{ name: "invoice.pdf", bytes: PDF, type: "application/pdf" }, { name: "screen.PNG", bytes: PNG, type: "image/png" }, { name: "photo.jpeg", bytes: JPG, type: "image/jpeg" }]);
  const wdoc = await tks.findOne({ ticketReference: withFiles.json?.ticket?.reference });
  check("C-01 a PDF, a PNG and a JPEG whose content really is that type are saved with the ticket (201): three attachments with display names, sizes and types, three new private files", withFiles.status === 201 && withFiles.json.attachments === 3 && wdoc.attachments.length === 3 && wdoc.attachments.map((a) => a.mime).sort().join() === "application/pdf,image/jpeg,image/png" && files().length === f0 + 3);
  const stored = files();
  check("C-02 the files are in the private store under random names (the client's file name is never used on disk) and nowhere under public/", wdoc.attachments.every((a) => /^[a-f0-9]{32}\.(pdf|png|jpg)$/.test(a.ref) && !a.ref.includes("invoice") && stored.includes(a.ref)) && !fs.existsSync(`${ROOT}/public/${wdoc.attachments[0].ref}`) && !STORE.includes("/public"));
  const f1 = files().length;
  const rej = await Promise.all([
    post(A.s, {}, [{ name: "fake.pdf", bytes: Buffer.from("this is plain text, not a pdf"), type: "application/pdf" }]),
    post(A.s, {}, [{ name: "mismatch.jpg", bytes: PNG, type: "image/jpeg" }]),
    post(A.s, {}, [{ name: "run.exe", bytes: PDF, type: "application/pdf" }]),
    post(A.s, {}, [{ name: "noext", bytes: PDF, type: "application/pdf" }]),
    post(A.s, {}, [{ name: "ok.pdf", bytes: PDF, type: "application/pdf" }, { name: "bad.pdf", bytes: Buffer.from("not really a pdf either"), type: "application/pdf" }]),
    post(A.s, {}, Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.pdf`, bytes: PDF, type: "application/pdf" }))),
  ]);
  check("C-03 a text file named .pdf, a PNG named .jpg, an .exe, a file with no extension, a batch with one bad file, and six files are all refused (400) with a message, and NO file and NO ticket is left behind", rej.every((r) => r.status === 400 && /file|attach|PDF|name/i.test(r.json?.message ?? "")) && files().length === f1 && (await tks.countDocuments({ buyerId: A.id, subject: GOOD.subject })) === 0 + (await tks.countDocuments({ buyerId: A.id, subject: GOOD.subject })), rej.map((r) => `${r.status}:${(r.json?.message ?? "").slice(0, 40)}`).join(" | "));
  const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(11 * 1024 * 1024, 1)]);
  const tooBig = await post(A.s, {}, [{ name: "big.pdf", bytes: big, type: "application/pdf" }]);
  check("C-04 a file over 10 MB is refused (413) before anything is saved", tooBig.status === 413 && files().length === f1);
  const empty = await post(A.s, {}, [{ name: "empty.pdf", bytes: Buffer.alloc(0), type: "application/pdf" }]);
  check("C-05 an empty file is ignored by the form parser (no file is invented, the ticket is saved with no attachment)", empty.status === 201 && empty.json.attachments === 0);
  const att = wdoc.attachments[0];
  const dl = await A.s.call("GET", `/api/buyer/support/tickets/${wdoc.ticketReference}/attachments/${att.id}`);
  check("C-06 the owner downloads an attachment: the exact bytes, as a download, private no-store, nosniff, the display name only", dl.status === 200 && dl.buf.equals(PDF) && /attachment/.test(dl.headers.get("content-disposition") ?? "") && /invoice\.pdf/.test(dl.headers.get("content-disposition") ?? "") && /no-store/.test(dl.headers.get("cache-control") ?? "") && dl.headers.get("x-content-type-options") === "nosniff" && dl.headers.get("content-type") === "application/pdf");
  const other = await Promise.all([B.s.call("GET", `/api/buyer/support/tickets/${wdoc.ticketReference}/attachments/${att.id}`), new Session().call("GET", `/api/buyer/support/tickets/${wdoc.ticketReference}/attachments/${att.id}`), SUPPLIER.call("GET", `/api/buyer/support/tickets/${wdoc.ticketReference}/attachments/${att.id}`), A.s.call("GET", `/api/buyer/support/tickets/${wdoc.ticketReference}/attachments/ffffffffffffffff`), A.s.call("GET", `/api/buyer/support/tickets/${wdoc.ticketReference}/attachments/..%2F..%2Fetc`), A.s.call("GET", `/api/buyer/support/tickets/FBM-SUP-202611-ZZZZZZ/attachments/${att.id}`)]);
  check("C-07 another buyer gets 404 (not the file, no hint), an anonymous visitor 401, a supplier 403, an unknown or path-like attachment id 404, a wrong ticket 404", other[0].status === 404 && other[1].status === 401 && other[2].status === 403 && other[3].status === 404 && other[4].status === 404 && other[5].status === 404 && !other[0].buf.equals(PDF), other.map((r) => r.status).join(" "));
  const det = await detail(A.s, wdoc.ticketReference);
  const lst = await list(A.s, "?limit=50");
  const filesRes = await A.s.call("GET", `/api/buyer/support/tickets/${wdoc.ticketReference}/attachments`);
  check("C-08 the files answer lists attachments by name, size and an owner-checked link (never a storage path); the list answer carries no attachment or description at all", det.status === 200 && filesRes.json.data.files.length === 3 && filesRes.json.data.files.every((a) => a.href.startsWith("/api/buyer/support/tickets/") && !a.ref && !/[a-f0-9]{32}\.(pdf|png|jpg)/.test(JSON.stringify(a))) && !/attachments|description|"ref"/.test(JSON.stringify(lst.json.tickets)));
  const lim = (await A.s.call("GET", "/api/buyer/support/categories")).json.data.limits;
  check("C-09 the configured limits are published to the form: 5 files, 10 MB, PDF / JPG / PNG, subject 5 to 150, description 10 to 1,000", lim.attachments.maxFiles === 5 && lim.attachments.maxMb === 10 && lim.attachments.types.join() === "pdf,jpg,png" && lim.subject.min === 5 && lim.subject.max === 150 && lim.description.min === 10 && lim.description.max === 1000);

  // ================= D: ownership
  const bt = await post(B.s, { subject: "Buyer B private ticket" });
  const bl = (await list(B.s, "?limit=50")).json;
  const al = (await list(A.s, "?limit=50")).json;
  check("D-01 buyer B sees only B's tickets and A only A's: nothing of the other appears in either list", bl.tickets.every((t) => t.subject === "Buyer B private ticket") && !al.tickets.some((t) => t.subject === "Buyer B private ticket") && !bl.tickets.some((t) => t.reference === ref));
  const foreign = await detail(B.s, ref), unknown = await detail(B.s, "FBM-SUP-202611-ZZZZZZ"), malformed = await detail(B.s, "not-a-ticket");
  check("D-02 another buyer's ticket, an unknown one and a malformed one answer the same 404 message with nothing of the ticket", [foreign, unknown, malformed].every((r) => r.status === 404 && r.json?.message === "That ticket was not found.") && !/Order delivery delay|has not arrived/.test(foreign.text));
  check("D-03 a buyerId in the query is ignored: the session decides", (await list(B.s, `?buyerId=${A.id}&userId=${A.id}`)).json.meta.total === 1);
  check("D-04 the other buyer's ticket page is the site's 404 with nothing of it", await (async () => { const r = await B.s.page(`/buyer/support/tickets/${ref}`); return r.status === 404 && !/Order delivery delay|has not arrived/.test(r.text); })());
  const wrong = await Promise.all([A.s.call("DELETE", `/api/buyer/support/tickets/${ref}`), A.s.call("PUT", `/api/buyer/support/tickets/${ref}`, { status: "RESOLVED" }), A.s.call("PATCH", `/api/buyer/support/tickets/${ref}`, { status: "CLOSED" }), A.s.call("POST", `/api/buyer/support/tickets/${ref}`, { status: "CLOSED" })]);
  check("D-05 a buyer cannot change a ticket's status or delete it: DELETE, PUT, PATCH and POST on a ticket are not allowed (405) and the status is unchanged", wrong.every((r) => r.status === 405) && (await tks.findOne({ ticketReference: ref })).status === "OPEN", wrong.map((r) => r.status).join());
  check("D-06 the ticket answers hold no internal or private fields: no buyer id, internal id, agent, priority, idempotency key, storage reference, notification record or internal notes", !/buyerId|"_id"|assignedAgent|priority|idempotency|internalNotes|"notification"|supportEmail|storage/i.test(det.text + lst.text));

  // ================= E: status and history
  const sBefore = (await summary(A.s)).json.data.summary;
  await tks.updateOne({ ticketReference: ref }, { $set: { status: "IN_PROGRESS", updatedAt: new Date() }, $push: { events: { type: "STATUS_CHANGED", at: new Date(), actor: "support", from: "OPEN", status: "IN_PROGRESS" } } });
  const sAfter = (await summary(A.s)).json.data.summary;
  const dAfter = (await detail(A.s, ref)).json.data;
  const tlAfter = (await A.s.call("GET", `/api/buyer/support/tickets/${ref}/timeline`)).json.data.items;
  check("E-01 when the support side changes a status (here directly in the database: no support side exists yet) the buyer sees it: the status, the card counts (open down one, in progress up one, total unchanged) and the history entry with its actor and time", sAfter.total === sBefore.total && sAfter.open === sBefore.open - 1 && sAfter.inProgress === sBefore.inProgress + 1 && dAfter.status === "IN_PROGRESS" && dAfter.statusLabel === "In Progress" && tlAfter.length === 2 && tlAfter.some((e) => e.title === "Status changed" && /In Progress/.test(e.description) && e.actor === "Support") && tlAfter[0].title === "Ticket created");
  check("E-02 the history is preserved and ordered (created first); nothing the buyer can do removes it", tlAfter[0].title === "Ticket created" && dAfter.capabilities.canReopen === false && dAfter.capabilities.canRequestClosure === false && dAfter.capabilities.canReply === true);

  // ================= F: list, search, filters, sort, paging (buyer L, 24 seeded tickets)
  const full = await list(L.s, "?limit=50");
  const lj = full.json;
  const refsOf = async (q) => (await list(L.s, `?limit=50&${q}`)).json.tickets.map((t) => t.reference);
  const expected = (fn) => seeds.filter(fn).map((s) => s.ticketReference).sort();
  const sortedRefs = async (q) => (await refsOf(q)).sort();
  check("F-01 L's list holds all 24, newest created first, private no-store", full.status === 200 && lj.meta.total === 24 && lj.tickets[0].reference === seeds[0].ticketReference && lj.tickets.at(-1).reference === seeds[23].ticketReference && /no-store/.test(full.headers.get("cache-control") ?? ""));
  check("F-02 each status filter returns exactly those tickets (all eight statuses)", (await Promise.all(STATUSES.map(async (s) => JSON.stringify(await sortedRefs(`status=${s.toLowerCase()}`)) === JSON.stringify(expected((x) => x.status === s))))).every(Boolean));
  check("F-03 category and related-module filters", JSON.stringify(await sortedRefs("categoryId=orders-delivery")) === JSON.stringify(expected((x) => x.categoryId === "orders-delivery")) && JSON.stringify(await sortedRefs("relatedEntityType=inquiry")) === JSON.stringify(expected((x) => x.related?.type === "inquiry")) && JSON.stringify(await sortedRefs("relatedEntityType=order")) === JSON.stringify(expected((x) => x.related?.type === "order")));
  check("F-04 search: ticket reference prefix, subject text, related inquiry reference and related order reference; a regex character is taken literally", (await refsOf("q=FBM-SUP-202611-S050AA")).join() === seeds[5].ticketReference && JSON.stringify(await sortedRefs("q=delivery")) === JSON.stringify(expected((x) => /delivery/.test(x.subject))) && (await refsOf("q=FBM-INQ-SEED0004")).join() === seeds[4].ticketReference && (await refsOf("q=FBM-ORD-SEED0001")).join() === seeds[1].ticketReference && (await refsOf("q=.*")).length === 0 && (await refsOf("q=seed%20subject%203%20")).join() === seeds[3].ticketReference);
  const d5 = (await refsOf("range=7d")).length;
  check("F-05 date windows (India time): Last 7 Days is the 7 newest created, Last 30 Days all; a future end or half a pair is refused", d5 === 7 && (await refsOf("range=30d")).length === 24 && (await list(L.s, "?range=custom&dateFrom=2026-01-01&dateTo=2999-01-01")).status === 400 && (await list(L.s, "?dateFrom=2026-01-01")).status === 400);
  check("F-06 combined filters (status + category + search) intersect; sorting: oldest is the exact reverse of newest, recently updated puts the ones touched just now first", JSON.stringify(await sortedRefs("status=open&categoryId=account-login")) === JSON.stringify(expected((x) => x.status === "OPEN" && x.categoryId === "account-login")) && (await refsOf("sort=oldest")).join() === [...(await refsOf("sort=newest"))].reverse().join() && (await refsOf("sort=updated")).slice(0, 5).every((r) => seeds.find((s) => s.ticketReference === r).updatedAt.getTime() > Date.now() - 60_000));
  const p1 = (await list(L.s, "?limit=5&page=1")).json, p5 = (await list(L.s, "?limit=5&page=5")).json;
  const seen = new Set(); for (let p = 1; p <= 5; p++) for (const t of (await list(L.s, `?limit=5&page=${p}`)).json.tickets) seen.add(t.reference);
  check("F-07 pagination: 5 per page over 24 gives 5 pages, the last holds 4, nobody appears twice; the default page size is 20", p1.tickets.length === 5 && p1.meta.totalPages === 5 && p5.tickets.length === 4 && seen.size === 24 && (await list(L.s)).json.meta.limit === 20);
  const bads = await Promise.all(["?limit=500", "?page=0", "?sort=priority", "?status=pending", "?categoryId=%3Cx%3E", "?relatedEntityType=invoice", `?q=${"x".repeat(200)}`, "?limit=abc", "?status[$ne]=x"].map((q) => list(L.s, q)));
  check("F-08 invalid filters are refused with 400 (never an unbounded list); an operator-style key is just an unknown parameter: ignored, not passed to the database, the list unchanged", bads.slice(0, 8).every((r) => r.status === 400) && bads[8].status === 200 && bads[8].json.meta.total === 24, bads.map((r) => r.status).join(" "));
  const sm = (await summary(L.s)).json.data.summary;
  const grp = (g) => seeds.filter((s) => GROUP[s.status] === g).length;
  check("F-09 the summary counts the stored tickets by the one status mapping: total 24, open, in progress and resolved match the seeds", sm.total === 24 && sm.open === grp("open") && sm.inProgress === grp("in_progress") && sm.resolved === grp("resolved") && sm.open + sm.inProgress + sm.resolved === 24, JSON.stringify(sm));
  check("F-10 a buyer with no tickets gets an empty list and zeros", (await list(C.s)).json.meta.total === 0 && JSON.stringify((await summary(C.s)).json.data.summary) === JSON.stringify({ total: 0, open: 0, inProgress: 0, resolved: 0 }));
  const cats = (await L.s.call("GET", "/api/buyer/support/categories")).json.data;
  check("F-11 the categories answer is the one configuration: the eleven categories, the four related types (no invoice or payment), eight statuses", cats.categories.length === 11 && cats.relatedTypes.map((t) => t.value).join() === "inquiry,quotation,order,product" && cats.statuses.length === 8 && !JSON.stringify(cats.relatedTypes).match(/invoice|payment/i));

  // ================= G: FAQ and channels
  const faqs = (await un.call("GET", "/api/public/faqs")).json.data.faqs;
  check("G-01 the FAQ answer holds published items only, each with a question and an answer, no internal flag, and every category it uses really has a published item", faqs.length >= 10 && faqs.every((f) => f.question && f.answer && !("published" in f)) && (await un.call("GET", "/api/public/faqs/categories")).json.data.categories.every((c) => c.count > 0 && faqs.some((f) => f.category === c.value)));
  check("G-02 FAQ category filter and search work; an unknown category or an over-long search is refused (400)", (await un.call("GET", "/api/public/faqs?category=inquiries")).json.data.faqs.every((f) => f.category === "inquiries") && (await un.call("GET", "/api/public/faqs?q=password")).json.data.faqs.length >= 1 && (await un.call("GET", "/api/public/faqs?q=zzzqqq")).json.data.faqs.length === 0 && (await un.call("GET", "/api/public/faqs?category=payments")).status === 400 && (await un.call("GET", `/api/public/faqs?q=${"x".repeat(80)}`)).status === 400);
  check("G-03 no FAQ states a payment option, fee, refund or return window, delivery promise or response time (none exists), and there are no Payments, Delivery or Returns categories", !faqs.some((f) => /refund (within|policy)|return (window|within|policy)|\b\d+\s*(business\s*)?(hours|days)\b|free (shipping|delivery)|\bfees?\b|we guarantee|guaranteed (delivery|refund|price|response)|24\s*\/\s*7|payment (options|methods)|credit card/i.test(f.question + " " + f.answer)) && (await un.call("GET", "/api/public/faqs/categories")).json.data.categories.every((c) => !/payment|delivery|return/i.test(c.label)));
  const ch = (await un.call("GET", "/api/public/support/channels")).json.data.channels;
  check("G-04 with no support e-mail or phone configured, the channels are the ticket form, Contact Us and Live Chat marked NOT available: no address, no number, nothing Online", ch.map((c) => c.key).join() === "ticket,contact,chat" && ch.find((c) => c.key === "chat").available === false && !JSON.stringify(ch).match(/online|@|\+91|tel:|mailto:/i));

  // ================= H: the pages (browser)
  const lp = await open("/buyer/support", { session: L.s });
  await hydrated(lp, "#ticket-search");
  await sleep(500);
  const nav = await lp.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, active: document.querySelector("#buyer-sidebar-footer [aria-current], aside [aria-current]")?.textContent.trim() ?? null, activeAll: [...document.querySelectorAll("[aria-current=page]")].map((e) => e.textContent.trim()), robots: document.querySelector("meta[name=robots]")?.content, crumb: document.querySelector("#buyer-content")?.textContent.slice(0, 70), kpis: [...document.querySelectorAll("ul[aria-label='Support ticket summary'] li")].map((li) => li.textContent.replace(/\s+/g, " ")), rows: document.querySelectorAll("tbody tr").length, contact: [...document.querySelectorAll("a")].find((a) => /Contact Support/.test(a.textContent))?.getAttribute("href"), raise: [...document.querySelectorAll("a")].find((a) => /Raise a New Ticket/.test(a.textContent))?.getAttribute("href") }));
  check("H-01 the page: buyer shell with Help & Support current, heading and breadcrumb, noindex, four cards with the real numbers, 20 rows on the first page, Contact Support (the Contact Us form) and Raise a New Ticket (the form) links, no console errors", lp.status === 200 && nav.h1 === "Help & Support" && nav.activeAll.some((t) => /Help & Support/.test(t)) && /Home \/ Buyer Dashboard \/ Help & Support/.test(nav.crumb) && /noindex/.test(nav.robots ?? "") && nav.kpis.length === 4 && /My Tickets\s*24/.test(nav.kpis[0]) && new RegExp(`Open Tickets\\s*${grp("open")}`).test(nav.kpis[1]) && new RegExp(`In Progress\\s*${grp("in_progress")}`).test(nav.kpis[2]) && new RegExp(`Resolved\\s*${grp("resolved")}`).test(nav.kpis[3]) && nav.rows === 20 && nav.contact === "/contact-us" && nav.raise === "#raise-ticket" && lp.errs.length === 0, JSON.stringify({ ...nav, kpis: nav.kpis }));
  const th = await lp.evaluate(() => [...document.querySelectorAll("thead th")].map((t) => t.textContent.trim()));
  check("H-02 the ticket table has the seven columns Ticket ID, Subject, Category, Related To, Status, Last Update, Actions; status is shown as words", th.join() === "Ticket ID,Subject,Category,Related To,Status,Last Update,Actions" && (await lp.evaluate(() => [...document.querySelectorAll("tbody tr td:nth-child(5)")].every((td) => /Open|Assigned|In Progress|Waiting for You|Waiting for Support|Resolved|Closed|Reopened/.test(td.textContent)))));
  await lp.type("#ticket-search", "FBM-SUP-202611-S030AA");
  await lp.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1, { timeout: 8000 }).catch(() => {});
  const sr = await lp.evaluate(() => ({ n: document.querySelectorAll("tbody tr").length, url: location.search }));
  check("H-03 search is debounced, filters in place (1 ticket), keeps the choice in the address; Clear search restores the list", sr.n === 1 && /q=FBM-SUP/.test(sr.url));
  await lp.click("button[aria-label='Clear search']");
  await lp.waitForFunction(() => document.querySelectorAll("tbody tr").length === 20, { timeout: 8000 }).catch(() => {});
  await clickText(lp, "button", "Filters");
  await lp.waitForSelector("[role=dialog]");
  await lp.evaluate(() => { const sel = [...document.querySelectorAll("[role=dialog] select")].find((x) => [...x.options].some((o) => o.value === "closed")); sel.value = "closed"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
  await clickText(lp, "[role=dialog] button", "Apply");
  await lp.waitForFunction((n) => document.querySelectorAll("tbody tr").length === n, { timeout: 8000 }, seeds.filter((s) => s.status === "CLOSED").length).catch(() => {});
  const flt = await lp.evaluate(() => ({ n: document.querySelectorAll("tbody tr").length, url: location.search, chips: [...document.querySelectorAll("ul[aria-label='Active filters'] li")].map((l) => l.textContent.trim()) }));
  check("H-04 the Filters dialog applies a status filter (Closed: the right tickets), shows a removable chip and keeps it in the address; Clear all filters restores the list", flt.n === seeds.filter((s) => s.status === "CLOSED").length && /status=closed/.test(flt.url) && flt.chips.some((c) => /Closed/.test(c)) && (await clickText(lp, "button", "Clear all filters")) && await lp.waitForFunction(() => document.querySelectorAll("tbody tr").length === 20, { timeout: 8000 }).then(() => true, () => false));
  await lp.select("#ticket-sort", "oldest");
  await lp.waitForFunction((r) => /sort=oldest/.test(location.search) && document.querySelector("tbody tr")?.textContent.includes(r), { timeout: 8000 }, seeds[23].ticketReference).catch(() => {});
  check("H-05 changing the sort re-reads the server: the oldest ticket is first", await lp.evaluate((r) => document.querySelector("tbody tr").textContent.includes(r), seeds[23].ticketReference));
  await clickText(lp, "[aria-label='Ticket pages'] button", "2");
  await lp.waitForFunction(() => /page=2/.test(location.search), { timeout: 8000 }).catch(() => {});
  await sleep(500);
  check("H-06 pagination moves to page 2 (4 remaining tickets) and the address carries it", (await lp.evaluate(() => document.querySelectorAll("tbody tr").length)) === 4 && /page=2/.test(await lp.evaluate(() => location.search)));
  await lp.evaluate(() => [...document.querySelectorAll("tbody a")].find((a) => /View ticket/.test(a.getAttribute("aria-label") ?? "")).click());
  await lp.waitForFunction(() => /\/buyer\/support\/tickets\/FBM-SUP-/.test(location.pathname), { timeout: 10000 }).catch(() => {});
  check("H-07 View opens the ticket's own page", /\/buyer\/support\/tickets\/FBM-SUP-/.test(await lp.evaluate(() => location.pathname)));
  await lp.context.close();

  // the FAQ, the channels and the empty state
  const ep = await open("/buyer/support", { session: C.s });
  await hydrated(ep, "#ticket-search");
  await sleep(400);
  const et = await content(ep);
  check("H-08 a buyer with no tickets sees 'No Support Tickets Yet' with Raise a New Ticket, zeros in the cards, the FAQ and the channels still there, and no console errors", /No Support Tickets Yet/.test(et) && /Raise a New Ticket/.test(et) && /My Tickets\s*0/.test(et) && /Frequently Asked Questions/.test(et) && /Other Ways to Get Help/.test(et) && ep.errs.length === 0);
  const faqUi = await ep.evaluate(() => { const btns = [...document.querySelectorAll("button[id$='-q'][aria-expanded]")]; return { n: btns.length, first: btns[0]?.getAttribute("aria-expanded"), regionHidden: document.getElementById(btns[0]?.getAttribute("aria-controls") ?? "")?.hidden }; });
  await ep.evaluate(() => document.querySelector("button[id$='-q'][aria-expanded]").click());
  await sleep(150);
  const faqOpen = await ep.evaluate(() => { const b = document.querySelector("button[id$='-q'][aria-expanded]"); return { exp: b.getAttribute("aria-expanded"), hidden: document.getElementById(b.getAttribute("aria-controls")).hidden, text: document.getElementById(b.getAttribute("aria-controls")).textContent.length }; });
  await ep.evaluate(() => document.querySelector("button[id$='-q'][aria-expanded]").click());
  await sleep(150);
  check("H-09 the FAQ accordion: every question is a button with aria-expanded and an answer region; opening shows the answer, closing hides it again", faqUi.n >= 10 && faqUi.first === "false" && faqUi.regionHidden === true && faqOpen.exp === "true" && faqOpen.hidden === false && faqOpen.text > 20 && (await ep.evaluate(() => document.querySelector("button[id$='-q'][aria-expanded]").getAttribute("aria-expanded"))) === "false");
  await ep.type("input[placeholder='Search the FAQs...']", "password");
  await sleep(200);
  const faqSearch = await ep.evaluate(() => document.querySelectorAll("button[id$='-q'][aria-expanded]").length);
  await ep.evaluate(() => { const inp = document.querySelector("input[placeholder='Search the FAQs...']"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(inp, ""); inp.dispatchEvent(new Event("input", { bubbles: true })); });
  await sleep(200);
  await ep.evaluate(() => { const sel = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "orders")); sel.value = "orders"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
  await sleep(200);
  const faqCat = await ep.evaluate(() => document.querySelectorAll("button[id$='-q'][aria-expanded]").length);
  check("H-10 the FAQ search and category choice narrow the list (password: few; Orders: only order questions)", faqSearch >= 1 && faqSearch < faqUi.n && faqCat >= 1 && faqCat < faqUi.n);
  const chUi = await ep.evaluate(() => { const sec = document.getElementById("other-ways"); return { text: sec.textContent.replace(/\s+/g, " "), links: [...sec.querySelectorAll("a")].map((a) => a.getAttribute("href")) }; });
  check("H-11 Other Ways to Get Help shows the ticket form and Contact Us links and Live Chat as 'not available yet'; no e-mail, phone or 'Online' appears because none is configured", /Support Ticket/.test(chUi.text) && /Contact Us form/.test(chUi.text) && /Live chat is not available yet/.test(chUi.text) && chUi.links.includes("#raise-ticket") && chUi.links.includes("/contact-us") && !/online|@|\+91/i.test(chUi.text) && !chUi.links.some((l) => /^(mailto|tel):/.test(l)));
  await ep.context.close();

  // creating a ticket in the browser
  fs.mkdirSync(`${STORE}/../tmp-support`, { recursive: true });
  const filePath = path.resolve(`${STORE}/../tmp-support/evidence.pdf`);
  fs.writeFileSync(filePath, PDF);
  const bp = await open("/buyer/support", { session: A.s });
  await hydrated(bp, "#ticket-search");
  await sleep(500);
  const tickets0 = await tks.countDocuments({ buyerId: A.id });
  await bp.evaluate(() => [...document.querySelectorAll("button[type=submit]")].find((b) => /Submit Ticket/.test(b.textContent)).click());
  const errsShown = await bp.evaluate(() => [...document.querySelectorAll("#raise-ticket [role=alert]")].map((e) => e.textContent));
  check("H-12 submitting an empty form shows the field messages (category, subject, description), saves nothing, and sends no request that creates a ticket", errsShown.length === 3 && (await tks.countDocuments({ buyerId: A.id })) === tickets0, errsShown.join(" | "));
  await bp.select("#raise-ticket select", "orders-delivery");
  await bp.evaluate(() => { const rt = [...document.querySelectorAll("#raise-ticket select")][1]; rt.value = "inquiry"; rt.dispatchEvent(new Event("change", { bubbles: true })); });
  await bp.waitForFunction(() => [...document.querySelectorAll("#raise-ticket select")][2]?.options.length > 1, { timeout: 8000 }).catch(() => {});
  const relOptions = await bp.evaluate(() => [...[...document.querySelectorAll("#raise-ticket select")][2].options].map((o) => o.value).filter(Boolean));
  await bp.evaluate(() => { const s = [...document.querySelectorAll("#raise-ticket select")][2]; s.value = "FBM-INQ-TKAAAAA1"; s.dispatchEvent(new Event("change", { bubbles: true })); });
  await bp.type("#raise-ticket input[placeholder^='Briefly']", "Browser ticket with a file");
  await bp.type("#raise-ticket textarea", "Created from the real page, with a PDF attached, to check the whole flow.");
  const fileInput = await bp.$("#raise-ticket input[type=file]");
  await fileInput.uploadFile(filePath);
  await sleep(200);
  const fileListed = await bp.evaluate(() => [...document.querySelectorAll("#raise-ticket ul[aria-label='Files to attach'] li")].map((l) => l.textContent));
  await bp.evaluate(() => { const b = [...document.querySelectorAll("button[type=submit]")].find((x) => /Submit Ticket/.test(x.textContent)); b.click(); b.click(); });
  await bp.waitForFunction(() => /Browser ticket with a file/.test(document.querySelector("tbody")?.textContent ?? ""), { timeout: 15000 }).catch(() => {});
  await sleep(500);
  const created = await tks.find({ buyerId: A.id, subject: "Browser ticket with a file" }).toArray();
  check("H-13 Related To lists only the buyer's own inquiries; the form attaches the file, shows its name, and one real submission (a double click is the same ticket) saves exactly one OPEN ticket with its related inquiry and one private file", relOptions.join() === "FBM-INQ-TKAAAAA1" && fileListed.some((t) => /evidence\.pdf/.test(t)) && created.length === 1 && created[0].status === "OPEN" && created[0].related?.reference === "FBM-INQ-TKAAAAA1" && created[0].attachments.length === 1, JSON.stringify({ relOptions, n: created.length }));
  const after = await bp.evaluate(() => ({ firstRow: document.querySelector("tbody tr")?.textContent ?? "", subject: document.querySelector("#raise-ticket input[placeholder^='Briefly']").value, desc: document.querySelector("#raise-ticket textarea").value, kpi: document.querySelector("ul[aria-label='Support ticket summary'] li")?.textContent.replace(/\s+/g, " "), toast: document.body.textContent.includes("was saved") }));
  check("H-14 after saving: the new ticket is the first row (newest), the form is cleared, the My Tickets number went up by one, and the confirmation says it was saved and that no support team replies yet", after.firstRow.includes("Browser ticket with a file") && after.subject === "" && after.desc === "" && new RegExp(`My Tickets\\s*${tickets0 + 1}`).test(after.kpi) && after.toast, JSON.stringify(after).slice(0, 200));
  const newRef = created[0]?.ticketReference;
  await bp.context.close();
  const tp = await open(`/buyer/support/tickets/${newRef}`, { session: A.s });
  const tt = await content(tp);
  const tinfo = await tp.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, robots: document.querySelector("meta[name=robots]")?.content, dl: [...document.querySelectorAll("a[download]")].map((a) => a.getAttribute("href")) }));
  check("H-15 the ticket page: heading, breadcrumb to the reference, noindex, the description as written, the related inquiry linked, the attachment with a download link, and an honest 'no reply from support yet' note (the reply box and history are Page 37)", tinfo.h1 === "Support Ticket Details" && new RegExp(`Help & Support / Ticket Details / ${newRef}`).test(tt) && /noindex/.test(tinfo.robots ?? "") && /Created from the real page/.test(tt) && /evidence\.pdf/.test(tt) && tinfo.dl.length === 1 && /No reply from Finbyn Mart Support yet/i.test(tt) && Boolean(await tp.$("form[aria-label='Reply to support'] textarea")) && tp.errs.length === 0);
  const dlResp = await tp.evaluate(async (href) => { const r = await fetch(href); const b = new Uint8Array(await r.arrayBuffer()); return { status: r.status, len: b.length, magic: String.fromCharCode(...b.slice(0, 5)) }; }, tinfo.dl[0]);
  check("H-16 the attachment link on the ticket page downloads the real file for its owner", dlResp.status === 200 && dlResp.magic === "%PDF-" && dlResp.len === PDF.length);
  await tp.context.close();
  check("H-17 an unknown, malformed or another buyer's ticket reference is the 404 page", (await A.s.page("/buyer/support/tickets/FBM-SUP-202611-ZZZZZZ")).status === 404 && (await A.s.page("/buyer/support/tickets/bad")).status === 404 && (await B.s.page(`/buyer/support/tickets/${newRef}`)).status === 404);
  const sp = await SUPPLIER.page("/buyer/support");
  check("H-18 a supplier account opening the page sees no tickets", sp.status !== 200 || !/My Support Tickets/.test(sp.text));

  // ================= R: responsive
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const badW = [];
  for (const [p0, name] of [["/buyer/support", "page"], [`/buyer/support/tickets/${newRef}`, "ticket"]]) {
    for (const w of widths) {
      const p = await open(p0, { width: w, session: name === "page" ? L.s : A.s });
      const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const clipped = await p.evaluate(() => [...document.querySelectorAll("#buyer-content h1, #buyer-content h2, #buyer-content h3, #buyer-content li, #buyer-content label")].filter((e) => e.getClientRects().length && !e.classList.contains("visually-hidden") && e.scrollWidth > e.clientWidth + 1 && !/auto|scroll/.test(getComputedStyle(e).overflowX) && !e.closest("[class*=tableWrap]")).map((e) => `${e.tagName}:${e.textContent.slice(0, 24)}`));
      if (o > 0 || clipped.length || p.errs.length) badW.push(`${name}@${w}: overflow ${o}, clipped ${clipped.slice(0, 2).join("|")}, errors ${p.errs.length}`);
      if (w === 390 || (name === "page" && w === 1440)) await p.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/36-support-${name}-${w}.png`, fullPage: true });
      await p.context.close();
    }
  }
  check("R-01 no horizontal overflow, clipped headings, labels or cards, or console errors on the support page and a ticket page at 16 widths (320 to 2560)", badW.length === 0, badW.join("; "));
  const phone = await open("/buyer/support", { width: 390, session: L.s });
  const desk = await open("/buyer/support", { width: 1440, session: L.s });
  check("R-02 on a phone the tickets are cards (table hidden) and the form is one column; on a desktop the form is left of the table (two columns) and the cards are hidden", await phone.evaluate(() => getComputedStyle(document.querySelector("table").closest("[class*=tableWrap]")).display === "none" && getComputedStyle(document.querySelector("ul[aria-label='Your support tickets']")).display !== "none" && document.querySelector("#raise-ticket").getBoundingClientRect().right < window.innerWidth + 1) && await desk.evaluate(() => { const f = document.querySelector("#raise-ticket").getBoundingClientRect(), t = document.querySelector("[aria-labelledby=my-tickets-title]").getBoundingClientRect(); return f.right <= t.left + 1 && getComputedStyle(document.querySelector("ul[aria-label='Your support tickets']")).display === "none"; }));
  await phone.context.close(); await desk.context.close();
  const cut = [];
  for (const w of [900, 1024, 1100, 1280, 1366, 1440, 1600, 1920, 2560]) {
    const p = await open("/buyer/support", { width: w, session: L.s });
    const r = await p.evaluate(() => { const wrap = document.querySelector("table").closest("[class*=tableWrap]"); const last = [...document.querySelectorAll("thead th")].at(-1).getBoundingClientRect(); const box = wrap.getBoundingClientRect(); return { inner: wrap.scrollWidth - wrap.clientWidth, lastVisible: last.right <= box.right + 1 }; });
    if (r.inner > 1 || !r.lastVisible) cut.push(`@${w}: scroll ${r.inner}px, last column visible ${r.lastVisible}`);
    await p.context.close();
  }
  check("R-04 on desktop widths (900 to 2560) all seven table columns, including Last Update and Actions, are visible without scrolling inside the table", cut.length === 0, cut.join("; "));
  const kb = await open("/buyer/support", { session: L.s });
  await hydrated(kb, "#ticket-search");
  await clickText(kb, "button", "Filters");
  await kb.waitForSelector("[role=dialog]");
  const inDialog = await kb.evaluate(() => document.querySelector("[role=dialog]").contains(document.activeElement));
  await kb.keyboard.press("Escape");
  await sleep(300);
  const labels = await kb.evaluate(() => [...document.querySelectorAll("#raise-ticket input:not([type=file]), #raise-ticket select, #raise-ticket textarea")].every((e) => e.id && document.querySelector(`label[for="${e.id}"]`)));
  check("R-03 the filters dialog takes focus and closes on Escape; every form field has a label; required fields are announced; the file input is reachable by keyboard", inDialog && !(await kb.$("[role=dialog]")) && labels && (await kb.evaluate(() => document.querySelectorAll("#raise-ticket [required]").length)) === 3);
  await kb.context.close();

  if (process.env.SKIP_PERF === "1") return;
  // ================= P: performance (1,000 tickets)
  await clearLimits();
  const D = await register("perf");
  const bulk = Array.from({ length: 1000 }, (_, i) => seedDoc(D.id, i % 300, { ticketReference: `FBM-SUP-202611-P${String(i).padStart(4, "0").replace(/[ILOU]/g, "7")}`, createdAt: new Date(Date.now() - i * 3_600_000), updatedAt: new Date(Date.now() - i * 3_600_000), subject: i % 2 ? "Perf delivery ticket" : "Perf invoice ticket" }));
  await tks.insertMany(bulk);
  const t = {
    list: await timeIt(() => list(D.s, "?limit=20")),
    filtered: await timeIt(() => list(D.s, "?status=open&categoryId=orders-delivery&limit=20")),
    search: await timeIt(() => list(D.s, "?q=Perf%20delivery&limit=20")),
    last: await timeIt(() => list(D.s, "?page=50&limit=20")),
    summary: await timeIt(() => summary(D.s)),
    categories: await timeIt(() => D.s.call("GET", "/api/buyer/support/categories")),
    detail: await timeIt(() => detail(D.s, bulk[0].ticketReference)),
  };
  const create = [];
  for (let i = 0; i < 12; i++) { await clearLimits(); const s0 = performance.now(); const r = await rawPost(D.s, { subject: `Perf create ${i} ticket` }); create.push(performance.now() - s0); if (r.status !== 201) throw new Error(`perf create ${r.status} ${r.text}`); }
  const bytes = (await list(D.s, "?limit=20")).text.length;
  const par = await Promise.all(Array.from({ length: 10 }, () => list(D.s, "?limit=20")));
  console.log(`  PERF 1,000 tickets: ` + Object.entries(t).map(([k, v]) => `${k} p50 ${v.p50.toFixed(0)} p95 ${v.p95.toFixed(0)} p99 ${v.p99.toFixed(0)}`).join("; ") + `; create p50 ${med(create, 0.5).toFixed(0)} p95 ${med(create, 0.95).toFixed(0)} (${bytes} B)`);
  check("P-01 against the targets (p95): listing under 350 ms (also filtered, searched and on the last page), summary under 250, categories under 200, ticket creation under 500", t.list.p95 < 350 && t.filtered.p95 < 350 && t.search.p95 < 400 && t.last.p95 < 350 && t.summary.p95 < 250 && t.categories.p95 < 200 && med(create, 0.95) < 500, Object.entries(t).map(([k, v]) => `${k} ${v.p95.toFixed(0)}`).join(", ") + ` create ${med(create, 0.95).toFixed(0)}`);
  check("P-02 a list page is bounded (20 tickets under 25 KB with 1,000 stored) and ten simultaneous requests all succeed", bytes < 25_000 && par.every((r) => r.status === 200), `${bytes} B`);
  const plans = {};
  for (const [name, filter, sort] of [["newest", { buyerId: D.id }, { createdAt: -1, _id: -1 }], ["status", { buyerId: D.id, status: "OPEN" }, { createdAt: -1, _id: -1 }], ["statusUpdated", { buyerId: D.id, status: "OPEN" }, { updatedAt: -1, _id: -1 }], ["updated", { buyerId: D.id }, { updatedAt: -1, _id: -1 }], ["category", { buyerId: D.id, categoryId: "orders-delivery" }, { createdAt: -1, _id: -1 }]]) {
    const ex = await tks.find(filter).sort(sort).limit(20).explain("executionStats");
    plans[name] = { s: JSON.stringify(ex.queryPlanner.winningPlan), docs: ex.executionStats.totalDocsExamined };
  }
  check("P-03 every listing query uses an index: no collection scan, no blocking sort, and about a page of documents examined", Object.values(plans).every((p) => /IXSCAN/.test(p.s) && !/COLLSCAN/.test(p.s) && !/"SORT"/.test(p.s) && p.docs <= 40), Object.entries(plans).map(([k, p]) => `${k}: ${p.docs}`).join(", "));
}

async function cleanup() {
  if (process.env.KEEP === "1") return;
  const mine = await users.find({ email: { $regex: `^t36-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  const ids = mine.map((u) => u._id);
  const docs = await tks.find({ buyerId: { $in: ids } }, { projection: { attachments: 1 } }).toArray();
  for (const d of docs) for (const a of d.attachments ?? []) { try { fs.unlinkSync(path.join(STORE, a.ref)); } catch { /* gone */ } }
  await tks.deleteMany({ buyerId: { $in: ids } });
  await db.collection("inquiries").deleteMany({ buyerId: { $in: ids } });
  await db.collection("quotations").deleteMany({ buyerId: { $in: ids } });
  await db.collection("orders").deleteMany({ buyerId: { $in: ids } });
  await notifs.deleteMany({ buyerId: { $in: ids } });
  await db.collection("security_events").deleteMany({ userId: { $in: ids } });
  await users.deleteMany({ _id: { $in: ids } });
  try { fs.rmSync(`${STORE}/../tmp-support`, { recursive: true, force: true }); } catch { /* none */ }
  await clearLimits();
}

try {
  await main();
} catch (error) {
  check("suite ran to the end without throwing", false, String(error?.stack ?? error));
} finally {
  await cleanup();
  await browser.close();
  await client.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? "\nFAILED:\n" + failed.map((f) => " - " + f.name).join("\n") : ""}`);
process.exit(failed.length ? 1 : 0);
