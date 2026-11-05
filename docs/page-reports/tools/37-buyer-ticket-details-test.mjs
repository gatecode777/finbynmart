import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Page 37 (Buyer Support Ticket Details: /buyer/support/tickets/[ref], /api/buyer/support/tickets/[ref]/{messages,timeline,attachments,related,reopen,feedback}).
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test with BUYER_DOCS_DIR=R:/indiamartref/.next-audit/buyer-docs-test
// and NO SUPPORT_EMAIL configured, Chrome and puppeteer-core. Removes its own data at the end unless KEEP=1. SKIP_PERF=1 skips group P.
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
const users = db.collection("users"), tks = db.collection("support_tickets"), msgs = db.collection("support_messages"), fbs = db.collection("support_feedback"), notifs = db.collection("notifications");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const emailOf = (tag) => `t37-${stamp}-${tag}@example.test`;
let ipN = 0;
const nextIp = () => `10.37.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
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
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Detail ${tag.toUpperCase()} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: "Detail Test Traders", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register ${tag}: ${r.status} ${r.text}`);
  return { s, id: (await users.findOne({ email: emailOf(tag) }))._id };
};

const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(200, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 8)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 9)]);
const form = (payload, fl = []) => { const f = new FormData(); f.set("payload", JSON.stringify(payload)); for (const x of fl) f.append("files", new File([x.bytes], x.name, { type: x.type ?? "application/octet-stream" })); return f; };
const T = (ref, tail = "") => `/api/buyer/support/tickets/${ref}${tail}`;
const rawReply = (sess, ref, over = {}, fl = [], omitKey = false) => sess.call("POST", T(ref, "/messages"), form({ message: "This is my reply to support.", ...(omitKey ? {} : { idempotencyKey: key() }), ...over }, fl), true);
const reply = async (sess, ref, over = {}, fl = [], omitKey = false) => { await clearLimits(); return rawReply(sess, ref, over, fl, omitKey); };
const messages = (s, ref, q = "") => s.call("GET", T(ref, `/messages${q}`));
const timeline = (s, ref, q = "") => s.call("GET", T(ref, `/timeline${q}`));
const attachments = (s, ref, q = "") => s.call("GET", T(ref, `/attachments${q}`));
const reopen = async (s, ref, body, keep = false) => { if (!keep) await clearLimits(); return s.call("POST", T(ref, "/reopen"), body); };
const feedback = async (s, ref, body, keep = false) => { if (!keep) await clearLimits(); return s.call("POST", T(ref, "/feedback"), body); };

const mkTicket = async (buyerId, over = {}) => {
  const createdAt = over.createdAt ?? ago(10);
  const doc = { ticketReference: `FBM-SUP-202611-${rand(6)}`, buyerId, categoryId: "inquiry-rfq", subject: "Seeded ticket subject", description: "Seeded description of the problem.", status: "OPEN", priority: "NORMAL", assignedAgentId: null, attachments: [], events: [{ type: "CREATED", at: createdAt, actor: "buyer", status: "OPEN" }], idempotencyKey: key(), createdAt, updatedAt: createdAt, notification: { supportEmail: "not_configured" }, ...over };
  const r = await tks.insertOne(doc);
  return { ...doc, _id: r.insertedId };
};
const resolvedTicket = (buyerId, daysAgo, over = {}) => {
  const at = ago(daysAgo);
  return mkTicket(buyerId, { status: "RESOLVED", createdAt: ago(daysAgo + 5), updatedAt: at, events: [{ type: "CREATED", at: ago(daysAgo + 5), actor: "buyer", status: "OPEN" }, { type: "STATUS_CHANGED", at, actor: "support", from: "IN_PROGRESS", status: "RESOLVED" }], ...over });
};
const mkMsg = (t, over = {}) => ({ ticketId: t._id, ticketReference: t.ticketReference, buyerId: t.buyerId, senderRole: "buyer", kind: "reply", visibility: "buyer", body: "Seeded message", attachments: [], createdAt: new Date(), ...over });
const seedMessages = async (t, n, startMsAgo, stepMs = 1000, over = (i) => ({})) => {
  const base = Date.now() - startMsAgo;
  const docs = Array.from({ length: n }, (_, i) => mkMsg(t, { body: `Seeded message ${i}`, createdAt: new Date(base + i * stepMs), senderRole: i % 5 === 4 ? "support" : "buyer", ...over(i) }));
  for (let i = 0; i < docs.length; i += 5000) await msgs.insertMany(docs.slice(i, i + 5000));
  return docs;
};

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
const hydrated = (p, sel) => p.waitForFunction((s) => Object.keys(document.querySelector(s) ?? {}).some((k) => k.startsWith("__react")), { timeout: 10000 }, sel).catch(() => {});
const clickText = (p, selector, t) => p.evaluate((s, x) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(x) && e.getClientRects().length); if (!el) return false; el.click(); return true; }, selector, t);
const seq = async (list, fn) => { const out = []; for (const x of list) out.push(await fn(x)); return out; };
const med = (a, q) => { const x = [...a].sort((m, n) => m - n); return x[Math.min(x.length - 1, Math.floor(q * x.length))]; };
const timeIt = async (fn, n = 40) => { await fn(); const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); await fn(); t.push(performance.now() - s); } return { p50: med(t, 0.5), p95: med(t, 0.95), p99: med(t, 0.99) }; };
const tabText = (p, name) => p.evaluate((n) => { const b = [...document.querySelectorAll("[role=tab]")].find((x) => x.textContent.trim() === n); return b ? { selected: b.getAttribute("aria-selected"), panel: document.getElementById(b.getAttribute("aria-controls"))?.hidden } : null; }, name);

async function main() {
  const A = await register("a"), B = await register("b"), R = await register("rl");
  const SUPPLIER = new Session();
  await SUPPLIER.call("POST", "/api/auth/register/supplier", { businessName: "Detail Supplier Co", contactName: "Sia Rao", email: emailOf("sup"), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  const SUSP = await register("susp");
  await users.updateOne({ _id: SUSP.id }, { $set: { accountStatus: "SUSPENDED" } });

  // related records
  const now = new Date();
  const inq = db.collection("inquiries"), qts = db.collection("quotations"), ords = db.collection("orders");
  await inq.insertMany([{ buyerId: A.id, buyerType: "REGISTERED", reference: "FBM-INQ-TDAAAAA1", supplierKey: "shree-textiles", supplierName: "Shree Textiles", productName: "Cotton Poplin Fabric", quantity: 5, unit: "Meter", message: "m", inquiryType: "GET_BEST_QUOTE", status: "NEW", statusHistory: [], createdAt: now, updatedAt: now }]);
  await qts.insertMany([{ reference: "FBM-QT-TDAAAAA1", version: 1, isCurrent: true, inquiryId: new ObjectId(), inquiryReference: "FBM-INQ-TDAAAAA1", buyerId: A.id, supplierKey: "shree-textiles", supplierName: "Shree Textiles", productName: "Cotton Poplin Fabric", currency: "INR", unit: "Meter", quantity: 1, unitPriceMinor: 100, validUntil: new Date(Date.now() + 30 * DAY), status: "SENT", sentAt: now, createdAt: now, updatedAt: now, events: [] }]);
  await ords.insertMany([{ reference: "FBM-ORD-TDAAAAA1", buyerId: A.id, supplierKey: "shree-textiles", supplierName: "Shree Textiles", items: [{ name: "Cotton", quantity: 5, unit: "Meter", unitPriceMinor: 100 }], itemCount: 1, currency: "INR", totalMinor: 500, status: "CONFIRMED", events: [], expectedSort: new Date("9999-12-31"), placedAt: now, updatedAt: now }]);

  // the tickets
  const GOODTICKET = { category: "inquiry-rfq", subject: "Inquiry not submitting", description: "I am not able to submit a new inquiry. It shows an error.", related: { type: "inquiry", reference: "FBM-INQ-TDAAAAA1" } };
  await clearLimits();
  const created = await A.s.call("POST", "/api/buyer/support/tickets", form({ ...GOODTICKET, idempotencyKey: key() }, [{ name: "inquiry-error.png", bytes: PNG, type: "image/png" }]), true);
  const T1 = created.json.ticket.reference;
  const t1doc = await tks.findOne({ ticketReference: T1 });
  const tB = await mkTicket(B.id, { subject: "Buyer B private ticket", description: "Private description of buyer B." });
  const supportFile = `${randomBytes(16).toString("hex")}.pdf`;
  fs.mkdirSync(STORE, { recursive: true });
  fs.writeFileSync(path.join(STORE, supportFile), PDF);
  const internalFile = `${randomBytes(16).toString("hex")}.pdf`;
  fs.writeFileSync(path.join(STORE, internalFile), PDF);

  // ================= A: access
  const un = new Session();
  const routes = (r) => [["GET", T(r)], ["GET", T(r, "/messages")], ["POST", T(r, "/messages"), form({ message: "hello there", idempotencyKey: key() }), true], ["GET", T(r, "/timeline")], ["GET", T(r, "/attachments")], ["GET", T(r, "/related")], ["POST", T(r, "/reopen"), { reason: "Still not working." }], ["POST", T(r, "/feedback"), { rating: 5 }]];
  const anon = await Promise.all(routes(T1).map(([m, p, b, raw]) => un.call(m, p, b, raw)));
  check("A-01 no session: every ticket route (detail, messages, send, timeline, files, related, reopen, feedback) answers 401, private, with nothing of the ticket", anon.every((r) => r.status === 401 && /no-store/.test(r.headers.get("cache-control") ?? "") && !/Inquiry not submitting|FBM-SUP-2026/.test(r.text ?? "")), anon.map((r) => r.status).join(" "));
  const sup = await Promise.all(routes(T1).map(([m, p, b, raw]) => SUPPLIER.call(m, p, b, raw)));
  check("A-02 a supplier account: every ticket route answers 403", sup.every((r) => r.status === 403), sup.map((r) => r.status).join(" "));
  const forged = new Session(); forged.jar.set("finbyn_session", "garbage.value");
  check("A-03 a suspended buyer's session and a forged cookie: 401 on the conversation", (await messages(SUSP.s, T1)).status === 401 && (await messages(forged, T1)).status === 401);
  const anonPage = await un.page(`/buyer/support/tickets/${T1}`);
  check("A-04 the ticket page without a session redirects to sign-in and carries no ticket data", [302, 303, 307, 308].includes(anonPage.status) && /sign-in/.test(anonPage.location ?? "") && !/Inquiry not submitting/.test(anonPage.text));

  // ================= B: detail and ownership
  const det = await A.s.call("GET", T(T1));
  const o = det.json?.data;
  check("B-01 the ticket answer: reference, subject, category, status, dates, related record, and what the buyer may do now (calculated by the server), private no-store", det.status === 200 && o.reference === T1 && o.subject === "Inquiry not submitting" && o.category.label === "Inquiry & RFQ" && o.status === "OPEN" && o.statusLabel === "Open" && o.related.reference === "FBM-INQ-TDAAAAA1" && o.capabilities.canReply === true && o.capabilities.canReopen === false && o.capabilities.canSubmitFeedback === false && o.capabilities.canRequestClosure === false && o.hasSupportReply === false && o.feedback.submitted === false && o.limits.maxFiles === 5 && /no-store/.test(det.headers.get("cache-control") ?? ""));
  check("B-02 the reasons are given for what is not allowed (reopen and feedback on an open ticket)", o.reasons.reply === null && o.reasons.reopen === null && /resolved or closed/.test(o.reasons.feedback));
  const foreign = await Promise.all(routes(T1).map(([m, p, b, raw]) => B.s.call(m, p, b, raw)));
  check("B-03 another buyer opening this ticket through ANY route gets the same 404 with nothing of the ticket", foreign.every((r) => r.status === 404) && new Set(foreign.map((r) => r.json?.message)).size === 1 && foreign.every((r) => !/Inquiry not submitting|I am not able|inquiry-error/.test(r.text ?? "")), foreign.map((r) => r.status).join(" "));
  const bad = await Promise.all(["not-a-ticket", "FBM-SUP-202611-ZZZZZZ", "FBM-SUP-2026-ABC", "..%2F..%2Fetc"].map((r) => A.s.call("GET", T(r, "/messages"))));
  check("B-04 malformed and unknown references answer the same 404 message as another buyer's ticket", bad.every((r) => r.status === 404 && r.json?.message === foreign[0].json?.message));
  check("B-05 a buyerId, userId or ticketId in the query is ignored: the session decides", (await messages(B.s, T1, `?buyerId=${A.id}&ticketId=${t1doc._id}`)).status === 404);
  const bpage = await B.s.page(`/buyer/support/tickets/${T1}`);
  check("B-06 the other buyer's ticket page is the site's 404 with nothing of it", bpage.status === 404 && !/Inquiry not submitting|I am not able/.test(bpage.text));
  const wrong = await Promise.all([A.s.call("DELETE", T(T1)), A.s.call("PUT", T(T1), { status: "RESOLVED" }), A.s.call("PATCH", T(T1), { status: "CLOSED" }), A.s.call("PUT", T(T1, "/messages"), {}), A.s.call("DELETE", T(T1, "/messages")), A.s.call("POST", T(T1, "/timeline"), {}), A.s.call("GET", T(T1, "/reopen")), A.s.call("GET", T(T1, "/feedback"))]);
  check("B-07 a buyer cannot set a status, delete a ticket or message, or use a route with the wrong method (405) and the ticket is unchanged", wrong.every((r) => r.status === 405) && (await tks.findOne({ ticketReference: T1 })).status === "OPEN", wrong.map((r) => r.status).join());

  // ================= C: conversation
  const c1 = await messages(A.s, T1);
  check("C-01 a new ticket's conversation is its original description (as written) with its attachment link, and nothing else", c1.status === 200 && c1.json.data.messages.length === 1 && c1.json.data.messages[0].kind === "original" && c1.json.data.messages[0].body === GOODTICKET.description && c1.json.data.messages[0].senderLabel === "You" && c1.json.data.messages[0].attachments[0].name === "inquiry-error.png" && c1.json.data.messages[0].attachments[0].href.startsWith(`/api/buyer/support/tickets/${T1}/attachments/`) && c1.json.meta.hasMore === false && c1.json.meta.nextCursor === null);
  const tOther = await mkTicket(A.id, { subject: "Another ticket of the same buyer" });
  await msgs.insertMany([
    mkMsg(t1doc, { senderRole: "support", body: "Thank you for contacting Finbyn Mart Support (test record).", createdAt: new Date(t1doc.createdAt.getTime() + 1000), attachments: [{ id: "aaaaaaaaaaaaaaa1", name: "support-guide.pdf", mime: "application/pdf", size: PDF.length, ref: supportFile }], hasFiles: true }),
    mkMsg(t1doc, { senderRole: "support", visibility: "internal", body: "INTERNAL NOTE: do not show this to the buyer.", createdAt: new Date(t1doc.createdAt.getTime() + 1500), attachments: [{ id: "aaaaaaaaaaaaaaa2", name: "internal-evidence.pdf", mime: "application/pdf", size: PDF.length, ref: internalFile }], hasFiles: true }),
    mkMsg(tOther, { body: "A message on the OTHER ticket.", createdAt: new Date(t1doc.createdAt.getTime() + 2000) }),
  ]);
  await tks.updateOne({ _id: t1doc._id }, { $set: { lastSupportReplyAt: new Date() } });
  const c2 = await messages(A.s, T1);
  const m2 = c2.json.data.messages;
  check("C-02 a support message shows with the support label and role; the internal note, its file and the other ticket's message never appear; the original description stays first", m2.length === 2 && m2[0].kind === "original" && m2[1].sender === "support" && m2[1].senderLabel === "Finbyn Mart Support" && /Thank you for contacting/.test(m2[1].body) && !/INTERNAL NOTE|OTHER ticket|internal-evidence/.test(c2.text));
  const ov2 = (await A.s.call("GET", T(T1))).json.data;
  check("C-03 once a support reply is recorded the ticket says so (hasSupportReply)", ov2.hasSupportReply === true);
  // a long conversation: 1,000 messages
  const tLong = await mkTicket(A.id, { subject: "Long conversation ticket", description: "The first message of a very long conversation." });
  await seedMessages(tLong, 1000, 3_600_000);
  await msgs.insertOne(mkMsg(tLong, { body: "HIDDEN internal", visibility: "internal", createdAt: new Date(Date.now() - 1_000_000) }));
  const page1 = await messages(A.s, tLong.ticketReference);
  check("C-04 a 1,000-message conversation opens on the NEWEST 20 (oldest first inside the page), says there is more, and does not contain the original description yet", page1.json.data.messages.length === 20 && page1.json.meta.hasMore === true && Boolean(page1.json.meta.nextCursor) && page1.json.data.messages[19].body === "Seeded message 999" && page1.json.data.messages[0].body === "Seeded message 980" && !page1.json.data.messages.some((m) => m.kind === "original"));
  const seen = new Map(); let cursor = null; let pages = 0; let first = null; let ordered = true; let prevKey = null; const all = [];
  for (;;) {
    const r = await messages(A.s, tLong.ticketReference, `?limit=50${cursor ? `&before=${encodeURIComponent(cursor)}` : ""}`);
    pages++;
    const ms = r.json.data.messages;
    for (const m of ms) { seen.set(m.id, m.body); }
    all.unshift(...ms);
    if (!r.json.meta.hasMore) { first = ms[0]; break; }
    cursor = r.json.meta.nextCursor;
    if (pages > 40) break;
  }
  for (const m of all) { if (m.key) { if (prevKey && m.key < prevKey) ordered = false; prevKey = m.key; } }
  check("C-05 walking back 50 at a time reaches every message exactly once (1,000 messages + the original description at the very start), in time order, in 20 pages, and the internal note never appears", pages === 20 && seen.size === 1001 && first.kind === "original" && ordered && ![...seen.values()].some((b) => /HIDDEN internal/.test(b)) && all.length === 1001, `${pages} pages, ${seen.size} distinct`);
  const badQ = await Promise.all(["?limit=51", "?limit=0", "?limit=abc", "?limit=-5", "?before=garbage", `?before=${encodeURIComponent("{\"$ne\":1}")}`, "?before[$gt]=1"].map((q) => messages(A.s, tLong.ticketReference, q)));
  check("C-06 a page size over 50, zero or text, and a malformed or operator-style cursor are refused (400): an operator key is ignored; nothing unbounded is ever returned", badQ.slice(0, 6).every((r) => r.status === 400) && badQ[6].status === 200 && badQ[6].json.data.messages.length === 20, badQ.map((r) => r.status).join(" "));
  const tTies = await mkTicket(A.id, { subject: "Same millisecond ticket" });
  const sameMs = new Date(Date.now() - 600_000);
  await msgs.insertMany(Array.from({ length: 30 }, (_, i) => mkMsg(tTies, { body: `Tie ${i}`, createdAt: sameMs })));
  const tieSeen = new Set(); let tc = null;
  for (let n = 0; n < 10; n++) { const r = await messages(A.s, tTies.ticketReference, `?limit=7${tc ? `&before=${encodeURIComponent(tc)}` : ""}`); r.json.data.messages.forEach((m) => tieSeen.add(m.id)); if (!r.json.meta.hasMore) break; tc = r.json.meta.nextCursor; }
  check("C-07 thirty messages written in the same millisecond are paged without repeating or skipping any (the id breaks the tie)", tieSeen.size === 31, `${tieSeen.size}`);
  // text, not HTML
  const tHtml = await mkTicket(A.id, { subject: "Markup ticket", description: "Line one\n\nLine three" });
  await msgs.insertOne(mkMsg(tHtml, { senderRole: "support", body: "<img src=x onerror=\"window.__pwned=1\"> and <b>bold</b>\nsecond line", createdAt: new Date() }));
  const longWord = "W".repeat(400);
  await msgs.insertOne(mkMsg(tHtml, { body: longWord, createdAt: new Date(Date.now() + 1000) }));

  // ================= D: reply
  const before = (await tks.findOne({ _id: t1doc._id })).updatedAt;
  const ok = await reply(A.s, T1, { message: "  First reply\nwith a second line  " });
  const mdoc = await msgs.findOne({ ticketId: t1doc._id, body: "First reply\nwith a second line" });
  check("D-01 a valid reply is saved (201): sender You, role buyer from the session, visibility buyer, kind reply, the text trimmed with its line break; the answer is the saved message; the ticket's last update moved; the answer says the support team was not notified", ok.status === 201 && ok.json.data.message.sender === "buyer" && ok.json.data.message.senderLabel === "You" && ok.json.data.message.body === "First reply\nwith a second line" && mdoc && String(mdoc.buyerId) === String(A.id) && mdoc.senderRole === "buyer" && mdoc.visibility === "buyer" && mdoc.kind === "reply" && mdoc.supportEmail === "not_configured" && (await tks.findOne({ _id: t1doc._id })).updatedAt > before && ok.json.supportNotified === false, ok.text?.slice(0, 200));
  const afterReply = await messages(A.s, T1);
  check("D-02 the saved reply is in the conversation after the support message, in time order", afterReply.json.data.messages.map((m) => m.body).slice(-2).join("|") === "Thank you for contacting Finbyn Mart Support (test record).|First reply\nwith a second line");
  const n0 = await msgs.countDocuments({ ticketId: t1doc._id });
  const badR = await Promise.all([reply(A.s, T1, { message: "" }), reply(A.s, T1, { message: "     \n   " }), reply(A.s, T1, { message: "a" }), reply(A.s, T1, { message: "x".repeat(2001) }), reply(A.s, T1, { message: "<script>alert(1)</script>" }), reply(A.s, T1, {}, [], true), reply(A.s, T1, { idempotencyKey: "short" }), reply(A.s, T1, { message: 12345 }), reply(A.s, T1, { message: "hello there", extra: "x" })]);
  check("D-03 an empty, whitespace-only, one-character, 2,001-character, markup, key-less, bad-key, non-text or extra-field reply is refused (400) with field messages and nothing is stored", badR.every((r) => r.status === 400 && r.json?.fields && Object.keys(r.json.fields).length) && (await msgs.countDocuments({ ticketId: t1doc._id })) === n0, badR.map((r) => r.status).join(" "));
  check("D-04 two characters and 2,000 characters are accepted", (await reply(A.s, T1, { message: "ok" })).status === 201 && (await reply(A.s, T1, { message: "y".repeat(2000) })).status === 201);
  const forgedFields = await Promise.all(["senderId", "senderRole", "senderName", "role", "visibility", "kind", "status", "ticketId", "buyerId", "createdAt", "attachments", "internal"].map((k) => reply(A.s, T1, { [k]: k === "senderRole" || k === "role" ? "support" : k === "visibility" ? "internal" : k === "buyerId" ? String(B.id) : "RESOLVED" })));
  check("D-05 a sender, support role, visibility, kind, status, ticket, owner, date or attachment record sent by the client is refused (400): a buyer cannot pose as support", forgedFields.every((r) => r.status === 400 && r.json?.fields) && (await msgs.countDocuments({ ticketId: t1doc._id, senderRole: "support", body: { $regex: "^(This is my reply)" } })) === 0);
  const k1 = key();
  const d1 = await reply(A.s, T1, { idempotencyKey: k1, message: "Duplicate send test" });
  const d2 = await reply(A.s, T1, { idempotencyKey: k1, message: "Duplicate send test" });
  check("D-06 sending the same reply twice (same key) saves one message: the second answer is 200 duplicate with the same message", d1.status === 201 && d2.status === 200 && d2.json.duplicate === true && d1.json.data.message.id === d2.json.data.message.id && (await msgs.countDocuments({ ticketId: t1doc._id, idempotencyKey: k1 })) === 1);
  const k2 = key();
  await clearLimits();
  const race = await Promise.all([1, 2, 3, 4].map(() => rawReply(A.s, T1, { idempotencyKey: k2, message: "Simultaneous send test" })));
  check("D-07 four simultaneous sends of one reply save exactly one message and every answer names it", (await msgs.countDocuments({ ticketId: t1doc._id, idempotencyKey: k2 })) === 1 && new Set(race.map((r) => r.json?.data?.message?.id)).size === 1, race.map((r) => r.status).join(" "));
  const tRes = await resolvedTicket(A.id, 2);
  const tClosed = await mkTicket(A.id, { status: "CLOSED", events: [{ type: "CREATED", at: ago(9), actor: "buyer", status: "OPEN" }, { type: "STATUS_CHANGED", at: ago(1), actor: "support", from: "RESOLVED", status: "CLOSED" }], updatedAt: ago(1) });
  const blocked = await Promise.all([reply(A.s, tRes.ticketReference, { message: "Reply on resolved" }), reply(A.s, tClosed.ticketReference, { message: "Reply on closed" })]);
  check("D-08 a reply on a resolved or a closed ticket is refused (409) with a reason that points to reopening, and nothing is stored", blocked.every((r) => r.status === 409 && r.json?.code === "NOT_ALLOWED" && /Reopen/i.test(r.json.message)) && (await msgs.countDocuments({ ticketId: { $in: [tRes._id, tClosed._id] } })) === 0, blocked.map((r) => r.status).join(" "));
  const tWait = await mkTicket(A.id, { status: "WAITING_FOR_BUYER", subject: "Waiting for buyer ticket" });
  const w = await reply(A.s, tWait.ticketReference, { message: "Here is the information you asked for." });
  const wdoc = await tks.findOne({ _id: tWait._id });
  check("D-09 a reply on a ticket waiting for the buyer moves it to In Progress (the allowed transition), with the event recorded by the buyer; the answer says so", w.status === 201 && w.json.data.status === "IN_PROGRESS" && w.json.data.statusChanged === true && wdoc.status === "IN_PROGRESS" && wdoc.events.at(-1).type === "STATUS_CHANGED" && wdoc.events.at(-1).from === "WAITING_FOR_BUYER" && wdoc.events.at(-1).actor === "buyer");
  const tIp = await mkTicket(A.id, { status: "IN_PROGRESS" });
  await reply(A.s, tIp.ticketReference, { message: "A reply while in progress" });
  check("D-10 a reply on any other open status leaves the status alone", (await tks.findOne({ _id: tIp._id })).status === "IN_PROGRESS" && (await tks.findOne({ _id: tIp._id })).events.length === 1);
  const f0 = files().length;
  const withFiles = await reply(A.s, T1, { message: "Reply with three files" }, [{ name: "invoice.pdf", bytes: PDF, type: "application/pdf" }, { name: "screen.PNG", bytes: PNG, type: "image/png" }, { name: "photo.jpeg", bytes: JPG, type: "image/jpeg" }]);
  const wm = await msgs.findOne({ ticketId: t1doc._id, body: "Reply with three files" });
  check("D-11 a reply with a PDF, a PNG and a JPEG whose content is that type is saved (201) with three attachments, a files marker, and three new private files under random names", withFiles.status === 201 && withFiles.json.data.message.attachments.length === 3 && wm.hasFiles === true && wm.attachments.every((a) => /^[a-f0-9]{32}\.(pdf|png|jpg)$/.test(a.ref) && !a.ref.includes("invoice")) && files().length === f0 + 3 && !withFiles.text.includes(wm.attachments[0].ref));
  const f1 = files().length; const n1 = await msgs.countDocuments({ ticketId: t1doc._id });
  const rejected = await Promise.all([
    reply(A.s, T1, {}, [{ name: "fake.pdf", bytes: Buffer.from("plain text, not a pdf"), type: "application/pdf" }]),
    reply(A.s, T1, {}, [{ name: "mismatch.jpg", bytes: PNG, type: "image/jpeg" }]),
    reply(A.s, T1, {}, [{ name: "run.exe", bytes: PDF, type: "application/pdf" }]),
    reply(A.s, T1, {}, [{ name: "ok.pdf", bytes: PDF }, { name: "bad.pdf", bytes: Buffer.from("not a pdf either") }]),
    reply(A.s, T1, {}, Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.pdf`, bytes: PDF }))),
  ]);
  const big = await reply(A.s, T1, {}, [{ name: "big.pdf", bytes: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(11 * 1024 * 1024, 1)]) }]);
  check("D-12 a text file named .pdf, a PNG named .jpg, an .exe, a batch with one bad file, six files (400) and a file over 10 MB (413) are refused and NO file and NO message is left behind", rejected.every((r) => r.status === 400) && big.status === 413 && files().length === f1 && (await msgs.countDocuments({ ticketId: t1doc._id })) === n1, `${rejected.map((r) => r.status).join(" ")} ${big.status}`);
  const rb = await reply(B.s, T1, { message: "Intrusion attempt reply" });
  check("D-13 another buyer cannot reply to this ticket: 404, nothing stored", rb.status === 404 && (await msgs.countDocuments({ body: "Intrusion attempt reply" })) === 0);
  const noteCount = await notifs.countDocuments({ buyerId: A.id, type: { $regex: "SUPPORT|REPLY" } });
  check("D-14 no notification pretends support answered: nothing was created for the buyer's own replies (the only support notification is the ticket-created confirmation)", (await notifs.countDocuments({ buyerId: A.id, category: "support", type: { $ne: "TICKET_CREATED" } })) === 0 && noteCount === 0);
  await clearLimits();
  const rl = []; const tRl = await mkTicket(R.id, { subject: "Rate limit ticket" });
  for (let i = 0; i < 32; i++) rl.push(await rawReply(R.s, tRl.ticketReference, { message: `Rate limit reply ${i}` }));
  check("D-15 replies are limited per buyer: the first 30 in an hour are saved, the 31st and 32nd get 429 with Retry-After and are not stored", rl.slice(0, 30).every((r) => r.status === 201) && rl[30].status === 429 && rl[31].status === 429 && rl[30].headers.get("retry-after") > 0 && (await msgs.countDocuments({ ticketId: tRl._id })) === 30);
  await clearLimits();

  // ================= E: files tab
  const fl = await attachments(A.s, T1);
  const names = fl.json.data.files.map((f) => `${f.source}:${f.name}:${f.uploadedBy}`);
  check("E-01 the files answer groups the original ticket's file, the support reply's file and the buyer's reply files with who sent them; the internal message's file is absent; there is no storage path", fl.status === 200 && names.includes("ticket:inquiry-error.png:You") && names.includes("reply:support-guide.pdf:Support") && names.filter((n) => n.startsWith("reply:") && n.endsWith(":You")).length === 3 && !/internal-evidence/.test(fl.text) && !fl.json.data.files.some((f) => f.ref) && !new RegExp(supportFile.replace(".", "\\.")).test(fl.text) && fl.json.data.files.every((f) => f.href.startsWith(`/api/buyer/support/tickets/${T1}/attachments/`) && f.atLabel && f.size > 0));
  const fp = []; let fc = null;
  for (let n = 0; n < 10; n++) { const r = await attachments(A.s, T1, `?limit=1${fc ? `&after=${encodeURIComponent(fc)}` : ""}`); fp.push(...r.json.data.files.map((f) => f.id)); if (!r.json.meta.hasMore) break; fc = r.json.meta.nextCursor; }
  check("E-02 the files are paged by message (limit 1): every file once, in order, the original submission's file on the first page only", fp.length === fl.json.data.files.length && new Set(fp).size === fp.length);
  const sf = fl.json.data.files.find((f) => f.name === "support-guide.pdf");
  const dl = await A.s.call("GET", sf.href);
  check("E-03 the owner downloads a support file: the exact bytes, as a download, private no-store, nosniff", dl.status === 200 && dl.buf.equals(PDF) && /attachment/.test(dl.headers.get("content-disposition") ?? "") && /no-store/.test(dl.headers.get("cache-control") ?? "") && dl.headers.get("x-content-type-options") === "nosniff");
  const rf = fl.json.data.files.find((f) => f.uploadedBy === "You" && f.source === "reply");
  const dlr = await A.s.call("GET", rf.href);
  check("E-04 the owner downloads a reply file too (bytes equal to what was sent)", dlr.status === 200 && [PDF, PNG, JPG].some((b) => dlr.buf.equals(b)));
  const other = await Promise.all([B.s.call("GET", sf.href), un.call("GET", sf.href), SUPPLIER.call("GET", sf.href), A.s.call("GET", T(T1, "/attachments/aaaaaaaaaaaaaaa2")), A.s.call("GET", T(tOther.ticketReference, `/attachments/aaaaaaaaaaaaaaa1`)), A.s.call("GET", T(T1, "/attachments/..%2F..%2Fetc")), A.s.call("GET", T(T1, "/attachments/ffffffffffffffff"))]);
  check("E-05 another buyer 404, anonymous 401, supplier 403; the internal message's file, a file asked for through a different ticket, a path-like id and an unknown id all 404", other[0].status === 404 && other[1].status === 401 && other[2].status === 403 && other.slice(3).every((r) => r.status === 404) && !other[0].buf.equals(PDF), other.map((r) => r.status).join(" "));

  // ================= F: timeline
  const tl = await timeline(A.s, T1);
  const titles = tl.json.data.items.map((i) => i.title);
  check("F-01 the timeline is the recorded activity oldest first: ticket created, then the support reply and the buyer's replies as they happened; the internal note is absent; each entry has an actor and a time", tl.status === 200 && titles[0] === "Ticket created" && titles.includes("Support replied") && titles.filter((t) => t === "You replied").length >= 5 && !/INTERNAL|internal/.test(tl.text) && tl.json.data.items.every((i) => i.actor && i.atLabel && i.at) && tl.json.data.items.every((v, i, a) => i === 0 || a[i - 1].key <= v.key), JSON.stringify({ first: titles[0], support: titles.includes("Support replied"), replied: titles.filter((t) => t === "You replied").length, internal: /INTERNAL|internal/.test(tl.text), titles }).slice(0, 300));
  const tp = []; let tcur = null;
  for (let n = 0; n < 40; n++) { const r = await timeline(A.s, T1, `?limit=3${tcur ? `&after=${encodeURIComponent(tcur)}` : ""}`); tp.push(...r.json.data.items.map((i) => i.key)); if (!r.json.meta.hasMore) break; tcur = r.json.meta.nextCursor; }
  const fullTl = (await timeline(A.s, T1, "?limit=50")).json.data.items.map((i) => i.key);
  check("F-02 paging the timeline 3 at a time (events and messages merged) gives exactly the same entries as one big page: none repeated, none skipped", tp.join() === fullTl.join() && new Set(tp).size === tp.length && tp.length > 6, `${tp.length}`);
  const dupBefore = (await timeline(A.s, T1, "?limit=50")).json.data.items.length;
  await reply(A.s, T1, { idempotencyKey: k1, message: "Duplicate send test" });
  check("F-03 a retried send adds no second timeline entry", (await timeline(A.s, T1, "?limit=50")).json.data.items.length === dupBefore);
  await tks.updateOne({ _id: t1doc._id }, { $push: { events: { $each: [{ type: "STATUS_CHANGED", at: new Date(Date.now() - 4_000_000), actor: "support", from: "OPEN", status: "ASSIGNED" }, { type: "STATUS_CHANGED", at: new Date(Date.now() - 3_900_000), actor: "support", internal: true, from: "ASSIGNED", status: "IN_PROGRESS" }] } } });
  const tl2 = (await timeline(A.s, T1, "?limit=50")).json.data.items;
  check("F-04 a recorded status change by support appears ('Status changed', from Open to Assigned, actor Support) in time order; an internal-only event never does", tl2.some((i) => i.title === "Status changed" && /From Open to Assigned/.test(i.description) && i.actor === "Support") && !tl2.some((i) => /Assigned to In Progress/.test(i.description)) && tl2.every((v, i, a) => i === 0 || a[i - 1].key <= v.key));
  const tlLong = await timeline(A.s, tLong.ticketReference, "?limit=50");
  check("F-05 a 1,000-message conversation's timeline is bounded to 50 entries per page with a cursor, never the whole history", tlLong.json.data.items.length === 50 && tlLong.json.meta.hasMore === true && tlLong.text.length < 40_000, `${tlLong.text.length} B`);
  const badT = await Promise.all(["?limit=51", "?after=garbage", "?limit=0"].map((q) => timeline(A.s, T1, q)));
  check("F-06 timeline page size and cursor are validated (400)", badT.every((r) => r.status === 400));

  // ================= G: related
  const rel = async (r) => (await A.s.call("GET", T(r, "/related"))).json?.data?.related;
  const mkRel = (type, reference) => mkTicket(A.id, { related: { type, reference, label: `${reference} · Shree Textiles`, href: null }, subject: `Related ${type}` });
  const tRi = await mkRel("inquiry", "FBM-INQ-TDAAAAA1"), tRq = await mkRel("quotation", "FBM-QT-TDAAAAA1"), tRo = await mkRel("order", "FBM-ORD-TDAAAAA1"), tRp = await mkRel("product", "1163");
  const ri = await rel(tRi.ticketReference), rq = await rel(tRq.ticketReference), ro = await rel(tRo.ticketReference), rp = await rel(tRp.ticketReference);
  check("G-01 the related record is read again: inquiry (product, supplier, status, date, link), quotation, order and product (name, id, category, public link)", ri.available && ri.title === "Cotton Poplin Fabric" && ri.lines.some((l) => l.label === "Supplier" && l.value === "Shree Textiles") && ri.href === "/buyer/inquiries/FBM-INQ-TDAAAAA1" && rq.available && rq.href === "/buyer/quotations/FBM-QT-TDAAAAA1" && /Sent/.test(rq.status) && ro.available && ro.href === "/buyer/orders/FBM-ORD-TDAAAAA1" && rp.available && rp.href?.startsWith("/products/") && rp.lines.some((l) => l.label === "Category"));
  const noRel = (await A.s.call("GET", T(tOther.ticketReference, "/related"))).json.data;
  check("G-02 a ticket with no related record answers related null", noRel.related === null);
  await inq.updateOne({ reference: "FBM-INQ-TDAAAAA1" }, { $set: { buyerId: B.id } });
  const lost = await A.s.call("GET", T(tRi.ticketReference, "/related"));
  check("G-03 if the record is no longer the buyer's the answer is 'not available' with nothing of it (no supplier, product or status), and the stored link is not used", lost.json.data.related.available === false && !/Cotton|Shree|NEW|inquiries/.test(lost.text.replace(/FBM-INQ-TDAAAAA1/g, "")));
  await inq.updateOne({ reference: "FBM-INQ-TDAAAAA1" }, { $set: { buyerId: A.id } });
  await qts.updateOne({ reference: "FBM-QT-TDAAAAA1" }, { $set: { status: "DRAFT" } });
  check("G-04 a quotation that has gone back to draft is not shown", (await rel(tRq.ticketReference)).available === false);
  await qts.updateOne({ reference: "FBM-QT-TDAAAAA1" }, { $set: { status: "SENT" } });
  const tRx = await mkTicket(A.id, { related: { type: "product", reference: "99999999", label: "x", href: null } });
  check("G-05 a ticket pointing at a product that does not exist answers 'not available'", (await rel(tRx.ticketReference)).available === false);

  // ================= H: reopen
  const tR1 = await resolvedTicket(A.id, 3);
  await msgs.insertOne(mkMsg(tR1, { body: "Earlier message before resolution", createdAt: ago(4) }));
  const ovBefore = (await A.s.call("GET", T(tR1.ticketReference))).json.data;
  check("H-01 a resolved ticket (3 days ago): reply is off with the reopen hint, reopen and feedback are on, the resolved date is shown", ovBefore.capabilities.canReply === false && ovBefore.capabilities.canReopen === true && ovBefore.capabilities.canSubmitFeedback === true && /Reopen/.test(ovBefore.reasons.reply) && Boolean(ovBefore.resolvedLabel));
  const badReopen = await seq([{ reason: "" }, { reason: "short" }, { reason: "x".repeat(1001) }, { reason: "<script>alert(1)</script>" }, {}, { reason: "Still not working.", status: "OPEN" }, { reason: "Still not working.", buyerId: String(B.id) }], (b) => reopen(A.s, tR1.ticketReference, b));
  check("H-02 an empty, short, over-long, markup or missing reason, and a status or owner sent in the body, are refused (400) and the ticket stays resolved", badReopen.every((r) => r.status === 400) && (await tks.findOne({ _id: tR1._id })).status === "RESOLVED", badReopen.map((r) => r.status).join(" "));
  const rb2 = await reopen(B.s, tR1.ticketReference, { reason: "Intrusion attempt to reopen." });
  check("H-03 another buyer cannot reopen it: 404 and the status is unchanged", rb2.status === 404 && (await tks.findOne({ _id: tR1._id })).status === "RESOLVED");
  await clearLimits();
  const sim = await Promise.all([1, 2, 3, 4].map(() => A.s.call("POST", T(tR1.ticketReference, "/reopen"), { reason: "Still not working after the fix." })));
  const rdoc = await tks.findOne({ _id: tR1._id });
  check("H-04 four simultaneous reopen requests change the ticket once: one 200, the others 409; one REOPENED event, one reason message, status Reopened; the resolved date is cleared; nothing about the new status came from the client", sim.filter((r) => r.status === 200).length === 1 && sim.filter((r) => r.status === 409).length === 3 && rdoc.status === "REOPENED" && rdoc.events.filter((e) => e.type === "REOPENED").length === 1 && rdoc.events.at(-1).from === "RESOLVED" && rdoc.events.at(-1).actor === "buyer" && (await msgs.countDocuments({ ticketId: tR1._id, kind: "reopen" })) === 1 && rdoc.resolvedAt === undefined, sim.map((r) => r.status).join(" "));
  const conv = (await messages(A.s, tR1.ticketReference)).json.data.messages;
  check("H-05 the earlier conversation is kept: the original description, the earlier message and the reopening reason are all there, in order", conv.map((m) => m.kind).join() === "original,reply,reopen" && conv[2].body === "Still not working after the fix." && conv[1].body === "Earlier message before resolution");
  const tlR = (await timeline(A.s, tR1.ticketReference, "?limit=50")).json.data.items.map((i) => i.title);
  check("H-06 the timeline shows 'Ticket resolved' then 'Ticket reopened' in time order, with the earlier reply between creation and resolution (the reopening reason is not listed a second time)", tlR.join() === "Ticket created,You replied,Ticket resolved,Ticket reopened");
  const ovAfter = (await A.s.call("GET", T(tR1.ticketReference))).json.data;
  check("H-07 after reopening the buyer may reply again but not reopen again or send feedback; the reopen count is 1; the summary counts the ticket as open", ovAfter.status === "REOPENED" && ovAfter.capabilities.canReply === true && ovAfter.capabilities.canReopen === false && ovAfter.capabilities.canSubmitFeedback === false && ovAfter.reopenCount === 1 && (await A.s.call("GET", "/api/buyer/support/summary")).json.data.summary.open >= 1);
  const again = await reopen(A.s, tR1.ticketReference, { reason: "Trying to reopen once more." });
  check("H-08 reopening a ticket that is already reopened (or open) is refused (409) with nothing stored", again.status === 409 && (await msgs.countDocuments({ ticketId: tR1._id, kind: "reopen" })) === 1 && (await reopen(A.s, T1, { reason: "Open ticket cannot reopen." })).status === 409);
  const tOld = await resolvedTicket(A.id, 40);
  const old = await reopen(A.s, tOld.ticketReference, { reason: "Reopening after a long time." });
  const tEdge = await resolvedTicket(A.id, 29);
  check("H-09 the 30-day window: a ticket resolved 40 days ago is refused (409, the window in the reason), one resolved 29 days ago is allowed; the overview already says so", old.status === 409 && /30 days/.test(old.json.message) && (await reopen(A.s, tEdge.ticketReference, { reason: "Reopening inside the window." })).status === 200 && (await A.s.call("GET", T(tOld.ticketReference))).json.data.capabilities.canReopen === false);
  const tMax = await resolvedTicket(A.id, 1, { events: [{ type: "CREATED", at: ago(10), actor: "buyer", status: "OPEN" }, { type: "REOPENED", at: ago(8), actor: "buyer", from: "RESOLVED", status: "REOPENED" }, { type: "REOPENED", at: ago(6), actor: "buyer", from: "RESOLVED", status: "REOPENED" }, { type: "REOPENED", at: ago(4), actor: "buyer", from: "CLOSED", status: "REOPENED" }, { type: "STATUS_CHANGED", at: ago(1), actor: "support", from: "REOPENED", status: "RESOLVED" }] });
  const max = await reopen(A.s, tMax.ticketReference, { reason: "Reopening a fourth time." });
  check("H-10 a ticket already reopened three times cannot be reopened again (409, 'Raise a new ticket')", max.status === 409 && /3 times/.test(max.json.message) && /Raise a new ticket/.test(max.json.message));
  const closedReopen = await reopen(A.s, tClosed.ticketReference, { reason: "Reopening a closed ticket." });
  check("H-11 a closed ticket can be reopened within the window (200) and then takes replies", closedReopen.status === 200 && (await reply(A.s, tClosed.ticketReference, { message: "Reply after reopening a closed ticket." })).status === 201);
  await clearLimits();
  const tRl2 = await mkTicket(R.id);
  const rr = []; for (let i = 0; i < 6; i++) rr.push(await A.s.call("POST", T(tRl2.ticketReference, "/reopen"), { reason: "Not reopenable at all." }));
  check("H-12 reopen requests are limited (5 an hour): the sixth gets 429", rr.slice(0, 5).every((r) => r.status === 404 || r.status === 409) && rr[5].status === 429, rr.map((r) => r.status).join(" "));
  await clearLimits();

  // ================= I: feedback
  const tF = await resolvedTicket(A.id, 1);
  const badFb = await seq([{ rating: 0 }, { rating: 6 }, { rating: "5" }, { rating: 2.5 }, {}, { rating: null }, { rating: 5, feedbackText: "x".repeat(1001) }, { rating: 5, feedbackText: "<b>x</b>" }, { rating: 5, buyerId: String(B.id) }, { rating: 5, ticketId: "x" }, { rating: 5, createdAt: "2020-01-01" }], (b) => feedback(A.s, tF.ticketReference, b));
  check("I-01 a missing, zero, six, text, fractional or null rating, a comment over 1,000 characters or with markup, and a buyer, ticket or date in the body are refused (400); nothing is stored", badFb.every((r) => r.status === 400) && (await fbs.countDocuments({ ticketId: tF._id })) === 0, badFb.map((r) => r.status).join(" "));
  const notRes = await feedback(A.s, T1, { rating: 5 });
  check("I-02 feedback on a ticket that is not resolved or closed is refused (409)", notRes.status === 409 && (await fbs.countDocuments({ ticketId: t1doc._id })) === 0);
  const rbF = await feedback(B.s, tF.ticketReference, { rating: 1 });
  check("I-03 another buyer cannot send feedback for this ticket: 404, nothing stored", rbF.status === 404 && (await fbs.countDocuments({ ticketId: tF._id })) === 0);
  const fbOk = await feedback(A.s, tF.ticketReference, { rating: 4, feedbackText: "  The issue was resolved.  " });
  const fdoc = await fbs.findOne({ ticketId: tF._id });
  check("I-04 valid feedback is saved (201): rating 4, the comment trimmed, linked to this ticket and this buyer by the server, with a time", fbOk.status === 201 && fdoc.rating === 4 && fdoc.feedbackText === "The issue was resolved." && String(fdoc.buyerId) === String(A.id) && fdoc.ticketReference === tF.ticketReference && fdoc.createdAt instanceof Date);
  await clearLimits();
  const dupFb = await Promise.all([1, 2, 3].map(() => A.s.call("POST", T(tF.ticketReference, "/feedback"), { rating: 1 })));
  check("I-05 feedback is stored once per ticket: further and simultaneous attempts are refused (409), the first rating (4) is kept, and the database has a unique index for it", dupFb.every((r) => r.status === 409) && (await fbs.countDocuments({ ticketId: tF._id })) === 1 && (await fbs.findOne({ ticketId: tF._id })).rating === 4 && (await fbs.indexes()).some((i) => i.unique && i.key.ticketId === 1));
  const ovF = (await A.s.call("GET", T(tF.ticketReference))).json.data;
  const tlF = (await timeline(A.s, tF.ticketReference, "?limit=50")).json.data.items;
  check("I-06 the ticket now says feedback was sent (rating 4) and offers no second one; the timeline records 'Feedback sent' without the rating or text", ovF.feedback.submitted === true && ovF.feedback.rating === 4 && ovF.capabilities.canSubmitFeedback === false && tlF.some((i) => i.title === "Feedback sent") && !/The issue was resolved/.test(JSON.stringify(tlF)));
  const tFc = await mkTicket(A.id, { status: "CLOSED", events: [{ type: "CREATED", at: ago(5), actor: "buyer", status: "OPEN" }, { type: "STATUS_CHANGED", at: ago(1), actor: "support", from: "RESOLVED", status: "CLOSED" }] });
  check("I-07 a closed ticket also accepts feedback", (await feedback(A.s, tFc.ticketReference, { rating: 5 })).status === 201);
  await clearLimits();
  const fr = []; for (let i = 0; i < 12; i++) fr.push(await A.s.call("POST", T(tF.ticketReference, "/feedback"), { rating: 0 }));
  check("I-08 feedback requests are limited (10 an hour): the 11th gets 429", fr.slice(0, 10).every((r) => r.status === 400) && fr[10].status === 429);
  await clearLimits();
  check("I-09 the answers hold no internal or private fields: no buyer id, internal id, ticket id, agent, priority, idempotency key, storage reference, e-mail status or internal notes", !/buyerId|"_id"|ticketId|assignedAgent|priority|idempotency|internalNotes|supportEmail|"ref"|visibility|hasFiles/i.test([det.text, c2.text, tl.text, fl.text, ovF && JSON.stringify(ovF)].join("")));

  // ================= K: the page (browser)
  const ui = await open(`/buyer/support/tickets/${T1}`, { session: A.s });
  await hydrated(ui, "[role=tablist]");
  await sleep(400);
  const uiState = await ui.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, tabs: [...document.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim()), selected: document.querySelector("[role=tab][aria-selected=true]")?.textContent.trim(), robots: document.querySelector("meta[name=robots]")?.content, crumb: document.querySelector("#buyer-content")?.textContent.slice(0, 120), active: [...document.querySelectorAll("[aria-current=page]")].map((e) => e.textContent.trim()), msgs: document.querySelectorAll("ol[aria-label=Conversation] > li").length, composer: Boolean(document.querySelector("form[aria-label='Reply to support'] textarea")), back: [...document.querySelectorAll("a")].find((a) => /Back to All Tickets/.test(a.textContent))?.getAttribute("href"), reopenBtn: [...document.querySelectorAll("button")].some((b) => /Reopen Ticket/.test(b.textContent)) }));
  check("K-01 the page: heading and breadcrumb, Help & Support current, noindex, four tabs with Conversation selected, the conversation (original + replies), the reply box, Back to All Tickets, no Reopen button on an open ticket, no console errors", ui.status === 200 && uiState.h1 === "Support Ticket Details" && /Home \/ Buyer Dashboard \/ Help & Support \/ Ticket Details \//.test(uiState.crumb) && uiState.active.some((t) => /Help & Support/.test(t)) && /noindex/.test(uiState.robots ?? "") && uiState.tabs.join() === "Conversation,Timeline,Attachments,Related Details" && uiState.selected === "Conversation" && uiState.msgs >= 7 && uiState.composer && uiState.back === "/buyer/support" && !uiState.reopenBtn && ui.errs.length === 0, JSON.stringify({ ...uiState, crumb: undefined }));
  const bubbles = await ui.evaluate(() => ({ text: document.querySelector("ol[aria-label=Conversation]").textContent.replace(/\s+/g, " "), support: [...document.querySelectorAll("ol[aria-label=Conversation] article")].some((a) => /Finbyn Mart Support/.test(a.getAttribute("aria-label") ?? "")), you: [...document.querySelectorAll("ol[aria-label=Conversation] article")].some((a) => /\(You\)/.test(a.getAttribute("aria-label") ?? "")), seen: /\b(Seen|Delivered|Read)\b/.test(document.querySelector("#buyer-content").textContent) }));
  check("K-02 messages show the sender (You / Finbyn Mart Support) and time; the original description and its file chip are there; no 'Seen' or 'Delivered' label (read receipts are not recorded); the support-reply notice is gone now that a reply is recorded", bubbles.support && bubbles.you && /I am not able to submit a new inquiry/.test(bubbles.text) && !bubbles.seen && !(await content(ui)).includes("No reply from Finbyn Mart Support yet"));
  // draft survives a tab switch; tabs are lazy and URL-synced
  await ui.type("form[aria-label='Reply to support'] textarea", "A draft that must survive");
  await clickText(ui, "[role=tab]", "Timeline");
  await ui.waitForFunction(() => document.querySelectorAll("ol[aria-label='Ticket activity'] > li").length > 3, { timeout: 8000 }).catch(() => {});
  const tlUi = await ui.evaluate(() => ({ url: location.search, items: [...document.querySelectorAll("ol[aria-label='Ticket activity'] h3")].map((h) => h.textContent), selected: document.querySelector("[role=tab][aria-selected=true]")?.textContent.trim() }));
  await clickText(ui, "[role=tab]", "Attachments");
  await ui.waitForFunction(() => document.querySelectorAll("ul li a[download]").length > 0 && /Original ticket submission/.test(document.body.textContent), { timeout: 8000 }).catch(() => {});
  const fUi = await ui.evaluate(() => ({ url: location.search, groups: [...document.querySelectorAll("h3")].map((h) => h.textContent).filter((t) => /submission|replies/.test(t)), links: document.querySelectorAll("#buyer-content a[download]").length }));
  await clickText(ui, "[role=tab]", "Related Details");
  const rUi = await ui.evaluate(() => ({ url: location.search, text: [...document.querySelectorAll("[role=tabpanel]")].find((p) => !p.hidden)?.textContent.replace(/\s+/g, " ") }));
  await clickText(ui, "[role=tab]", "Conversation");
  const draftKept = await ui.evaluate(() => document.querySelector("form[aria-label='Reply to support'] textarea").value);
  check("K-03 the Timeline tab loads when opened (the address becomes ?tab=timeline); Attachments shows files grouped by 'Original ticket submission', 'Your replies' and 'Support replies' with download links; Related Details shows the inquiry; the reply draft is still there after switching tabs", /tab=timeline/.test(tlUi.url) && tlUi.items.includes("Ticket created") && tlUi.items.includes("Support replied") && /tab=attachments/.test(fUi.url) && fUi.groups.length === 3 && fUi.links >= 5 && /tab=related/.test(rUi.url) && /Cotton Poplin Fabric/.test(rUi.text) && /View Inquiry/.test(rUi.text) && draftKept === "A draft that must survive", JSON.stringify({ tlUi, fUi, draftKept }));
  await ui.keyboard.press("Tab").catch(() => {});
  await ui.focus("[role=tab][aria-selected=true]");
  await ui.keyboard.press("ArrowRight");
  const kb = await ui.evaluate(() => document.querySelector("[role=tab][aria-selected=true]")?.textContent.trim());
  await ui.keyboard.press("End");
  const kbEnd = await ui.evaluate(() => document.querySelector("[role=tab][aria-selected=true]")?.textContent.trim());
  check("K-04 the tabs work by keyboard: Arrow Right moves to the next tab and End to the last; only the selected tab is in the tab order", kb === "Timeline" && kbEnd === "Related Details" && (await ui.evaluate(() => [...document.querySelectorAll("[role=tab]")].filter((t) => t.tabIndex === 0).length)) === 1);
  await clickText(ui, "[role=tab]", "Conversation");
  const re = await open(`/buyer/support/tickets/${T1}?tab=timeline`, { session: A.s });
  await hydrated(re, "[role=tablist]");
  check("K-05 reloading with ?tab=timeline opens the Timeline tab; an unknown tab falls back to Conversation", (await tabText(re, "Timeline"))?.selected === "true" && (await (async () => { const p = await open(`/buyer/support/tickets/${T1}?tab=nonsense`, { session: A.s }); const r = (await tabText(p, "Conversation"))?.selected === "true"; await p.context.close(); return r; })()));
  await re.context.close();
  // send a reply with a file; a double click is one message
  const upPath = path.resolve(`${STORE}/../tmp-ticket37-evidence.pdf`);
  fs.writeFileSync(upPath, PDF);
  await ui.evaluate(() => { const ta = document.querySelector("form[aria-label='Reply to support'] textarea"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(ta, ""); ta.dispatchEvent(new Event("input", { bubbles: true })); });
  await ui.evaluate(() => [...document.querySelectorAll("form[aria-label='Reply to support'] button[type=submit]")][0].click());
  const emptyErr = await ui.evaluate(() => document.querySelector("form[aria-label='Reply to support'] [role=alert]")?.textContent);
  await ui.type("form[aria-label='Reply to support'] textarea", "Browser reply with a file attached");
  const input = await ui.$("form[aria-label='Reply to support'] input[type=file]");
  await input.uploadFile(upPath);
  await sleep(200);
  const fileListed = await ui.evaluate(() => [...document.querySelectorAll("form[aria-label='Reply to support'] ul[aria-label='Files to attach'] li")].map((l) => l.textContent));
  const sentBefore = await msgs.countDocuments({ ticketId: t1doc._id });
  await ui.evaluate(() => { const b = document.querySelector("form[aria-label='Reply to support'] button[type=submit]"); b.click(); b.click(); });
  await ui.waitForFunction(() => /Browser reply with a file attached/.test(document.querySelector("ol[aria-label=Conversation]")?.textContent ?? ""), { timeout: 15000 }).catch(() => {});
  await sleep(500);
  const saved = await msgs.find({ ticketId: t1doc._id, body: "Browser reply with a file attached" }).toArray();
  const afterSend = await ui.evaluate(() => ({ ta: document.querySelector("form[aria-label='Reply to support'] textarea").value, last: [...document.querySelectorAll("ol[aria-label=Conversation] > li")].at(-1)?.textContent.replace(/\s+/g, " "), chip: [...document.querySelectorAll("ol[aria-label=Conversation] > li:last-child a[download]")].length, toast: document.body.textContent.includes("Your reply was sent") }));
  check("K-06 an empty send shows 'Write your reply.' and sends nothing; a real send with a PDF (a double click is one message) saves exactly one reply with one private file, shows it last with its file link, clears the box and confirms", /Write your reply/.test(emptyErr ?? "") && fileListed.some((x) => /evidence/.test(x)) && saved.length === 1 && saved[0].attachments.length === 1 && (await msgs.countDocuments({ ticketId: t1doc._id })) === sentBefore + 1 && afterSend.ta === "" && /Browser reply with a file attached/.test(afterSend.last) && afterSend.chip === 1 && afterSend.toast, JSON.stringify(afterSend).slice(0, 220));
  check("K-07 no console errors during the flows above", ui.errs.length === 0, ui.errs.join(" | "));
  await ui.context.close();
  // a long conversation: earlier messages on request
  const lp = await open(`/buyer/support/tickets/${tLong.ticketReference}`, { session: A.s });
  await hydrated(lp, "[role=tablist]");
  const n20 = await lp.evaluate(() => document.querySelectorAll("ol[aria-label=Conversation] > li").length);
  await clickText(lp, "button", "Show earlier messages");
  await lp.waitForFunction(() => document.querySelectorAll("ol[aria-label=Conversation] > li").length === 40, { timeout: 8000 }).catch(() => {});
  const n40 = await lp.evaluate(() => document.querySelectorAll("ol[aria-label=Conversation] > li").length);
  await clickText(lp, "button", "Refresh");
  await sleep(800);
  const afterRefresh = await lp.evaluate(() => document.querySelectorAll("ol[aria-label=Conversation] > li").length);
  check("K-08 a long conversation opens with 20 messages and 'Show earlier messages'; one click adds the 20 before them (40, no repeats); Refresh keeps what is shown", n20 === 20 && n40 === 40 && afterRefresh >= 40 && (await lp.evaluate(() => new Set([...document.querySelectorAll("ol[aria-label=Conversation] article")].map((a) => a.textContent)).size)) === afterRefresh);
  await lp.context.close();
  // text, not HTML
  const hp = await open(`/buyer/support/tickets/${tHtml.ticketReference}`, { session: A.s });
  await hydrated(hp, "[role=tablist]");
  const hs = await hp.evaluate(() => ({ imgs: document.querySelectorAll("ol[aria-label=Conversation] img").length, bolds: document.querySelectorAll("ol[aria-label=Conversation] b").length, pwned: window.__pwned === 1, text: document.querySelector("ol[aria-label=Conversation]").textContent, wrap: (() => { const b = [...document.querySelectorAll("ol[aria-label=Conversation] [class*=bubble]")].pop(); const r = b.getBoundingClientRect(); return { right: r.right, vw: window.innerWidth, over: document.documentElement.scrollWidth - window.innerWidth }; })() }));
  check("K-09 a message holding HTML is shown as text (no element is created, nothing runs, the line break is kept); a 400-character word wraps inside its bubble without horizontal scrolling", hs.imgs === 0 && hs.bolds === 0 && hs.pwned === false && /<img src=x onerror=/.test(hs.text) && hs.wrap.right <= hs.wrap.vw && hs.wrap.over <= 0);
  await hp.context.close();
  // resolved ticket: feedback then reopen through the real forms
  const tU = await resolvedTicket(A.id, 2, { subject: "UI resolved ticket", related: { type: "order", reference: "FBM-ORD-TDAAAAA1", label: "FBM-ORD-TDAAAAA1 · Shree Textiles", href: "/buyer/orders/FBM-ORD-TDAAAAA1" } });
  const up = await open(`/buyer/support/tickets/${tU.ticketReference}`, { session: A.s });
  await hydrated(up, "[role=tablist]");
  await sleep(300);
  const resUi = await up.evaluate(() => ({ composer: Boolean(document.querySelector("form[aria-label='Reply to support']")), note: [...document.querySelectorAll("[role=status]")].map((e) => e.textContent).join(" "), reopenBtns: [...document.querySelectorAll("button")].filter((b) => /Reopen Ticket/.test(b.textContent)).length, feedbackTitle: [...document.querySelectorAll("h2")].some((h) => /Was your issue resolved/.test(h.textContent)), submitDisabled: [...document.querySelectorAll("button[type=submit]")].find((b) => /Submit Feedback/.test(b.textContent))?.disabled, badge: document.querySelector("[data-status]")?.textContent.trim(), resolvedOn: /Resolved On/.test(document.body.textContent), side: /Related Order/.test(document.body.textContent) }));
  check("K-10 a resolved ticket: no reply box, the reason ('Reopen it to reply') with Reopen buttons, the feedback card with Submit disabled until a star is chosen, the resolved date, the related order card", !resUi.composer && /Reopen it to reply/.test(resUi.note ?? "") && resUi.reopenBtns >= 1 && resUi.feedbackTitle && resUi.submitDisabled === true && resUi.badge === "Resolved" && resUi.resolvedOn && resUi.side, JSON.stringify(resUi));
  await up.evaluate(() => document.querySelector("button[aria-label='4 stars']").click());
  await up.type("textarea[placeholder^='Tell us about your support']", "Good help, thank you.");
  await up.evaluate(() => [...document.querySelectorAll("button[type=submit]")].find((b) => /Submit Feedback/.test(b.textContent)).click());
  await up.waitForFunction(() => /You rated this ticket 4 out of 5/.test(document.body.textContent), { timeout: 10000 }).catch(() => {});
  const fbUi = await up.evaluate(() => ({ text: [...document.querySelectorAll("[role=status]")].map((e) => e.textContent).join(" "), form: Boolean(document.querySelector("textarea[placeholder^='Tell us about your support']")) }));
  check("K-11 feedback through the page: choosing 4 stars enables Submit; after the server saved it the card says 'You rated this ticket 4 out of 5' and the form is gone; one record exists", /You rated this ticket 4 out of 5/.test(fbUi.text) && !fbUi.form && (await fbs.countDocuments({ ticketId: tU._id })) === 1 && (await fbs.findOne({ ticketId: tU._id })).feedbackText === "Good help, thank you.");
  await clickText(up, "button", "Reopen Ticket");
  await up.waitForSelector("[role=dialog]");
  await up.evaluate(() => [...document.querySelectorAll("[role=dialog] button[type=submit]")][0].click());
  const reErr = await up.evaluate(() => document.querySelector("[role=dialog] [role=alert]")?.textContent);
  await up.type("[role=dialog] textarea", "The problem came back after two days.");
  await up.evaluate(() => [...document.querySelectorAll("[role=dialog] button[type=submit]")][0].click());
  await up.waitForFunction(() => !document.querySelector("[role=dialog]"), { timeout: 10000 }).catch(() => {});
  await up.waitForFunction(() => document.querySelector("form[aria-label='Reply to support']"), { timeout: 10000 }).catch(() => {});
  const reUi = await up.evaluate(() => ({ badge: document.querySelector("[data-status]")?.textContent.trim(), composer: Boolean(document.querySelector("form[aria-label='Reply to support']")), reopenBtns: [...document.querySelectorAll("button")].filter((b) => /Reopen Ticket/.test(b.textContent)).length, last: [...document.querySelectorAll("ol[aria-label=Conversation] > li")].at(-1)?.textContent.replace(/\s+/g, " ") }));
  check("K-12 reopening through the page: an empty reason shows an error; with a reason the dialog closes only after the server saved it; the badge says Reopened, the reply box is back, no Reopen button remains, and the reason is the last message", /Tell us why/.test(reErr ?? "") && (await tks.findOne({ _id: tU._id })).status === "REOPENED" && reUi.badge === "Reopened" && reUi.composer && reUi.reopenBtns === 0 && /The problem came back after two days/.test(reUi.last) && /Reason for reopening/.test(reUi.last), JSON.stringify(reUi).slice(0, 240));
  check("K-13 no console errors on the resolved-ticket flows", up.errs.length === 0, up.errs.join(" | "));
  await up.context.close();
  // back to the list with its filters
  const lst = await open("/buyer/support?status=open", { session: A.s });
  await hydrated(lst, "#ticket-search");
  await sleep(500);
  await lst.evaluate(() => [...document.querySelectorAll("tbody a")].find((a) => /View ticket/.test(a.getAttribute("aria-label") ?? "")).click());
  await lst.waitForFunction(() => /\/buyer\/support\/tickets\//.test(location.pathname), { timeout: 10000 }).catch(() => {});
  await hydrated(lst, "[role=tablist]");
  await sleep(300);
  await clickText(lst, "a", "Back to All Tickets");
  await lst.waitForFunction(() => location.pathname === "/buyer/support", { timeout: 10000 }).catch(() => {});
  check("K-14 Back to All Tickets returns to the list with the filter it had (status=open)", /status=open/.test(await lst.evaluate(() => location.search)));
  await lst.context.close();
  const bad404 = await open(`/buyer/support/tickets/${tB.ticketReference}`, { session: A.s });
  check("K-15 another buyer's ticket opened in the browser is the 404 page", bad404.status === 404);
  await bad404.context.close();

  // ================= R: responsive
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const tShot = await resolvedTicket(A.id, 2, { subject: "Responsive check ticket with a rather long subject line that has to wrap on small screens", related: { type: "inquiry", reference: "FBM-INQ-TDAAAAA1", label: "FBM-INQ-TDAAAAA1 · Shree Textiles", href: "/buyer/inquiries/FBM-INQ-TDAAAAA1" } });
  await msgs.insertMany([mkMsg(tShot, { body: "A".repeat(220) + " message with a long unbroken run and some more words to wrap.", createdAt: ago(4), attachments: [{ id: "bbbbbbbbbbbbbbb1", name: "a-really-long-file-name-for-the-chip-to-wrap-inside-the-bubble-on-small-screens.pdf", mime: "application/pdf", size: PDF.length, ref: supportFile }], hasFiles: true }), mkMsg(tShot, { senderRole: "support", body: "Support reply text. ".repeat(20), createdAt: ago(3) })]);
  const badW = [];
  for (const w of widths) {
    for (const tab of ["conversation", "timeline", "attachments", "related"]) {
      if (tab !== "conversation" && ![320, 390, 768, 1440].includes(w)) continue;
      const p = await open(`/buyer/support/tickets/${tShot.ticketReference}?tab=${tab}`, { width: w, session: A.s });
      await hydrated(p, "[role=tablist]");
      await sleep(tab === "conversation" ? 100 : 500);
      const o2 = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const clipped = await p.evaluate(() => [...document.querySelectorAll("#buyer-content h1, #buyer-content h2, #buyer-content h3, #buyer-content label, #buyer-content button, #buyer-content a")].filter((e) => e.getClientRects().length && !e.classList.contains("visually-hidden") && e.scrollWidth > e.clientWidth + 1 && !/auto|scroll/.test(getComputedStyle(e).overflowX) && !e.closest("[role=tablist]")).map((e) => `${e.tagName}:${e.textContent.slice(0, 24)}`));
      const tapBad = w <= 480 ? await p.evaluate(() => [...document.querySelectorAll("#buyer-content button, #buyer-content a[download], #buyer-content [role=tab]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 32 || r.width < 32) && !e.classList.contains("visually-hidden"); }).map((e) => `${e.tagName}:${(e.getAttribute("aria-label") ?? e.textContent).slice(0, 20)}`)) : [];
      if (o2 > 0 || clipped.length || p.errs.length || tapBad.length) badW.push(`${tab}@${w}: overflow ${o2}, clipped ${clipped.slice(0, 2).join("|")}, small targets ${tapBad.slice(0, 2).join("|")}, errors ${p.errs.length}`);
      if (tab === "conversation" && (w === 390 || w === 768 || w === 1440)) await p.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/37-ticket-details-${w}.png`, fullPage: true });
      await p.context.close();
    }
  }
  check("R-01 no horizontal overflow, clipped headings, labels, buttons or links, undersized touch targets (phones) or console errors on the ticket page at 16 widths (320 to 2560), and on every tab at 320, 390, 768 and 1440", badW.length === 0, badW.join("; "));
  const phone = await open(`/buyer/support/tickets/${tShot.ticketReference}`, { width: 390, session: A.s });
  const desk = await open(`/buyer/support/tickets/${tShot.ticketReference}`, { width: 1440, session: A.s });
  check("R-02 on a phone the ticket information stacks under the conversation (one column); on a desktop it is a right-hand column beside it", await phone.evaluate(() => { const c = document.querySelector("[role=tablist]").getBoundingClientRect(), i = document.querySelector("aside[aria-label='Ticket information']").getBoundingClientRect(); return i.top >= c.bottom - 1 && i.left <= 20; }) && await desk.evaluate(() => { const c = document.querySelector("[role=tablist]").getBoundingClientRect(), i = document.querySelector("aside[aria-label='Ticket information']").getBoundingClientRect(); return i.left >= c.right - 1 && Math.abs(i.top - c.top) < 120; }));
  await phone.context.close(); await desk.context.close();
  const zoom = await open(`/buyer/support/tickets/${tShot.ticketReference}`, { width: 1440, session: A.s });
  const zoomBad = [];
  for (const f of [0.8, 1.25, 1.5, 2]) { await zoom.setViewport({ width: Math.round(1440 / f), height: Math.round(900 / f) }); await sleep(150); const ov = await zoom.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (ov > 0) zoomBad.push(`${f}: ${ov}`); }
  check("R-03 browser zoom equivalents (80, 125, 150 and 200 percent, as the matching viewport widths) cause no horizontal overflow", zoomBad.length === 0, zoomBad.join(", "));
  await zoom.context.close();
  const ka = await open(`/buyer/support/tickets/${tShot.ticketReference}`, { session: A.s });
  await hydrated(ka, "[role=tablist]");
  const a11y = await ka.evaluate(() => ({ tablist: Boolean(document.querySelector("[role=tablist][aria-label]")), panels: [...document.querySelectorAll("[role=tabpanel]")].every((p) => p.getAttribute("aria-labelledby") && document.getElementById(p.getAttribute("aria-labelledby"))), articles: [...document.querySelectorAll("ol[aria-label=Conversation] article")].every((a) => a.getAttribute("aria-label")), times: [...document.querySelectorAll("ol[aria-label=Conversation] time")].every((t) => t.getAttribute("datetime")), copy: Boolean(document.querySelector("button[aria-label^='Copy ticket ID']")), dl: [...document.querySelectorAll("a[download]")].every((a) => a.getAttribute("aria-label")) }));
  await ka.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /Reopen Ticket/.test(x.textContent) && x.getClientRects().length); b.focus(); b.click(); });
  await ka.waitForSelector("[role=dialog]");
  const inDialog = await ka.evaluate(() => document.querySelector("[role=dialog]").contains(document.activeElement));
  await ka.keyboard.press("Escape");
  await sleep(300);
  const closed = !(await ka.$("[role=dialog]"));
  const backToOpener = await ka.evaluate(() => /Reopen/.test(document.activeElement?.textContent ?? ""));
  check("R-04 accessibility structure: labelled tablist and tabpanels, each message an article with a name and a time with a datetime, labelled copy and download controls; the reopen dialog takes focus, closes on Escape and returns focus to the button", Object.values(a11y).every(Boolean) && inDialog && closed && backToOpener, JSON.stringify(a11y));
  await ka.context.close();

  if (process.env.SKIP_PERF === "1") return;
  // ================= P: performance
  await clearLimits();
  const D = await register("perf");
  const tP = await mkTicket(D.id, { subject: "Perf ticket 1000", description: "Perf description." });
  const tQ = await mkTicket(D.id, { subject: "Perf ticket 10000", description: "Perf description." });
  await seedMessages(tP, 1000, 7_200_000, 1000, (i) => (i % 20 === 0 ? { attachments: [{ id: randomBytes(8).toString("hex"), name: `p${i}.pdf`, mime: "application/pdf", size: 100, ref: supportFile }], hasFiles: true } : {}));
  await seedMessages(tQ, 10000, 36_000_000, 1000, (i) => (i % 100 === 0 ? { attachments: [{ id: randomBytes(8).toString("hex"), name: `q${i}.pdf`, mime: "application/pdf", size: 100, ref: supportFile }], hasFiles: true } : {}));
  await tks.updateOne({ _id: tP._id }, { $push: { events: { $each: Array.from({ length: 30 }, (_, i) => ({ type: "STATUS_CHANGED", at: new Date(Date.now() - 8_000_000 + i * 1000), actor: "support", from: "OPEN", status: "ASSIGNED" })) } } });
  const pr = tP.ticketReference, qr = tQ.ticketReference;
  const perf = {
    detail: await timeIt(() => D.s.call("GET", T(pr))),
    msgs1k: await timeIt(() => messages(D.s, pr)),
    msgs10k: await timeIt(() => messages(D.s, qr)),
    msgsDeep: await timeIt(() => messages(D.s, qr, `?before=${encodeURIComponent(`${String(Date.now() - 36_000_000 + 5000 * 1000).padStart(15, "0")}:m:${"f".repeat(24)}`)}`)),
    tl1k: await timeIt(() => timeline(D.s, pr)),
    tl10k: await timeIt(() => timeline(D.s, qr)),
    tlDeep: await timeIt(() => timeline(D.s, qr, `?after=${encodeURIComponent(`${String(Date.now() - 36_000_000 + 5000 * 1000).padStart(15, "0")}:m:${"0".repeat(24)}`)}`)),
    files1k: await timeIt(() => attachments(D.s, pr)),
    files10k: await timeIt(() => attachments(D.s, qr)),
    related: await timeIt(() => D.s.call("GET", T(pr, "/related"))),
  };
  const replyT = []; for (let i = 0; i < 31; i++) { await clearLimits(); const s0 = performance.now(); const r = await rawReply(D.s, pr, { message: `Perf reply ${i}` }); if (i > 0) replyT.push(performance.now() - s0); if (r.status !== 201) throw new Error(`perf reply ${r.status} ${r.text}`); }
  const reopenT = [], fbT = [];
  for (let i = 0; i < 31; i++) {
    const t = await resolvedTicket(D.id, 1);
    await clearLimits(); let s0 = performance.now(); let r = await D.s.call("POST", T(t.ticketReference, "/reopen"), { reason: "Perf reopen reason text." }); if (i > 0) reopenT.push(performance.now() - s0); if (r.status !== 200) throw new Error(`perf reopen ${r.status} ${r.text}`);
    const t2 = await resolvedTicket(D.id, 1);
    await clearLimits(); s0 = performance.now(); r = await D.s.call("POST", T(t2.ticketReference, "/feedback"), { rating: 5 }); if (i > 0) fbT.push(performance.now() - s0); if (r.status !== 201) throw new Error(`perf feedback ${r.status} ${r.text}`);
  }
  const sizes = { msgs: (await messages(D.s, qr)).text.length, tl: (await timeline(D.s, qr)).text.length, files: (await attachments(D.s, qr)).text.length };
  const par = await Promise.all(Array.from({ length: 10 }, () => messages(D.s, qr)));
  console.log("  PERF " + Object.entries(perf).map(([k, v]) => `${k} p50 ${v.p50.toFixed(0)} p95 ${v.p95.toFixed(0)} p99 ${v.p99.toFixed(0)}`).join("; ") + `; reply p50 ${med(replyT, 0.5).toFixed(0)} p95 ${med(replyT, 0.95).toFixed(0)}; reopen p50 ${med(reopenT, 0.5).toFixed(0)} p95 ${med(reopenT, 0.95).toFixed(0)}; feedback p50 ${med(fbT, 0.5).toFixed(0)} p95 ${med(fbT, 0.95).toFixed(0)}; sizes ${JSON.stringify(sizes)}`);
  check("P-01 against the targets (p95) on a 1,000-message and a 10,000-message ticket: ticket details under 300 ms, a conversation page under 350, a timeline page under 300, the files list under 300, a reply under 400, reopen under 400, feedback under 400", perf.detail.p95 < 300 && perf.msgs1k.p95 < 350 && perf.msgs10k.p95 < 350 && perf.msgsDeep.p95 < 350 && perf.tl1k.p95 < 300 && perf.tl10k.p95 < 300 && perf.tlDeep.p95 < 300 && perf.files1k.p95 < 300 && perf.files10k.p95 < 300 && med(replyT, 0.95) < 400 && med(reopenT, 0.95) < 400 && med(fbT, 0.95) < 400, Object.entries(perf).map(([k, v]) => `${k} ${v.p95.toFixed(0)}`).join(", ") + `, reply ${med(replyT, 0.95).toFixed(0)}, reopen ${med(reopenT, 0.95).toFixed(0)}, feedback ${med(fbT, 0.95).toFixed(0)}`);
  check("P-02 a page of a 10,000-message ticket stays small (20 messages / 50 entries) and ten simultaneous requests all succeed", sizes.msgs < 20_000 && sizes.tl < 30_000 && sizes.files < 20_000 && par.every((r) => r.status === 200), JSON.stringify(sizes));
  const plans = {};
  const run = async (name, cursor) => { const ex = await cursor.explain("executionStats"); plans[name] = { s: JSON.stringify(ex.queryPlanner.winningPlan), docs: ex.executionStats.totalDocsExamined, keys: ex.executionStats.totalKeysExamined }; };
  await run("conversation", msgs.find({ ticketId: tQ._id, visibility: "buyer" }).sort({ createdAt: -1, _id: -1 }).limit(21));
  await run("timelineMessages", msgs.find({ ticketId: tQ._id, visibility: "buyer", kind: "reply" }).sort({ createdAt: 1, _id: 1 }).limit(51));
  await run("files", msgs.find({ ticketId: tQ._id, hasFiles: true, visibility: "buyer" }).sort({ createdAt: 1, _id: 1 }).limit(21));
  await run("download", msgs.find({ ticketId: tQ._id, hasFiles: true, visibility: "buyer", "attachments.id": "0123456789abcdef" }));
  await run("duplicateSend", msgs.find({ ticketId: tQ._id, idempotencyKey: "abc" }));
  await run("ownership", tks.find({ ticketReference: tQ.ticketReference, buyerId: D.id }));
  await run("feedback", fbs.find({ ticketId: tQ._id }));
  check("P-03 every query behind the page uses an index: no collection scan, no blocking sort; the conversation, timeline and files read about one page of documents out of 10,000, and the duplicate-send and file lookups read one document", Object.values(plans).every((p) => /IXSCAN|EXPRESS/.test(p.s) && !/COLLSCAN/.test(p.s) && !/"SORT"/.test(p.s)) && plans.conversation.docs <= 25 && plans.files.docs <= 25 && plans.timelineMessages.docs <= 60 && plans.ownership.docs <= 1 && plans.duplicateSend.docs <= 1 && plans.download.docs <= 1, Object.entries(plans).map(([k, p]) => `${k}: ${p.docs} docs/${p.keys} keys`).join(", "));
}

async function cleanup() {
  if (process.env.KEEP === "1") return;
  const mine = await users.find({ email: { $regex: `^t37-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  const ids = mine.map((u) => u._id);
  const docs = await tks.find({ buyerId: { $in: ids } }, { projection: { attachments: 1 } }).toArray();
  for (const d of docs) for (const a of d.attachments ?? []) { try { fs.unlinkSync(path.join(STORE, a.ref)); } catch { /* gone */ } }
  const ms = await msgs.find({ buyerId: { $in: ids }, "attachments.0": { $exists: true } }, { projection: { attachments: 1 } }).toArray();
  for (const m of ms) for (const a of m.attachments) { try { fs.unlinkSync(path.join(STORE, a.ref)); } catch { /* gone or shared */ } }
  await tks.deleteMany({ buyerId: { $in: ids } });
  await msgs.deleteMany({ buyerId: { $in: ids } });
  await fbs.deleteMany({ buyerId: { $in: ids } });
  for (const c of ["inquiries", "quotations", "orders"]) await db.collection(c).deleteMany({ buyerId: { $in: ids } });
  await notifs.deleteMany({ buyerId: { $in: ids } });
  await db.collection("security_events").deleteMany({ userId: { $in: ids } });
  await users.deleteMany({ _id: { $in: ids } });
  try { fs.unlinkSync(path.resolve(`${STORE}/../tmp-ticket37-evidence.pdf`)); } catch { /* none */ }
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
