-- Finbyn Mart catalog schema (sellers -> products -> sizes).
-- Written to run unchanged on SQLite and to port to PostgreSQL/MySQL with
-- only trivial edits (types are plain TEXT / INTEGER / NUMERIC).
--
-- DATA PROVENANCE (from the Notes sheets of public/sellers.xlsx and
-- public/real_clothing_products.xlsx):
--   * sellers: fictional sample data. Emails are @example.com and phones are
--     "+91 00000 xxxxx" placeholders — never display them as real contact info.
--   * products: name / image / category / colour come from the Kaggle Fashion
--     Product Images Dataset (Myntra), licensed for learning/research use only.
--     Check the license before any commercial use.
--   * estimated_price_inr and product_sizes are NOT in that dataset; they were
--     estimated by product type. Replace with real seller values before launch.
--   * source_image_url points at Myntra's CDN over plain http. It is stored as
--     provenance only and must not be hotlinked from the live site.

CREATE TABLE sellers (
  id             TEXT PRIMARY KEY,                       -- e.g. SLR0001
  name           TEXT NOT NULL UNIQUE,
  owner_name     TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,                   -- placeholder, see header
  phone          TEXT NOT NULL,                          -- placeholder, see header
  city           TEXT NOT NULL,
  state          TEXT NOT NULL,
  pincode        TEXT NOT NULL,                          -- TEXT keeps leading zeros
  specialization TEXT NOT NULL,
  rating         NUMERIC NOT NULL CHECK (rating >= 0 AND rating <= 5),
  total_orders   INTEGER NOT NULL CHECK (total_orders >= 0),
  joined_date    TEXT NOT NULL,                          -- ISO date YYYY-MM-DD
  status         TEXT NOT NULL CHECK (status IN ('Active', 'Inactive'))
);

CREATE TABLE categories (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,                     -- e.g. "Men Tshirts"
  department   TEXT NOT NULL,                            -- Men / Women / Boys / Girls / Unisex
  product_type TEXT NOT NULL                             -- e.g. "Tshirts"
);

CREATE TABLE products (
  id                  INTEGER PRIMARY KEY,               -- product_id from the source dataset
  seller_id           TEXT    NOT NULL REFERENCES sellers (id),
  category_id         INTEGER NOT NULL REFERENCES categories (id),
  name                TEXT    NOT NULL,
  colour              TEXT    NOT NULL,
  estimated_price_inr INTEGER NOT NULL CHECK (estimated_price_inr > 0),
  source_image_url    TEXT    NOT NULL
);

CREATE TABLE product_sizes (
  product_id INTEGER NOT NULL REFERENCES products (id),
  size       TEXT    NOT NULL,                           -- estimated, see header
  PRIMARY KEY (product_id, size)
);

CREATE INDEX idx_products_seller   ON products (seller_id);
CREATE INDEX idx_products_category ON products (category_id);
CREATE INDEX idx_sellers_specialization ON sellers (specialization);

-- Product counts are derived, never stored: the source sellers file carried a
-- total_products column (sum 474,936) that cannot be true for a 21,392-row catalog.
CREATE VIEW seller_product_counts AS
SELECT s.id AS seller_id,
       s.name AS seller_name,
       s.specialization,
       s.status,
       COUNT(p.id) AS product_count
FROM sellers s
LEFT JOIN products p ON p.seller_id = s.id
GROUP BY s.id;
