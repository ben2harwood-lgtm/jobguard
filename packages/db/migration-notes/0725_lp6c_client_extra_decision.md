# LP-6C-CLIENT-EXTRA-DECISION — RED

Ben's typed yes, 9 Nov 2026: “Yes, add extra approvals” (authority supplied in the router brief).

0970 adds a private binding-owner definer for a validated extra-client session. The actor is the client's own membership, with the existing delegated kind scoped to this job and `ClientDecideExtra`, lasting at most one minute. The existing `identity.extra_customer_use` validator retains its live membership/grant, recipient and revocation checks and locks. Fresh link expiry remains checked by the unchanged `xa_client_decide`; authorized terminal replay retains the existing session-based authority and does not renew the link. Binding does not admit any other command. The existing read-only session/link table grants and tenant policies are extended only to the existing binding owner. No new role or person-facing binder grant.

Only the decide branch calls the binder. Queue, view and history remain unbound. The complete predecessor function body is retained apart from that call. `xa_client_decide`/`xa_begin` need no additional exception: their existing checks and the exact-scope command continuation work with the delegated actor. 0686 and 0687 are unchanged. No data backfill, changed row format or external action. No new operational alerts; existing binding/link refusal handling applies. Forward fix: replace 0970's binder or identity body in a later migration; do not rewrite predecessor migrations or remove historical claims.

The hiding member binding was removed from the real identity fixture. Coverage includes approve/reject with replay, claim actor and credential kind, revoked/expired sessions and grants, wrong token/recipient/tenant/job/approver, other-command scope, rebinding, direct grants, read-only branches and binder/type-match mutations. LP0 proof metadata and both upgrade-body guards are updated for the exact changed identities. LP-6D-CUSTOMER-INVENTORY's separate catalogue test is absent from this checkout; a catalogue assertion is included in the customer integration suite for its downstream check.

Local validation: installed core and storage TypeScript builds, database TypeScript check, changed-test syntax/transpile check and `git diff --check` passed. The proof-loader/catalogue run passed 108 tests; the three LP-6c source/fixture files passed 20 tests. The final targeted run (proof loader, catalogue and new client-decision source contract) passed 111 tests. This is 128 distinct local unit tests overall. Initial unit import failures were resolved by building the installed workspace dependencies; no packages downloaded. The pnpm launcher stalled before running tests, so the installed `packages/db/node_modules/.bin/vitest` runner was used directly, with at most two workers and three named files per run.

PostgreSQL and browser suites cannot run in this sandbox and are UNRUN. CI/coordinator must run the full database and migration suites, affected API/web checks, ENT-8a and customer extra journeys at phone/desktop widths, plus independent RED review of the exact final head. This note is not a PostgreSQL proof or independent review. The 0970 catalogue proof is specified from predecessor metadata and must be verified against PostgreSQL.

Lane caveat: this branch starts at LP-6c's existing PASS with inherited changes relative to current origin/main. Its new lane lists exactly this follow-on's paths; a direct aggregate lint against origin/main also sees the inherited LP-6c lane and other parent changes. Router integration must preserve/check the LP-6c parent lane and this follow-on delta; do not widen this lane to unrelated inherited paths.

Commands executed (repository root unless stated):

- `./node_modules/.bin/tsc -p packages/core/tsconfig.json` and the equivalent storage build: PASS.
- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`: PASS.
- In `packages/db`, `./node_modules/.bin/vitest run --maxWorkers=2 test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts test/lp6c-money-routines.test.ts`: initially 6 passed, two suites import-failed before dependency builds.
- In `packages/db`, proof-loader and catalogue files after dependency builds: 108 passed.
- In `packages/db`, `./node_modules/.bin/vitest run --maxWorkers=2 test/lp6c-client-extra-decision.test.ts test/lp6c-money-routines.test.ts test/lp6c-fixture-compatibility.test.ts`: 20 passed.
- In `packages/db`, `./node_modules/.bin/vitest run --maxWorkers=2 test/lp6c-client-extra-decision.test.ts test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts`: 111 passed.
- `node tools/lint.mjs`: core purity PASS; aggregate lane check FAIL (inherited parent delta). `node tools/agent-lane-boundary-lint.mjs` after adding this lane: same inherited-parent failure. Direct `lanePathAllowed` check of all eight working-delta paths: PASS; not a substitute for aggregate CI lint.
- Compared 0686 and 0687 bytes directly with `git show 9f036617:<path>`: identical. No git writes.

## READY — LP-6C landing catch-up, 10 November 2026

Compared every conflicted file with stage 1 (merge base), stage 2 (LP-6c) and stage 3 (main). No git writes were performed; the index intentionally still lists the files as unmerged for the router to stage and commit.

Conflict resolutions:
- `src/interim-draft-repository.ts`: retain exact SQL and wrapped binding refusals, main's JOB_NOT_LIVE handling and expanded typed error codes.
- `test/commands.integration.test.ts`: retain bound-context setup and main's UUID import and single-use commercial-grant cases.
- `test/enterprise-access-upgrade.integration.test.ts`: union binding columns/constraints/ACL expectations with manifest-attempt and nullable-original-scope expectations.
- `test/extra-duplicate-candidates.integration.test.ts`: retain actor bindings and main's STALE_REVISION expectation and new regression cases; bind the actor for main's direct begin-command schema refusal while keeping its migration-role restriction.
- `test/inbox-metrics.integration.test.ts`: retain bound membership context and main's fictional demo-owner fixtures.
- `test/inbox-relevance.integration.test.ts`: retain bound membership context and main's held-merchant/idempotent seeding case.
- `test/j3-landing-allocation.integration.test.ts`: retain queued-worker publication context plus reviewed-inventory import and main's late supplementary-catch cases.
- `test/migfix-5.integration.test.ts`: retain bound lock setup and main's concurrent locked-variation refusal/no-effect assertions.
- `test/migfix-7-upgrade.integration.test.ts`: union catalogue exceptions and body rows; retain overload-aware extraction and latest actual CREATE lookup; pin latest LP invoice/delegated-effect bodies without obsolete duplicate rows.
- `test/plan-entitlement-lifecycle-upgrade.integration.test.ts`: retain LP body/ACL/source expectations and all main cases, including abandoned-visit and receipt helpers and 0699 sync binding. Update invoice/effect body rows to LP successors and pin raw source alongside changed definitions.

Latest-body rebuilds:
- `0723_lp6c_money_binding.sql`: `app.issue_practice_customer_invoice` is 0716's complete signed-VAT body plus only LP-6c actor/tenant guard.
- `0723_lp6c_money_binding.sql`: `app.lp5_bind_effect` is 0722's complete LS-79 body plus LP-6c tenant/claim-actor guards.
- `0724_lp6c_customer_portal_delegation.sql`: `app.lp5_bind_effect` retains that LS-79 body and applies the existing scoped delegated-actor changes on top. Both missing-claim abandoned-reference refusal and the full abandoned-visit effect validation remain.
- Matching proof source entries now identify the latest predecessor migrations. Their catalogue fields remain unchanged because these rebuilds add no new grants, writes or static calls beyond the existing LP changes; existing null definition digests remain null. Full bodies are pinned by MIGFIX-7 and plan-entitlement, with source regression tests proving predecessor preservation and proof continuity.

Checks actually run:
- Installed `tsc -p packages/db/tsconfig.json --noEmit`: PASS, including final edits.
- Installed db Vitest, `--maxWorkers=1`, exactly `test/lp6c-money-routines.test.ts test/lp6c-fixture-compatibility.test.ts test/lp6c-client-extra-decision.test.ts`: PASS, 3 files / 21 tests.
- `node tools/agent-lane-boundary-lint.mjs`: FAILED because this in-progress merge includes main and earlier LP-6c paths outside the follow-on lane; no lane permissions were widened. Router must handle integration ownership and renumbering.
- `git diff --check`: PASS; no conflict markers remain in the ten files.
- pnpm's automatic pinned-version switch could not reach/verify registry packages; used installed binaries, with no dependency changes.

PostgreSQL was not run. Browser suites were not run. Database behaviour, complete suites, green CI and independent RED review remain for the router/CI. Migration numbers 0686/0687/0970 are unchanged; router renumbers to 0723/0724/0725 before final landing. READY means source resolution is ready for the router's merge commit, not an independent acceptance or CI pass.
