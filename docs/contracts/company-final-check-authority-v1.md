# Company Final Check authority v1

**PROPOSED: not in force until accepted.** DEMO-S-TRIAL-FC-DESIGN · RED · design only.
Source-inspected at HEAD = local `origin/main` `56b74eaec205e86c9eaf7eee75d85ade2599a364` (5 November 2026); no fetch. Nothing built or granted. G0–G5 remain closed. Plan: BUILD_PLAN.md:1861 (SV-5), :2177 (MON-3), :2498 (DEMO-S).

## 1. Present authority and consumers

The gap remains for **every ordinary company job through these web paths**, not just the trial. `apps/web/app/api/jobs/[id]/final-account/route.ts:4`, `final-account/lock/route.ts:7–26`, `final-check/route.ts:8–9` and `final-check/runs/route.ts:9–10` require `jg_session`. Their application uses PracticeAccess (`apps/api/src/final-account.application.ts:4`, `final-account-lock.application.ts:15–32`, `final-check.application.ts:10`). The trial uses `jobguard_session`, selected company, CSRF and origin (`apps/web/app/lib/identity-server.ts:16`, `trial-server.ts:8–18`).

Below, SQL filenames are in `packages/db/migrations/`. The unchanged `0238_final_check.sql:105–127` guard requires jobguard_runtime, an authenticated practice session, current owner membership, accepted synthetic terms, and a synthetic small-builder job owned by that digest or its attested imported lineage. A company credential cannot satisfy it. Conversely, **SQL locking itself is not practice-only**: `0237_final_check_prerequisites.sql:577–600` uses the tenant/current-owner check in `0132_final_account_lock.sql:126–129`. Tenant-scoped runtime repositories read draft/lock projections (`packages/db/src/final-account-repository.ts:5`, `final-account-lock-repository.ts:57–76`); that does not expose a company web workflow.

**All current direct guard consumers** (superseded definitions omitted):

| Consumer | File:line |
|---|---|
| Reveal; disposition; disputes | `0262_final_check_reveal_lines.sql:8`; `0238_final_check.sql:378,422` |
| Confirm catch; request run | `0281_final_check_catch.sql:13`; `0283_final_check_practice_run.sql:13` |
| Assess attribution | `0383_recovery_attribution_review.sql:19,38,40` |
| Value read; payment-fee actor | `0510_read_value_job_combined_final.sql:25`; `0359_payment_fee_statements.sql:96,106` |
| Success-fee write | `0583_success_fee_production_safety.sql:205` |
| Statement; collection read/write | `0514_withheld_payment_statement_source.sql:219`; `0509_simulation_fee_collection.sql:42`; `0544_payment_fee_standing_authority.sql:208` |
| Money simulation; demo settlement | `0514_withheld_payment_statement_source.sql:411`; `0537_fee_invalid_proof_reduction.sql:383` |
| Demo hold/request, hold/read, customer link, review inputs; billability review | `0518_shadow_demo_guide.sql:16,35,52,94`; `0565_recovery_billability_integration.sql:97` |

**Protected result-row consumers** (including paths that do not call the guard): the five tables created in `0238_final_check.sql:21–76` are processing_source, source_attempt, run_binding, reveal_proof and disposition_binding, each prefixed `final_check_`. Their complete current SQL routine inventory is:

- Manifest read, disposition, disputes and manifest guard: `0238_final_check.sql:140,374,420,496`; reveal: `0262_final_check_reveal_lines.sql:5`; catch: `0281_final_check_catch.sql:9`.
- Source-current check, inventory freeze, fact guard, source result and completion: `0295_final_check_practice_readers.sql:9,21,51,80,117`.
- Evidence-pack material: `0375_evidence_pack_v3_activation.sql:37`; attribution sources and combined-invoice gate: `0413_j3_combined_invoice.sql:332,5`; value: `0510_read_value_job_combined_final.sql:3`; published integrity and review: `0526_commercial_integrity_sources.sql:76,314`.

Adapters: `packages/db/src/final-check-repository.ts:30–38`; worker shadow result writes: `packages/db/src/shadow-detection-repository.ts:117–142`. Separate legacy reveal, disclosure and break-glass access retain their own checks/grants (`0128_shadow_persistence.sql:238,272,287–290`; latest legacy reveal: `0201_job_work_state_commands.sql:374`). These feed attribution assessments (`0383_recovery_attribution_review.sql:3`), fee inputs (`0583_success_fee_production_safety.sql:13`), fee reads (`0406_success_fee_catch_posting.sql:2`), postings, statements and collection above. Widening the guard reaches that chain. Worker-only manifest/run/certificate authority remains jobguard_shadow (`0238_final_check.sql:95–103,436–439`; verifier/certificate/invoice gates: `0237_final_check_prerequisites.sql:213,244,272`). Runtime has only checked reveal/disposition/dispute execution, not raw result tables (`0238_final_check.sql:78–85,440–442`). Lock consumers also include trial ending and meter lifecycle (`0373_free_first_job_eligibility.sql:154`, `0239_meter_lifecycle_source.sql:177`), work state (`0523_ch4_company_workspace_read.sql:3`), invoice issue (`0522_lp5b_writers.sql:1322`), late import (`0541_late_source_import.sql:368`) and disclosure terms (`0531_final_lock_disclosure_terms.sql:3`). Practice auto-queueing explicitly excludes company jobs (`0381_final_check_lock_request.sql:6–12`).

## 2. Recommendation and rejected alternative

Add separate **company-only** checked assemble/read, terms/disposition-of-scope, lock, request-run and reveal entry points. Leave final_check_builder's body **and every existing caller unchanged**. jobguard_runtime may execute only these named entry points; jobguard_migration owns the narrow SQL routines. No new table SELECT, role membership, practice impersonation or shadow grants. jobguard_binding_owner continues to own only binding/accessors, never business writes. jobguard_shadow alone processes the existing identifier-only queue; jobguard_infrastructure only dispatches it. Keep the existing synthetic database, track, terms, immutable lock and completed-run gates. Reveal returns the same fixed unlocked response before touching any hidden rows. No company catch confirmation, attribution, fee or collection authority is included.

Use the company's identity.session through LP-6b's session-bearing withTenant context: bind_request('real', verified HMAC digest, selected tenant) first in the transaction; derive actor/tenant from protected accessors, then recheck current owner permission and company-job ownership, including after waits and before replay. Reject practice-owned jobs **and their imported descendants**; a null digest alone is insufficient. Never trust a supplied actor, tenant setting or credential-kind flag. See `lp-command-binding-design-v1.md:395–438`; the dark foundation is actually `0562_lp6a_request_binding.sql`, despite the design note's older numbering.

**Wait for LP-6b to land and pass its exact-head review/CI before implementing company authority.** Cached `origin/codex/sandbox/lp-6b-withtenant`, `packages/db/src/tenant-context.ts:100–106`, contains binding/accessor checks; it is not merge evidence. PR #548 could not be read: `gh pr view 548` failed connecting to api.github.com. Reconcile its actual head before building. Reject extending final_check_builder to accept either session: it would silently expand attribution, fees and collection too.

## 3. Prepared trial sources

`packages/db/test/free-first-job-lifecycle-fixtures.ts:20–36` creates a £1,000 net accepted revision without quote lines; assembly recomputes zero and refuses FINAL_ACCOUNT_TOTAL_MISMATCH (`packages/db/src/final-account-repository.ts:12–21`). Preparation needs confirmed scope_identity/scope_revision, quote_draft and included quote_line parents totalling exactly 100000 pence, matching immutable document/acceptance/send parents, and the normal trial activation freezing that document. Reuse the existing fixture construction in `packages/db/test/final-account-baseline-net.integration.test.ts:47–85`; do not patch an already accepted revision.

Assembly currently requires proof for its first confirmed scope (`packages/db/src/final-account-repository.ts:24`; `practice-scope.ts:4–12`). Proof needs verified upload → original object with version/hash → evidence_link → stage_completion for each required electrical_certificate scope, with no invalidation. Reuse the existing fixture/command route in `packages/db/test/watchdog-command-harness.ts:79–86,200` and `proof-application-records.integration.test.ts:25–28`; adapt prerequisites to the prepared company's IDs. Never seed final-account, lock, run, attribution or fee results. These are test-fixture routes, not existing company HTTP proof routes. The web setup currently prepares only accepted company jobs (`apps/web/e2e/DEMO-J5-trial.spec.mts:28–36`); it does not yet compose these parents.

“Prepared jobs for now” still covers fictional prerequisite preparation, not a grant of company Final Check authority or a company capture build. Preserve that scope; leave trial rules, prices, legal copy, pro-ration and periods untouched. The existing trial/illustration test explicitly says it is not company-route proof (`packages/db/test/free-first-job-final-check.integration.test.ts:16–19`). Company illustration authority remains separate unfinished work.

## 4. Proof required and later slices

Attack forged/expired/revoked/stale sessions, forged actor/kind/settings, another tenant/job, removed/expired member (including after lock waits), practice→company and company→practice/imported-lineage access. Compare pre-lock responses/errors/counts/cache/timing with and without shadow rows. Prove exact lock replay, changed payload conflict, stale/out-of-order and concurrent locks, upload races, run-before-lock refusal, incomplete manifest refusal, post-lock evidence exclusion and persisted reload results. Snapshot all attribution, fee, statement and collection rows/grants before/after: trial operations must leave them unchanged.

Proposed slices, each separately scoped and reviewed; **none authorised by this document**:

1. After LP-6b: new `packages/db/migrations/<reserved>_company_final_check.sql`, `packages/db/src/company-final-check-repository.ts`, `packages/db/test/company-final-check-authority.integration.test.ts`, `packages/db/test/company-final-check-upgrade.integration.test.ts`. Add only company entry points and their narrow execution grants. **RED + second security check** for authority, hidden data and unchanged consumers. No scanner edits; no number claimed.
2. New `apps/api/src/company-final-check.application.ts`, `.test.ts`, `apps/web/app/api/company-jobs/[id]/final-check/route.ts`, `route.test.ts`; company repository above. Expose only assembly/read, scope dispositions/terms, lock/request/reveal actions with versioned inputs and identity credentials. Existing practice routes stay unchanged. **RED + second security check** for credential and job-kind separation.
3. `packages/db/test/free-first-job-lifecycle-fixtures.ts`, `apps/web/e2e/DEMO-J5-trial.spec.mts`, `apps/web/app/demo-s/trial/journey.tsx`, `report-type.ts`, `journey.test.tsx`. Compose existing prerequisites, call company actions, persist lock/run links in report. RED review; second security check if authority changes. Re-run both demos in CI; fee illustration remains unbuilt pending its own design.

LATER / SIMPLICITY: `apps/api/src/final-account.application.ts:4`: derive the company actor once from binding in its own adapter; avoid copying the hard-coded demo actor.

Validation: source inspection and deterministic document/lane checks only; no database, browser, behavioural suites, live services or independent review executed. Router/checker must accept or revise this proposal before commissioning slices; DEMO-S stays open.
