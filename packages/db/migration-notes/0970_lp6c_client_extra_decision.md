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
