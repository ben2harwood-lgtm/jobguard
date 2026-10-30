# 0400 — trial activation lock order (lock-order-418, RED)

Recreates only `app.mon3_activate` from its latest main definition in 0373. Authenticate without a company lock, validate the envelope, lock the tenant-qualified job, then take the existing company/owner lock before reading trial state. The application dispatcher also locks the job before calling `mon3_owner`, so replay/receipt locks and audit stay downstream. Existing approvals, entitlement, capacity, trial, quote and billing rules are preserved. No new grants, routines, tables, data changes or external actions.

`CREATE OR REPLACE` preserves owner and ACL. The real PostgreSQL regression covers the populated predecessor upgrade, both direct SQL and dispatcher entry points blocked behind a same-job MON-1 resume, unchanged legacy refusal, durable meter replay, and rolled-back trial receipts. Synthetic parent fixtures only; no capacity or trial routine is substituted.

Forward fix only: do not restore the company-first routine in service. If a later correction is needed, use a new migration from this body and keep job → company → receipt/source → audit order. PostgreSQL and full CI checks must run after the router pushes; the sandbox cannot start PostgreSQL. Independent Claude RED review remains required.
