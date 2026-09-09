-- A3D Printing back office, initial schema.
-- Money is stored in cents, in XCG, so nothing ever depends on float maths.

CREATE TABLE customers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  company      TEXT,
  language     TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX customers_email ON customers (email);

CREATE TABLE orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ref          TEXT NOT NULL,              -- A3D-0001, what the customer sees
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  mode         TEXT NOT NULL DEFAULT 'print',   -- print | dev
  status       TEXT NOT NULL DEFAULT 'new',
  material     TEXT,
  colour       TEXT,
  quantity     TEXT,
  project_type TEXT,                       -- dev side: website, app, ...
  timeline     TEXT,
  notes        TEXT,
  source       TEXT DEFAULT 'website',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX orders_ref ON orders (ref);
CREATE INDEX orders_status ON orders (status, created_at DESC);
CREATE INDEX orders_customer ON orders (customer_id);

CREATE TABLE order_files (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  r2_key       TEXT NOT NULL,
  filename     TEXT NOT NULL,
  bytes        INTEGER NOT NULL,
  content_type TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX order_files_order ON order_files (order_id);

CREATE TABLE order_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                -- status | note | email | payment
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX order_events_order ON order_events (order_id, created_at DESC);

CREATE TABLE quotes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  currency          TEXT NOT NULL DEFAULT 'XCG',
  subtotal_cents    INTEGER NOT NULL DEFAULT 0,
  tax_cents         INTEGER NOT NULL DEFAULT 0,
  total_cents       INTEGER NOT NULL DEFAULT 0,
  valid_until       TEXT,
  status            TEXT NOT NULL DEFAULT 'draft',  -- draft|sent|accepted|paid|expired|declined
  qbo_estimate_id   TEXT,
  sentoo_uid        TEXT,
  sentoo_url        TEXT,
  sentoo_status     TEXT,
  sent_at           TEXT,
  paid_at           TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX quotes_order ON quotes (order_id);
CREATE INDEX quotes_sentoo ON quotes (sentoo_uid);

CREATE TABLE quote_lines (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id        INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  qty             REAL NOT NULL DEFAULT 1,
  unit_cents      INTEGER NOT NULL DEFAULT 0,
  line_cents      INTEGER NOT NULL DEFAULT 0,
  position        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX quote_lines_quote ON quote_lines (quote_id, position);

-- Repeat items. This is the source of truth for the public prices page.
CREATE TABLE price_list (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sku         TEXT,
  name        TEXT NOT NULL,
  description TEXT,
  unit_cents  INTEGER,
  active      INTEGER NOT NULL DEFAULT 1,
  position    INTEGER NOT NULL DEFAULT 0
);

-- Privacy friendly analytics: no cookies, no third party, no raw IP stored.
CREATE TABLE events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL DEFAULT (datetime('now')),
  day       TEXT NOT NULL,
  path      TEXT NOT NULL,
  referrer  TEXT,
  country   TEXT,
  visitor   TEXT NOT NULL,   -- salted daily hash, cannot be traced back
  mode      TEXT
);
CREATE INDEX events_day ON events (day);
CREATE INDEX events_path ON events (day, path);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

INSERT INTO settings (key, value) VALUES
  ('quote_validity_days', '14'),
  ('tax_rate_pct', '0'),
  ('next_ref', '1');

INSERT INTO price_list (sku, name, description, unit_cents, position) VALUES
  ('KEY-STD',  'Keychain',                'Custom shape, single colour',        NULL, 1),
  ('KEY-NFC',  'NFC keychain',            'Programmable NFC tag inside',        NULL, 2),
  ('HLD-PHN',  'Phone holder',            'Desk stand',                         NULL, 3),
  ('HLD-HDS',  'Headset holder',          'Desk or under-desk mount',           NULL, 4),
  ('CST-SET',  'Coasters',                'Set, custom design',                 NULL, 5),
  ('STD-CARD', 'Business card stand',     'Counter top',                        NULL, 6),
  ('STD-NFC',  'NFC menu stand',          'Table stand with NFC menu link',     NULL, 7),
  ('SGN-LED',  'LED logo sign 50cm',      'Backlit, custom logo',               NULL, 8);
