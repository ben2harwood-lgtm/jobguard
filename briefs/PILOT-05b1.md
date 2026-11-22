# Build order PILOT-05b1 (JobGuard real free pilot, G1, RED shadow/hidden state) — coordinator, 22 Nov 2026

Base: branch codex/sandbox/pilot-05 at 0ef999db4f09bd36576b87c76b96d7fa2289fee6 (PILOT-05 independent check PASS, landing via PR #883). Push to branch codex/sandbox/pilot-05b1. Do not open a PR.

Build ONLY piece 1 ("Pilot Final Check processing and certificate") of the plan below. Piece 2 is a later order.

Coordinator authorisation (22 Nov 2026): the protected guard, test and privilege changes that piece 1 lists are authorised, within these limits: fictional data only; every new path fails closed and is gated by G1, the verified pilot binding and approved pilot terms bound to the immutable lock; LP-11 shadow isolation stays (separate non-owner shadow credential, queue login has no business authority, builder roles gain no hidden-table access); replace blanket refusal assertions only with narrow pilot-success cases plus ALL remaining refusal cases; do not touch final-account-lock synthetic refusals, final-check-access SV5-21..24, shadow-catalog or LP-11 tests. Migration 0777_pilot_final_check.sql with its own proof group and authority path; use the 0772/0775 successor convention for any upgrade test that pins a replaced body. Run the WHOLE db suite on real PostgreSQL if you can (otherwise every *-upgrade, lp11-*, shadow-*, final-check-*, final-account-lock and the grant/authority guards), plus API/web suites and typechecks. Report head SHA and counts. If something outside this authorisation blocks you, stop and say exactly what.

## Astra plan (22 Nov 2026)
PILOT-05b should be two sequential RED pieces, based on PILOT-05 at 0ef999d and the plan’s “Done when” at eefbdcd. This is a source-inspected plan; no files changed or tests run.

1. Pilot Final Check processing and certificate

Add migration 0777_pilot_final_check.sql. Change app.lp11_bind_shadow_job’s synthetic-only database/track checks to admit a separate, verified pilot path: dedicated pilot business database, small_builder / pilot_no_charge / pilot_capture job, no practice identity, and trusted worker-to-tenant/job binding. Database naming and queue identifiers alone must never authorize access. Preserve the existing synthetic path, transaction-bound scope, expiry, cross-job/tenant rebinding refusal, and exclusion of runtime-role members.

Keep LP-11 shadow isolation: processing uses a separate non-owner shadow credential; the queue login grants no business authority; builder roles gain no hidden-table access.

Replace only pilotWorkerTasks().final_check’s unconditional refusal with the checked executor. Change FinalCheckWorker.execute’s synthetic-only guard only for explicitly bound pilot execution. Keep practice-run, demo, detection and other unsupported queue tasks refused. Reuse executeFinalCheckTask’s persisted manifest/completion checks and certificate publication. Recheck G1 at ingestion, execution and publication; require approved pilot terms bound to the immutable lock. Missing, stale, revoked or mismatched authority fails closed. Failed/incomplete sources cannot produce a certificate.

Give 0777 its own migration proof and authority group, including exact catalog, ownership, grants, RLS and upgrade deltas. Do not rewrite 0776 or absorb the change into its proof.

2. Authorized reveal, dispute, confirmation and invoice

Connect the supported pilot routes and screens through verified pilot membership, replacing practice-session dependencies only on this path. Reuse existing manifest, certificate, reveal, dispute, catch-confirmation and invoice services.

Require the matching persisted certificate before reveal and supported invoice issuance. Preserve lock/revision/hash bindings, stale-result invalidation and idempotency. Findings remain proposals: only explicit human confirmation through the normal variation and approval chain can create billable lines. Include authorized off-platform receipt entry where supported.

Before lock, zero and many hidden signals must produce identical reads, screens, exports, meter, notices and side effects, including query paths. Preserve required must-surface/lawful disclosures and permanent fee-ineligibility. Unsupported or pending disclosure, tax and invoice policies block execution.

Tests and acceptance

The current pins include pilot-ingress.test.ts’s copied/replayed queue refusal, final-check.worker.test.ts’s SV5-32 non-synthetic refusal, final-check-task-executor.test.ts’s environment/G1 checks, and final-check-practice-readers.integration.test.ts’s non-synthetic refusal. Replace blanket refusal assertions only with narrowly authorized pilot-success cases plus all remaining refusal cases; retain practice-reader refusal.

Preserve final-account-lock.integration.test.ts’s synthetic-path refusals, final-check-access.integration.test.ts’s SV5-21–24 isolation/non-disclosure checks, shadow-catalog and LP-11 tests.

In CI, use real PostgreSQL with separate runtime/shadow/queue credentials: fresh install and 0776→0777 upgrade, wrong binding/role/job/tenant, expired scope, pool reuse, forged payloads, G1 revocation, missing terms, source failure, concurrent retries and single certificate publication. Extend invoice, catch-confirmation, disposition and invalidation suites. Add a browser journey covering lock → processing → certificate → reveal → dispute → human confirmation → supported invoice, including pending/refused states and pre-lock non-disclosure.

Needs Ben: no new product decision for fictional-data construction. Obtain explicit authorization for protected guard/test/privilege changes before implementation if not already covered. Real activation still requires PILOT-16 terms/D13, supported D02/D06 policy and PILOT-21 G1 approval. Real providers, platform money effects, synthetic paid-state promotion and collections remain out of scope.
