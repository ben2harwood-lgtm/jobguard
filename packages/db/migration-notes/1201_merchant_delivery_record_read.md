# 1201_merchant_delivery_record_read merchant delivery record read

RED: one migration-owned checked read; runtime execute only, fixed pg_catalog search path.
Uses the dunning synthetic database refusal and private owner/admin session helper.
No table grants, roles, writes, or helper execute grants. Tenant-wide latest receipt
per order; job locator must belong to that tenant. Exact supplier context, latest
status, and first ready receipt quantities are returned. Held latest revisions are
excluded by the pure projection rather than falling back to an earlier ready row.

No backfill. Forward fix by replacing this routine; rollback by revoking its execute
and dropping this routine after disabling the practice route. Existing records stay intact.
LP allowances are in the migration proof, composed by the existing loader.
CI must execute PostgreSQL refusal, catalogue, upgrade and no-write tests and browser journeys.
