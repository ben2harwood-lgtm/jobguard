# LP-6D-CUSTOMER-PROOF — RED, NOPR

READY for router commit and held branch save. Base:
`codex/sandbox/lp-6d-remaining-routines` at
`cdd4e32820a05800dee82ca93b5717eeebc77d00`.
This is built source with local unit evidence, not PostgreSQL execution,
independent review, merge or release approval.

Contract: `docs/contracts/lp-customer-binding-v1.md`. Migration 1000 expands the
existing binding kind constraint without adding columns or rewriting business
history. Its private customer resolver reuses the existing portal credential,
revocation, job and current-party locks. The customer-message writer is the sole
caller of its private binder. Member accessors reject customer bindings; existing
member binding refuses replacement by a customer, and vice versa.

The old member-only receipt/source formats cannot honestly hold a customer actor.
The smallest compatible storage is one new immutable RLS-protected customer
message receipt/source table, with customer/session attribution, a separately
named sponsor, exact bytes and verified immutable evidence version. It uses the
existing tenant-wide watchdog command identity namespace, locks and receipt
format, without entering the member command boundary. The existing fictional
member-message path remains. The old customer-digest/sponsor helper route is
withdrawn. Builder reads, observation/final-check readers and ordinary evidence
packs include the new source. The API accepts the customer attribution and checks
it against the signed-in customer. Customer responses carry no sponsor.

No existing columns, row fingerprints, scanner definitions or source pins change.
No provider, live data, money or public release is involved. No new command type
or route is introduced: the existing customer message route and
JobSource.customer_message classification remain. No new alert is required.
Forward-fix only: retain customer/member separation and correct the caller; do
not restore sponsor impersonation or enable argument-only identity.

## Security pre-check repair round 1 — READY

Applied the sole blocking finding in
`~/.local/share/full-steam/coordinator/prechecks/lp-6d-customer-proof.md`:
rebuilt `app.evidence_pack_v3_ordinary` from 0375's latest body, restoring its
exact `jobguard_catch` filter and retaining only the customer-message union.
Read-only inspection of `origin/main` at `46f0be7ea` confirms 0375 is its latest
definition; its file is byte-identical here. The local `main` ref is older.
The full function diff against that latest definition contains only the union.
The new regression assertion compares the entire body after removing exactly
one customer union with 0375, so omitting the catch filter fails independently
of the upgrade test's migration-derived expectation. Existing refusals remain.

Repair checks actually run, using installed binaries without package downloads:

- From `packages/db`, `./node_modules/.bin/vitest run --maxWorkers=1
  test/lp6d-customer-binding.test.ts test/migration-proof-loader.test.ts
  test/lp6d-routines.test.ts`: **91 passed**, three files, Vitest 4.1.12.
- From `packages/db`, `./node_modules/.bin/tsc -p tsconfig.json --noEmit`:
  passed for typecheck and passed again for lint (both package scripts use it).
- `node tools/plpgsql-case-in-if-lint.mjs`,
  `node tools/money-arithmetic-lint.mjs`,
  `node tools/commercial-boundary-lint.mjs`, and `git diff --check`: passed.
- Read-only comparison against `cdd4e3282` confirms all 14 non-lane paths
  exactly match the existing lane; the lane does not list itself.

The initial `pnpm --filter` unit/type/lint invocations stalled without executing
the checks and were interrupted; the installed package binaries above supplied
the actual results. No PostgreSQL or browser was started, no Git-writing command
was run, no earlier migration or grant changed, and no proof rows were rewritten.
No new complexity or separate simplification finding is introduced by this repair.

CI must still prove fresh/populated upgrade SQL execution, catalogue/ACL/RLS and
owner posture, customer-message replay/refusal/expiry/revocation/isolation,
ordinary evidence-pack exclusion of uncited catches and inclusion of customer
sources, all mandatory DB suites, the customer browser journey and normal full
checks. Exact-head independent RED review and serial LP-chain catch-up and
renumbering remain router gates; they were not performed here.

## Actual local checks

Installed dependencies only, at most two concurrent processes, one Vitest worker,
at most three named files per run. Built existing core/storage/config/AI dependency
outputs locally to supply the installed package exports; no package downloads.
An initial DB unit run could not resolve the absent core build; it ran no tests.
After building the dependency outputs:

- DB: `test/lp6d-customer-binding.test.ts`, `test/migration-proof-loader.test.ts`,
  `test/lp6d-routines.test.ts`: 90 tests passed.
- Core: `src/job-sources.test.ts`, `src/job-source-intake.test.ts`: 17 passed.
- API: `src/auth/customer-message.test.ts`: 11 passed.
- API `src/auth/context-boundary.test.ts`: 145 passed.
- Final DB rerun after receipt checks: customer-binding + proof-loader, 80 passed.
- Integration-test TypeScript transpilation: syntax passed, not DB execution.
- Core and DB TypeScript builds and API `tsc --noEmit`: passed.
- PL/pgSQL CASE-in-IF, money arithmetic, commercial boundary and whitespace
  checks: passed.

Each Vitest command uses its package's installed `.bin/vitest run --root <package>
--maxWorkers=1` with the exact files above. Source/unit tests do not establish SQL
execution. The integration suite adds forged/customer/job/tenant attacks, expiry,
grant/session revocation, concurrent exact replay, changed content, both kind
switch refusals, rollback, post-lock replay, separate sponsor persistence and an
attack on every LP-6d member signature plus the shared member command boundary.
Existing safety-disclosure and hidden-data behavior tests remain.

## Named holds for landing

1. Real PostgreSQL CI must prove migration 1000 on fresh and populated upgrade
   databases, repeat migration handling, catalogue/ACL/owner/RLS proofs, immutable
   source and evidence linkage, the adversarial integration suite, all earlier
   mandatory DB tests, and the applicable customer browser journey. Normal
   typecheck/lint/test/build and exact-head independent RED review remain gates.
2. Catch up with the repaired LP-6b and LP-6c/d chain before opening the sole LP PR.
   Migration 1000 is provisional; router reconfirms its landing number and updates
   its proof/path references together. The entitlement upgrade test names exactly
   the five replaced signatures and verifies their exact new bodies.
3. Source guard FAIL is inherited, not repaired here. In
   `tools/commercial-integrity-current-source-guard.unresolved.json`, the old
   `packages/db/src/practice-session.ts:73` UNRESOLVED_COVERED_EDGE fingerprint is
   `ad3ac47cb73083599ccbd5fd355eb9f2f313b9af4ceca2115da91270658d50ca`.
   Current line 75 / dependency `unknown query text/structure` is
   `a52add41726877212b3d0441a7351647222c7aa760b4e2be0f07d3ea2fd00c04`.
   The diagnostic is `STALE_UNRESOLVED_BASELINE`; ten covered-edge diagnostics
   accompany it (90 protected roots, 11 diagnostics). Exact old/new values go to
   Ben through the router. Neither scanner nor pin was edited. Output:
   `/tmp/lp6d-customer-source-guard.log`.
4. Additional API `src/watchdog-registry.test.ts`: **108 passed, 18 failed**.
   Its first import attempt lacked built `@jobguard/ai`; after building that
   dependency the real failures are round-12 stranger-session mocks: expected
   404 / NOT_FOUND, received 401 / UNAUTHENTICATED at line 863. The test,
   `apps/api/src/practice-access.ts`, proof application and
   `packages/db/src/practice-session.ts` have zero diff from the supplied base.
   These failures are in the unchanged practice-auth path; a separate baseline
   execution was not performed. Router must reconcile with LP-6b repair and CI.
   No test or refusal was weakened and no out-of-scope repair was attempted.
5. The actual Git lane guard must run after router commits: the supplied base and
   HEAD are the same commit, so its self-comparison refusal is correct. Working
   content paths, including untracked additions, must exactly equal this lane's
   allow list, excluding `config/lanes/`. No Git-writing command was run here. A read-only working-content comparison
   confirms the lane lists exactly all 14 non-lane changed/additional paths.

LATER / SIMPLICITY (initial source review): the source lookup in
`packages/db/src/job-source-observation-reader.ts` and
`packages/db/src/shadow-detection-repository.ts` could share a checked source
projection once the cutover settles, reducing drift between observation and
final-check byte lookup. Keep this out of the present permission change.
