# 2090 · Q89 V2-FL-JOB: imported jobs belong to their importing firm (RED)

2001's `v2_practice_firm` policy on `app.job` let every job with no
`practice_session_digest` through. An imported job is stored exactly that way
(`provenance = 'imported'`, digest NULL), and every table locked "through a
visible job" (2001, 2025, 2047, 2068 and the photo lock) inherited the opening.
So a second linked firm sharing the practice tenant could read another firm's
imported job and its proposal, scope, quote and import rows.

2090 replaces only `app.job`'s own `v2_practice_firm` policy (still restrictive,
`FOR ALL`, `jobguard_runtime` only, USING equal to WITH CHECK):

- a job with a digest is its digest's firm's, as in 2001;
- an imported job in the shared practice tenant is visible to, and writable by,
  only the firm that owns it, decided by the owned-job walk 0734 and
  `practiceOwnedJobsSql` use (the firm's own jobs, then jobs imported from them
  through `job_import_v3`, or v1's frozen parties plus a succeeded adopt
  receipt);
- an imported job no firm owns is visible to no practice firm;
- anything else keeps 2001's pass-through.

The walk is `app.v2_firm_owns_imported_job(tenant, job)`: plpgsql, STABLE,
SECURITY DEFINER owned by `jobguard_migration`, `search_path = pg_catalog,
pg_temp`, read-only, boolean result. As definer it reads `app.job` without the
runtime policy, so there is no recursion; `tenant_isolation` still applies.
Only `jobguard_runtime` may execute it. Main's import definer is not subject to
this policy, so imports still write. Main's policies, lp6, 0734 and every
indirect lock are unchanged.

The V2 bootstrap applies this last, after 2047, only in `jobguard_v2_local` with
2001's policy present; elsewhere it is a no-op, which the empty proof records.
The FL guard's root rule is updated to this policy.

Proofs are the Q89 block in `tools/v2/seed.integration.test.mjs`. Before 2090 the
second firm read 24 rows across 13 tables for an imported job and an ownerless
one; with 2090 it reads none, on any direct or indirect locked table, and can't
update or delete the job. The owner still reads every row of its imported job and
its session job; the ownerless job is hidden from it too. Running 2090 twice
changes nothing.
