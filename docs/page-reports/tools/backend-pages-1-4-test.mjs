import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("R:/indiamartref/");
const { MongoClient, ObjectId } = require("mongodb");

const BASE = process.env.BASE || "http://localhost:3100";
const TEST_DB = "finbynmart_test";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

// Direct database access, to confirm what was really stored. The URI is read from .env.local and never printed.
const env = Object.fromEntries(fs.readFileSync("R:/indiamartref/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const db = client.db(TEST_DB);

async function fetchRetry(url, init) {
  try { return await fetch(url, init); } catch { return await fetch(url, init); }
}

class Session {
  jar = new Map();
  async call(method, path, body, headers = {}) {
    const response = await fetchRetry(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    for (const line of response.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    let json = null; try { json = await response.json(); } catch {}
    return { status: response.status, json, headers: response.headers };
  }
}

// Which seller really owns product 1163? Read the seed independently.
function parseCsv(text) { const rows = []; let row = [], cur = "", q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; } else cur += c; } if (cur || row.length) { row.push(cur); rows.push(row); } return rows; }
const [h, ...r] = parseCsv(fs.readFileSync("R:/indiamartref/db/seed/products.csv", "utf8")).filter((x) => x.length > 1);
const truthProduct = Object.fromEntries(h.map((k, i) => [k, r.find((x) => x[0] === "1163")[i]]));
const owner = truthProduct.seller_id;
const otherSeller = (() => { const [sh, ...sr] = parseCsv(fs.readFileSync("R:/indiamartref/db/seed/sellers.csv", "utf8")).filter((x) => x.length > 1); return sr.find((x) => x[0] !== owner && x[sh.indexOf("status")] === "Active")[0]; })();

const stamp = Date.now();
const A = new Session(), B = new Session(), C = new Session(), anon = new Session();

// ---------- accounts
{
  const a = await A.call("POST", "/api/auth/register", { role: "buyer", name: "Backend Tester A", email: `a-${stamp}@example.test`, password: "test-password-1" });
  await C.call("POST", "/api/auth/register", { role: "buyer", name: "Backend Tester C", email: `c2-${stamp}@example.test`, password: "test-password-4" });
  const b = await B.call("POST", "/api/auth/register", { role: "buyer", name: "Backend Tester B", email: `b-${stamp}@example.test`, password: "test-password-2" });
  check("00 two test buyers registered in the test database", a.status === 201 && b.status === 201, `${a.status}/${b.status}`);
  const users = await db.collection("users").countDocuments({ email: { $in: [`a-${stamp}@example.test`, `b-${stamp}@example.test`] } });
  check("00b they exist in finbynmart_test and not in the live database name", users === 2 && client.db("finbynmart").databaseName !== TEST_DB);
}
const idOf = async (email) => (await db.collection("users").findOne({ email }))._id;
const aId = await idOf(`a-${stamp}@example.test`), bId = await idOf(`b-${stamp}@example.test`);

// ---------- requirements
{
  const body = { product: "Industrial Air Compressor", quantity: "25", city: "Pune", category: "Industrial Machinery", subcategory: "Compressors" };
  const anonRes = await anon.call("POST", "/api/requirements", body);
  check("R1 anonymous requirement is refused (401)", anonRes.status === 401 && anonRes.json.ok === false, anonRes.json?.message);
  const bad = await A.call("POST", "/api/requirements", { product: "", quantity: "0", city: "" });
  check("R2 invalid fields are rejected with per-field messages", bad.status === 400 && bad.json.fields.product && bad.json.fields.quantity && bad.json.fields.city);
  for (const q of ["1000001", "12abc", "-5", "1.5", "", 1000001, -5, 1.5, 1e21, null, true]) {
    const x = await A.call("POST", "/api/requirements", { ...body, quantity: q });
    check(`R3 quantity ${JSON.stringify(q)} rejected`, x.status === 400 && x.json.fields?.quantity);
  }
  const inj = await A.call("POST", "/api/requirements", { product: { $gt: "" }, quantity: { $ne: 0 }, city: ["x"] });
  check("R4 operator objects in the body cannot become query/doc values", inj.status === 400);
  const good = await A.call("POST", "/api/requirements", body);
  check("R5 valid requirement is created (201 with an id)", good.status === 201 && /^[0-9a-f]{24}$/.test(good.json.id), good.json?.id);
  const doc = await db.collection("requirements").findOne({ _id: new ObjectId(good.json.id) });
  check("R6 it is really stored, owned by the signed-in buyer, with category context", !!doc && String(doc.userId) === String(aId) && doc.product === body.product && doc.quantity === 25 && doc.city === "Pune" && doc.category === "Industrial Machinery" && doc.subcategory === "Compressors" && doc.status === "open");
  const dup = await A.call("POST", "/api/requirements", body);
  check("R7 an immediate duplicate is refused (409) and not stored twice", dup.status === 409 && (await db.collection("requirements").countDocuments({ userId: aId, product: body.product })) === 1);
  const long = await A.call("POST", "/api/requirements", { product: "x".repeat(300) + "\u0000\u0007", quantity: "3", city: "  Delhi\n\tNCR  " });
  const ld = await db.collection("requirements").findOne({ _id: new ObjectId(long.json.id) });
  check("R8 text is trimmed, capped and stripped of control characters", ld.product.length === 120 && ld.city === "Delhi NCR", `${ld.product.length} / "${ld.city}"`);
  const num = await A.call("POST", "/api/requirements", { product: "Numeric quantity probe", quantity: 30, city: "Pune" });
  check("R8b a JSON-number quantity is accepted and stored as a number", num.status === 201 && (await db.collection("requirements").findOne({ _id: new ObjectId(num.json.id) }))?.quantity === 30, `status ${num.status}`);
  const idx = await db.collection("requirements").indexes();
  check("R9 requirements has the userId+createdAt index", idx.some((i) => i.key.userId === 1 && i.key.createdAt === -1));
}

// ---------- inquiries
{
  const base = { productId: "1163", quantity: "50", unit: "Pieces", message: "Need 50 for a school order." };
  check("I1 anonymous inquiry refused (401)", (await anon.call("POST", "/api/inquiries", base)).status === 401);
  check("I2 neither product nor supplier is rejected (400)", (await A.call("POST", "/api/inquiries", { quantity: "5" })).status === 400);
  check("I3 invalid quantity is rejected", (await A.call("POST", "/api/inquiries", { ...base, quantity: "abc" })).status === 400);
  check("I4 unknown product is refused (404)", (await A.call("POST", "/api/inquiries", { ...base, productId: "99999999" })).status === 404);
  check("I5 made-up sample product slug is refused (404)", (await A.call("POST", "/api/inquiries", { ...base, productId: "not-a-real-product" })).status === 404);
  check("I6 a supplier that does not sell the product is refused (400)", (await A.call("POST", "/api/inquiries", { ...base, supplierId: otherSeller })).status === 400);
  const ok = await A.call("POST", "/api/inquiries", base);
  check("I7 valid product inquiry created (201)", ok.status === 201, ok.json?.id);
  const doc = await db.collection("inquiries").findOne({ _id: new ObjectId(ok.json.id) });
  check("I8 stored with the buyer, the product and the seller resolved by the server", String(doc.buyerId) === String(aId) && doc.productKey === "1163" && doc.supplierKey === owner && doc.quantity === 50 && String(doc.status).toUpperCase() === "NEW", `${doc?.supplierKey} vs seed ${owner}`);
  const numInq = await A.call("POST", "/api/inquiries", { productId: "1165", quantity: 12 });
  check("I8b a JSON-number quantity is accepted", numInq.status === 201, `status ${numInq.status}`);
  check("I9 the product's own supplier may be named explicitly", (await A.call("POST", "/api/inquiries", { ...base, quantity: "51", supplierId: owner })).status === 201);
  check("I10 a repeat of the same inquiry is refused (409)", (await A.call("POST", "/api/inquiries", base)).status === 409);
  const general = await A.call("POST", "/api/inquiries", { supplierId: owner, quantity: "10" });
  const gd = await db.collection("inquiries").findOne({ _id: new ObjectId(general.json.id) });
  check("I11 a general supplier inquiry (no product) is stored", general.status === 201 && gd.productKey === undefined && gd.supplierKey === owner);
  check("I12 unknown supplier refused (404)", (await A.call("POST", "/api/inquiries", { supplierId: "SLR-NOPE", quantity: "2" })).status === 404);
  const sample = await A.call("POST", "/api/inquiries", { productId: "industrial-air-compressor", quantity: "2" });
  const sd = sample.json?.id ? await db.collection("inquiries").findOne({ _id: new ObjectId(sample.json.id) }) : null;
  check("I13 a sample B2B product inquiry resolves its sample supplier", sample.status === 201 && sd?.source === "sample" && !!sd.supplierKey, `${sd?.supplierKey}`);
  const longMsg = await A.call("POST", "/api/inquiries", { productId: "1164", quantity: "7", message: "m".repeat(5000) });
  const lm = await db.collection("inquiries").findOne({ _id: new ObjectId(longMsg.json.id) });
  check("I14 messages are capped at 1000 characters", lm.message.length === 1000);
  const idx = await db.collection("inquiries").indexes();
  check("I15 inquiries has buyer and supplier indexes", idx.some((i) => i.key.buyerId === 1) && idx.some((i) => i.key.supplierKey === 1));
  const big = await A.call("POST", "/api/inquiries", { ...base, message: "z".repeat(20000) });
  check("I16 oversized request bodies are refused", big.status === 400 || big.status === 413, `${big.status}`);

  // Page 06: quantity, MOQ and unit are validated on the server against the product's own record.
  const moqLow = await C.call("POST", "/api/inquiries", { productId: "solar-panel-540w", quantity: "5" });
  check("I17 a quantity below the product's MOQ is refused (solar panel, MOQ 10 pieces)", moqLow.status === 400 && /minimum order is 10/i.test(moqLow.json.fields?.quantity ?? ""), JSON.stringify(moqLow.json));
  const moqOk = await C.call("POST", "/api/inquiries", { productId: "solar-panel-540w", quantity: "10", unit: "pieces" });
  const moqDoc = await db.collection("inquiries").findOne({ _id: new ObjectId(moqOk.json.id) });
  check("I18 a quantity at the MOQ with the right unit is accepted and stored with the product's unit", moqOk.status === 201 && moqDoc?.unit === "pieces" && moqDoc?.quantity === 10, `${moqOk.status}`);
  const noUnit = await C.call("POST", "/api/inquiries", { productId: "solar-panel-540w", quantity: "11" });
  const noUnitDoc = await db.collection("inquiries").findOne({ _id: new ObjectId(noUnit.json.id) });
  check("I19 a missing unit becomes the product's own unit", noUnit.status === 201 && noUnitDoc?.unit === "Pieces", `${noUnitDoc?.unit}`);
  const wrongUnit = await C.call("POST", "/api/inquiries", { productId: "1163", quantity: "5", unit: "Kg" });
  check("I20 a unit the product is not sold in is refused (catalog product is sold by the piece)", wrongUnit.status === 400 && /sold in pieces/i.test(wrongUnit.json.fields?.quantity ?? ""), JSON.stringify(wrongUnit.json));
  const noMoq = await C.call("POST", "/api/inquiries", { productId: "1528", quantity: "1" });
  check("I21 a product with no MOQ has no minimum beyond 1 (missing MOQ is not read as a number)", noMoq.status === 201);
  const huge = await C.call("POST", "/api/inquiries", { productId: "1529", quantity: "1000001" });
  check("I22 quantities above 1,000,000 are refused", huge.status === 400);
  const shortInquiry = await C.call("POST", "/api/inquiries", { productId: "1530", quantity: "2", type: "inquiry", message: "hi" });
  check("I23 type inquiry needs a message of 10+ characters", shortInquiry.status === 400 && !!shortInquiry.json.fields?.message);
  const longInquiry = await C.call("POST", "/api/inquiries", { productId: "1530", quantity: "2", type: "inquiry", message: "Is a bulk discount available?" });
  const longDoc = await db.collection("inquiries").findOne({ _id: new ObjectId(longInquiry.json.id) });
  check("I24 an inquiry is stored with type inquiry; the default type is quote", longInquiry.status === 201 && longDoc?.type === "inquiry" && (await db.collection("inquiries").findOne({ _id: new ObjectId(noMoq.json.id) }))?.type === "quote");
  const forged = await C.call("POST", "/api/inquiries", { productId: "1531", quantity: "2", type: { $ne: 1 }, supplierKey: "SLR0001", status: "closed", buyerId: "x" });
  const forgedDoc = forged.json.id ? await db.collection("inquiries").findOne({ _id: new ObjectId(forged.json.id) }) : null;
  check("I25 the client cannot set the owner, status, supplier or an object type", forged.status === 201 && forgedDoc?.type === "quote" && String(forgedDoc?.status).toUpperCase() === "NEW" && forgedDoc?.supplierKey !== "SLR0001" && String(forgedDoc?.buyerId) === String((await db.collection("users").findOne({ email: `c2-${stamp}@example.test` }))._id));
}

// ---------- wishlist
{
  const anonGet = await anon.call("GET", "/api/buyer/wishlist");
  check("W1 anonymous GET answers authenticated:false (no error)", anonGet.status === 200 && anonGet.json.authenticated === false && anonGet.json.productIds.length === 0);
  check("W2 anonymous save refused (401)", (await anon.call("POST", "/api/buyer/wishlist", { productId: "1163" })).status === 401);
  check("W3 anonymous remove refused (401)", (await anon.call("DELETE", "/api/buyer/wishlist/1163")).status === 401);
  check("W4 unknown product refused (404)", (await A.call("POST", "/api/buyer/wishlist", { productId: "424242424" })).status === 404);
  const add = await A.call("POST", "/api/buyer/wishlist", { productId: "1163" });
  check("W5 save creates the entry (201)", add.status === 201 && add.json.saved === true && add.json.alreadySaved === false);
  const again = await A.call("POST", "/api/buyer/wishlist", { productId: "1163" });
  check("W6 saving twice is not duplicated (alreadySaved)", again.status === 200 && again.json.alreadySaved === true && (await db.collection("wishlists").countDocuments({ userId: aId, productKey: "1163" })) === 1);
  await A.call("POST", "/api/buyer/wishlist", { productId: "industrial-air-compressor" });
  const list = await A.call("GET", "/api/buyer/wishlist");
  check("W7 list returns exactly this buyer's saved products", list.json.authenticated === true && JSON.stringify([...list.json.productIds].sort()) === JSON.stringify(["1163", "industrial-air-compressor"].sort()), list.json.productIds.join(","));
  const other = await B.call("GET", "/api/buyer/wishlist");
  check("W8 another account sees none of them", other.json.authenticated === true && other.json.productIds.length === 0);
  const cross = await B.call("DELETE", "/api/buyer/wishlist/1163");
  check("W9 another account cannot delete this buyer's entry", cross.status === 200 && cross.json.removed === false && (await db.collection("wishlists").countDocuments({ userId: aId, productKey: "1163" })) === 1);
  const mine = await A.call("DELETE", "/api/buyer/wishlist/1163");
  check("W10 the owner can remove it", mine.json.removed === true && (await db.collection("wishlists").countDocuments({ userId: aId, productKey: "1163" })) === 0);
  const idx = await db.collection("wishlists").indexes();
  check("W11 unique (userId, productKey) index exists", idx.some((i) => i.unique && i.key.userId === 1 && i.key.productKey === 1));
}

// ---------- cookies and rate limits
{
  const probe = await new Session().call("POST", "/api/auth/register", { role: "buyer", name: "Cookie Probe", email: `c-${stamp}@example.test`, password: "test-password-3" });
  const res = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `c-${stamp}@example.test`, password: "test-password-3" }) });
  const cookie = (res.headers.getSetCookie?.() ?? []).join("; ").toLowerCase();
  check("S1 session cookie is HttpOnly and SameSite=Lax", probe.status === 201 && cookie.includes("httponly") && cookie.includes("samesite=lax"));

  // requirement limit is 10 valid submissions per 10 minutes per user: A has used several; keep going until blocked.
  let blocked = null;
  for (let i = 0; i < 14; i++) {
    const x = await A.call("POST", "/api/requirements", { product: `Rate probe ${i}`, quantity: String(i + 1), city: "Surat" });
    if (x.status === 429) { blocked = x; break; }
  }
  check("S2 requirement submissions are rate-limited (429 with Retry-After)", !!blocked && Number(blocked.headers.get("retry-after")) > 0, blocked ? `retry-after ${blocked.headers.get("retry-after")}s` : "never blocked");
  const limitDoc = await db.collection("rate_limits").findOne({ _id: { $regex: `^requirement:${aId}` } });
  check("S3 the counter is stored in MongoDB with a TTL index (works across instances)", !!limitDoc && (await db.collection("rate_limits").indexes()).some((i) => i.expireAfterSeconds === 0));

  // login limit: 10 per 10 minutes per address. Done last because it blocks this address for a while.
  const codes = [];
  for (let i = 0; i < 13; i++) codes.push((await new Session().call("POST", "/api/auth/login", { email: `nobody-${stamp}@example.test`, password: "wrong-password-x" })).status);
  const firstBlock = codes.indexOf(429);
  check("S4 repeated failed logins are throttled: 401 until the limit of 10 per address (earlier attempts from this address in the same 10 minutes count too), then 429", firstBlock >= 1 && firstBlock <= 10 && codes.slice(firstBlock).every((c) => c === 429) && codes.slice(0, firstBlock).every((c) => c === 401), codes.join(","));
}

await client.close();
const fails = results.filter((x) => !x.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) console.log("FAILED:\n" + fails.map((f) => " - " + f.name).join("\n"));
