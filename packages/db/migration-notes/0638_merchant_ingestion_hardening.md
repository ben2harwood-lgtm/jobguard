Merchant ingestion hardening landed on main as `0559_merchant_ingestion_hardening.sql`.
This built-ahead slot is now a no-op; the landed intake metadata, tenant/job foreign
key and unchanged fingerprinted supplier-document row remain authoritative.
No tables, rows, routines, grants or policies change here.
