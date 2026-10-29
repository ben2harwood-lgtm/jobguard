# 0342 — CH-9 part 2 (RED)

Adds two read-only, synthetic-database-only functions. No rows or tables change.
`read_value_job` authenticates either the shared practice job's current owner or
MON-1's current company owner/admin, before reading a lock. It returns null before
lock and does no hidden query on that path. `read_value_business` uses MON-2A's
company authentication before enumerating that company's jobs. Neither accepts a
client amount, arbitrary actor, source manifest or settlement override.

Tracked lines belong to the original locked revision and its final invoice.
Catch eligibility and freshness reuse SV-6's resolver, including #346 job binding,
#356 positive allocation caps/distinct lines, and corrected #368 supplementary
revision/lock/check/case-own-variation-revision binding. No allocator, writer,
review approval, fee posting, collection, provider action or real-data gate changes.
Runtime receives EXECUTE only; PUBLIC/infrastructure/shadow receive none.

Forward fix: replace/revoke these two read functions; no backfill or commercial
history needs rollback. The upgrade proof preserves populated predecessor rows,
types and keys, then applies successors and repeats the registry runner.
PostgreSQL installation, grants and behavior are CI checks, not local claims.
