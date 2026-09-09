-- QuickBooks Online: the estimate is created when the quote is built, the
-- invoice and its payment are created once the money actually arrives.
-- Both are best effort: a QuickBooks outage must never block a quote going out
-- or a payment being recognised, so these columns stay null until they work.

ALTER TABLE quotes ADD COLUMN qbo_estimate_no TEXT;
ALTER TABLE quotes ADD COLUMN qbo_invoice_id  TEXT;
ALTER TABLE quotes ADD COLUMN qbo_invoice_no  TEXT;
ALTER TABLE quotes ADD COLUMN qbo_error       TEXT;

ALTER TABLE customers ADD COLUMN qbo_customer_id TEXT;
