# 2064 · V2 firm lock, open facts (E1)

The checked V2 bootstrap applies 2064 right after 2029, and only to the
dedicated `jobguard_v2_local` database, behind 2001's database-name and
data-directory fence. It also stops unless 2001's `v2_practice_firm` policy on
`app.job` is present.

V2's two linked practice firms share one backing tenant, and FL-1's guard
rejects a job-bound table without a firm lock. 2064 adds 2001's restrictive
`FOR ALL TO jobguard_runtime` rule to `app.v2_open_fact` and
`app.v2_open_fact_change`, joining `app.job` on `(tenant_id, job_id)`, created
only when missing, so the file is safe to run twice.

No grant, permissive policy, function or main migration changes. Rolling back
means dropping the `v2_practice_firm` policy on these tables on a rehearsal
database only. Tests: the FL guard in `tools/v2/seed.integration.test.mjs` and
`tools/v2/firm-lock/FL-E1.checks.mjs` (firm A positive control, firm B and its
real company read none of firm A's rows).
