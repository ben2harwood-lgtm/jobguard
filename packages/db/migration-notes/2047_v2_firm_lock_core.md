# 2047 · V2 firm lock, core tables (FL-1)

The checked V2 bootstrap applies 2047 after 2025, and only to the dedicated
`jobguard_v2_local` database, behind 2001's database-name and data-directory
fence. It also stops unless 2001's `v2_practice_firm` policy on `app.job` is
present.

V2's two linked practice firms share one backing tenant, so main's tenant RLS
does not separate them. The Q35 catalog run found 162 job-bound tables that
`jobguard_runtime` could read without a firm lock. 2047 locks the 39 V2 core
tables (work plan, job record, quote, variation, customer money, scope,
proposal review): 36 through `app.job` on `(tenant_id, job_id)`, and three
through their parent (`finding_suppression` via `job_finding`,
`quote_delivery_event` via `quote_send`, `job_link` via both party bindings).
Each policy is 2001's restrictive `FOR ALL TO jobguard_runtime` rule, created
only when missing, so the file is safe to run twice. FL-2 to FL-5 (2048 to
2051) lock the rest; until then their tables are named in
`tools/v2/firm-lock/pending/`.

No grant, permissive policy, function or main migration changes. Owner routines
(SECURITY DEFINER) are not reached by the lock; FL-F (Q40) reviews them. A
forward fix is a later V2 migration. Rolling back means dropping the
`v2_practice_firm` policies on these tables on a rehearsal database only.

The guard test in `tools/v2/seed.integration.test.mjs` fails when any job-bound
table that runtime can touch lacks a working firm lock (row security on, a
permissive runtime policy still present, the firm policy restrictive, for ALL,
for runtime only, and joining `app.job` or a foreign-key parent) and is not in a
pending file.
