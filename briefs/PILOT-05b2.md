# Build order PILOT-05b2 (JobGuard real free pilot, G1, RED money/hidden state) — coordinator, 22 Nov 2026

Base: branch codex/sandbox/pilot-05b1 at d31f0269f2bb7ae9b13245acaed0765d206ae191 (PILOT-05b1 strict independent check PASS, landing via PR #885; includes main with PILOT-05). Push to branch codex/sandbox/pilot-05b2. Do not open a PR.

Build ONLY piece 2 ("Authorized reveal, dispute, confirmation and invoice") of the plan below. Piece 1 is done.

Limits: reuse existing manifest, certificate, reveal, dispute, catch-confirmation and invoice services through verified pilot membership only; require the matching persisted certificate before reveal and supported invoice issuance; findings stay proposals and only explicit human confirmation through the normal variation and approval chain creates billable lines; pre-lock reads, screens, exports, meter, notices and side effects identical for zero vs many hidden signals; pending/unsupported disclosure, tax and invoice policy blocks execution; no platform money effects, collections or synthetic paid state. Do not weaken any existing refusal; replace blanket refusals only with narrow pilot-success cases plus all remaining refusals. If you add a migration, it is 0779 (0777 = 05b1, 0778 = PILOT-07), declare everything in its proof in its own group with an authority path, use app.lp11_policy_tenant() for any RLS, add its stem to purchase-order-audit's skip list, and update upgrade-catalogue successor pins by the existing convention. Add every changed file to config/lanes/pilot-05b2.json. Run the WHOLE db suite on real PostgreSQL if you can, plus API/web suites, typechecks and a browser journey for lock -> processing -> certificate -> reveal -> dispute -> human confirmation -> supported invoice (pending/refused states and pre-lock non-disclosure). Report head SHA and counts. If something outside these limits blocks you, stop and say exactly what.

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
