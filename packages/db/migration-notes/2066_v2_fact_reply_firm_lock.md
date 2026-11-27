# 2066 · V2 firm lock, fact replies (E2)

The checked V2 bootstrap applies 2066 right after 2030, and only to the
dedicated `jobguard_v2_local` database, behind 2001's database-name and
data-directory fence. It also stops unless 2001's `v2_practice_firm` policy on
`app.job` is present.

V2's two linked practice firms share one backing tenant, and FL-1's guard
rejects a job-bound table without a firm lock. 2066 adds 2001's restrictive
`FOR ALL TO jobguard_runtime` rule to `app.v2_reply_recipient`,
`app.v2_fact_reply_request`, `app.v2_fact_reply`, `app.v2_fact_reply_cancel`
and `app.v2_fact_reply_applied`, joining `app.job` on `(tenant_id, job_id)`,
created only when missing, so the file is safe to run twice.

The customer's reply link is unchanged: it goes through 2030's SECURITY
DEFINER token function, which the runtime-only rule does not reach.

No grant, permissive policy, function or main migration changes. Rolling back
means dropping the `v2_practice_firm` policy on these tables on a rehearsal
database only. Tests: the FL guard in `tools/v2/seed.integration.test.mjs` and
`tools/v2/firm-lock/FL-E2.checks.mjs` (firm A positive control, firm B and its
real company read none of firm A's rows).
