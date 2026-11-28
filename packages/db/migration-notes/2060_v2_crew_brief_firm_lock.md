# 2060 · V2 firm lock, crew briefs (D4)

The checked V2 bootstrap applies 2060 after 2047 and D1's 2059, and only to the dedicated
`jobguard_v2_local` database, behind 2001's database-name and data-directory
fence. It also stops unless 2001's `v2_practice_firm` policy on `app.job` is
present.

V2's two linked practice firms share one backing tenant, so 2063's tenant RLS
does not separate them, and FL-1's guard rejects the three crew brief tables without a
firm lock. 2060 adds 2001's restrictive `FOR ALL TO jobguard_runtime` rule,
joining `app.job` on `(tenant_id, job_id)`, created only when missing, so the
file is safe to run twice.

No grant, permissive policy, function or main migration changes. Rolling back
means dropping the `v2_practice_firm` policy on these tables on a rehearsal
database only. Tests: the FL guard in `tools/v2/seed.integration.test.mjs` and
`tools/v2/firm-lock/FL-D4.checks.mjs` (firm A positive control, firm B and its
real company read none of firm A's rows).
