// Builds the catalog database: assigns every product to exactly one seller,
// writes portable seed CSVs to db/seed/, then loads them into db/catalog.sqlite
// using db/schema.sql and verifies the result.
//
//   npm run catalog:build
//
// Deterministic: the same input files always produce the same assignment.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(import.meta.dirname, "..");
const SELLERS_CSV = path.join(ROOT, "public", "sellers.csv");
const PRODUCTS_CSV = path.join(ROOT, "public", "real_clothing_products.csv");
const SCHEMA_SQL = path.join(ROOT, "db", "schema.sql");
const SEED_DIR = path.join(ROOT, "db", "seed");
const DB_FILE = path.join(ROOT, "db", "catalog.sqlite");

const SEED = 20261031;
// Share of each category's products given to "Multi-category" sellers instead
// of that category's specialists, so generalist sellers carry a mixed range.
const MULTI_CATEGORY_SHARE = 0.1;

// ---------- CSV helpers ----------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur.replace(/\r$/, ""));
    rows.push(row);
  }
  const header = rows.shift();
  return rows
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((k, i) => [k, r[i]])));
}

function csvCell(value) {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCSV(file, columns, rows) {
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(","));
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

// ---------- seeded randomness ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, rand) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------- category -> seller specialization ----------
// Ordered: first match wins. Anything unmatched goes to Multi-category sellers.
const SPECIALIZATION_RULES = [
  [/^(Boys|Girls)\b/, "Kids Wear"],
  [/^Women Sarees$/, "Sarees"],
  [/\b(Briefs|Bra|Innerwear Vests|Trunk|Boxers|Camisoles|Shapewear|Stockings)\b/, "Innerwear"],
  [/\b(Nightdress|Night suits|Baby Dolls|Bath Robe|Robe|Lounge)\b/, "Nightwear"],
  [/\b(Track Pants|Tracksuits|Swimwear|Tights)\b/, "Sportswear"],
  [/\b(Jackets|Rain Jacket|Rain Trousers|Sweaters|Sweatshirts|Shrug|Blazers|Waistcoat)\b/, "Winter Wear"],
  [/^Women (Kurtas|Kurtis|Kurta Sets|Dupatta|Patiala|Salwar|Churidar|Lehenga Choli)/, "Women Ethnic Wear"],
  [/^Men (Kurtas|Kurtis|Tshirts|Shirts|Tops)$/, "Men Topwear"],
  [/^Unisex Tshirts$/, "Men Topwear"],
  [/^(Men|Unisex) (Trousers|Jeans|Shorts|Churidar)$/, "Men Bottomwear"],
  [/^Women /, "Women Western Wear"],
];

function specializationFor(category) {
  for (const [pattern, specialization] of SPECIALIZATION_RULES) {
    if (pattern.test(category)) return specialization;
  }
  return "Multi-category";
}

// ---------- load + validate ----------
const sellerRows = parseCSV(fs.readFileSync(SELLERS_CSV, "utf8"));
const productRows = parseCSV(fs.readFileSync(PRODUCTS_CSV, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(`Input validation failed: ${message}`);
}

assert(new Set(sellerRows.map((s) => s.seller_id)).size === sellerRows.length, "duplicate seller_id");
assert(new Set(productRows.map((p) => p.product_id)).size === productRows.length, "duplicate product_id");
for (const s of sellerRows) {
  assert(s.status === "Active" || s.status === "Inactive", `seller ${s.seller_id} has status "${s.status}"`);
  assert(Number(s.rating) >= 0 && Number(s.rating) <= 5, `seller ${s.seller_id} rating out of range`);
}
for (const p of productRows) {
  assert(/^\d+$/.test(p.price) && Number(p.price) > 0, `product ${p.product_id} has price "${p.price}"`);
  assert(p.name.trim() && p.category.trim() && p.colour.trim() && p.image.trim(), `product ${p.product_id} has a blank field`);
}

// ---------- categories ----------
const categoryNames = [...new Set(productRows.map((p) => p.category))].sort();
const categories = categoryNames.map((name, i) => {
  const [department, ...rest] = name.split(" ");
  return { id: i + 1, name, department, product_type: rest.join(" ") };
});
const categoryId = new Map(categories.map((c) => [c.name, c.id]));

// ---------- seller pools (active sellers only) ----------
const rand = mulberry32(SEED);
const activeSellers = sellerRows.filter((s) => s.status === "Active");
const pools = new Map();
for (const s of activeSellers) {
  if (!pools.has(s.specialization)) pools.set(s.specialization, []);
  pools.get(s.specialization).push(s.seller_id);
}
for (const [spec, ids] of pools) pools.set(spec, shuffle(ids.sort(), rand));
const multiPool = pools.get("Multi-category") ?? [];
assert(multiPool.length > 0, "no active Multi-category sellers");

// ---------- assign each product to exactly one seller ----------
const groups = new Map();
for (const p of productRows) {
  const spec = specializationFor(p.category);
  if (!groups.has(spec)) groups.set(spec, []);
  groups.get(spec).push(p);
}

const assignment = new Map(); // product_id -> seller_id
const cursors = new Map();
function nextFrom(poolName, pool) {
  const i = cursors.get(poolName) ?? 0;
  cursors.set(poolName, i + 1);
  return pool[i % pool.length];
}

for (const [spec, products] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  const specialists = pools.get(spec) ?? [];
  const ordered = shuffle(products.sort((a, b) => Number(a.product_id) - Number(b.product_id)), rand);
  for (const p of ordered) {
    const toMulti = spec === "Multi-category" || specialists.length === 0 || rand() < MULTI_CATEGORY_SHARE;
    assignment.set(p.product_id, toMulti ? nextFrom("__multi", multiPool) : nextFrom(spec, specialists));
  }
}
assert(assignment.size === productRows.length, "not every product was assigned");

// ---------- write seed CSVs ----------
fs.mkdirSync(SEED_DIR, { recursive: true });

const clean = (s) => s.replace(/\s+/g, " ").trim();

writeCSV(
  path.join(SEED_DIR, "sellers.csv"),
  ["id", "name", "owner_name", "email", "phone", "city", "state", "pincode", "specialization", "rating", "total_orders", "joined_date", "status"],
  sellerRows.map((s) => ({
    id: s.seller_id,
    name: clean(s.seller_name),
    owner_name: clean(s.owner_name),
    email: s.email.trim(),
    phone: s.phone.trim(),
    city: clean(s.city),
    state: clean(s.state),
    pincode: s.pincode.trim(),
    specialization: clean(s.specialization),
    rating: s.rating,
    total_orders: s.total_orders,
    joined_date: s.joined_date,
    status: s.status,
  })),
);

writeCSV(path.join(SEED_DIR, "categories.csv"), ["id", "name", "department", "product_type"], categories);

const products = productRows
  .map((p) => ({
    id: Number(p.product_id),
    seller_id: assignment.get(p.product_id),
    category_id: categoryId.get(p.category),
    name: clean(p.name),
    colour: clean(p.colour),
    estimated_price_inr: Number(p.price),
    source_image_url: p.image.trim(),
    sizes: p.size.split(",").map((x) => x.trim()).filter(Boolean),
  }))
  .sort((a, b) => a.id - b.id);

writeCSV(
  path.join(SEED_DIR, "products.csv"),
  ["id", "seller_id", "category_id", "name", "colour", "estimated_price_inr", "source_image_url"],
  products,
);
writeCSV(
  path.join(SEED_DIR, "product_sizes.csv"),
  ["product_id", "size"],
  products.flatMap((p) => [...new Set(p.sizes)].map((size) => ({ product_id: p.id, size }))),
);

// ---------- build + verify the SQLite database ----------
for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.rmSync(DB_FILE + suffix, { force: true });
const db = new DatabaseSync(DB_FILE);
db.exec("PRAGMA foreign_keys = ON");
db.exec(fs.readFileSync(SCHEMA_SQL, "utf8"));

function load(table, columns, rows) {
  const insert = db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`);
  db.exec("BEGIN");
  for (const row of rows) insert.run(...columns.map((c) => row[c]));
  db.exec("COMMIT");
}

load(
  "sellers",
  ["id", "name", "owner_name", "email", "phone", "city", "state", "pincode", "specialization", "rating", "total_orders", "joined_date", "status"],
  parseCSV(fs.readFileSync(path.join(SEED_DIR, "sellers.csv"), "utf8")),
);
load("categories", ["id", "name", "department", "product_type"], parseCSV(fs.readFileSync(path.join(SEED_DIR, "categories.csv"), "utf8")));
load(
  "products",
  ["id", "seller_id", "category_id", "name", "colour", "estimated_price_inr", "source_image_url"],
  parseCSV(fs.readFileSync(path.join(SEED_DIR, "products.csv"), "utf8")),
);
load("product_sizes", ["product_id", "size"], parseCSV(fs.readFileSync(path.join(SEED_DIR, "product_sizes.csv"), "utf8")));

const one = (sql) => Object.values(db.prepare(sql).get())[0];
const fkViolations = db.prepare("PRAGMA foreign_key_check").all().length;
const integrity = one("PRAGMA integrity_check");

const checks = {
  sellers: one("SELECT COUNT(*) FROM sellers"),
  categories: one("SELECT COUNT(*) FROM categories"),
  products: one("SELECT COUNT(*) FROM products"),
  product_sizes: one("SELECT COUNT(*) FROM product_sizes"),
  foreign_key_violations: fkViolations,
  integrity_check: integrity,
  products_on_inactive_sellers: one(
    "SELECT COUNT(*) FROM products p JOIN sellers s ON s.id = p.seller_id WHERE s.status <> 'Active'",
  ),
  products_without_sizes: one(
    "SELECT COUNT(*) FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_sizes z WHERE z.product_id = p.id)",
  ),
};
console.log("Row counts and integrity:", checks);

const perSeller = db
  .prepare("SELECT product_count FROM seller_product_counts WHERE status = 'Active' ORDER BY product_count")
  .all()
  .map((r) => r.product_count);
console.log("Active sellers:", perSeller.length, "| with 0 products:", perSeller.filter((n) => n === 0).length,
  "| products per active seller min/median/max:", perSeller[0], perSeller[Math.floor(perSeller.length / 2)], perSeller[perSeller.length - 1]);

const mismatched = products.filter((p) => {
  const seller = sellerRows.find((s) => s.seller_id === p.seller_id);
  const spec = specializationFor(categoryNames[p.category_id - 1]);
  return seller.specialization !== spec;
}).length;
console.log(`Products held by a seller outside their category's specialization (Multi-category sellers): ${mismatched} (${((mismatched / products.length) * 100).toFixed(1)}%)`);

console.log("\nCategory group -> specialization sizes (products / active specialist sellers):");
for (const [spec, items] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${spec.padEnd(20)} ${String(items.length).padStart(5)} products / ${String((pools.get(spec) ?? []).length).padStart(3)} sellers`);
}
const unmatched = categoryNames.filter((c) => specializationFor(c) === "Multi-category");
console.log("Categories with no specialist (given to Multi-category sellers):", unmatched.join(", ") || "none");

db.close();
if (fkViolations > 0 || integrity !== "ok" || checks.products_on_inactive_sellers > 0) {
  console.error("VERIFICATION FAILED");
  process.exit(1);
}
console.log("\nOK ->", path.relative(ROOT, DB_FILE));
