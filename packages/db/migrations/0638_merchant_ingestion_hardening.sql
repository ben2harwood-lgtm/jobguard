-- Merchant ingestion hardening landed on main as 0559_merchant_ingestion_hardening.sql.
-- Preserve this built-ahead migration slot without applying the same DDL twice.
BEGIN;
COMMIT;
