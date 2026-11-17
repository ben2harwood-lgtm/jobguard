# MON-7a builder receipt — round 2 (repair of PR #121)

Branch/lane: `codex/sandbox/mon-7a` / `mon-7a`. Base: `0264158ffa8fbe61f7c896be9a9c5aa210f07af0`
(merged CH-3a #98, M2-6-S #89). Round-1 head: `347e452842ae259003b1c53306af498e74e56c5b`.
Round-2 head: the single commit on top of 347e452 whose subject is
`fix(prevention): separate command-id parameter, fail closed on stale customer versions`
(a file cannot contain its own commit SHA; the exact SHA is in the builder handback and
`git log`). This receipt moved to `docs/verdicts/MON-7a/` (review finding P3-1); the
round-1 copy at `docs/verdicts/MON-7/BUILDER_RECEIPT.md` is left in place, unedited and
superseded by this file.

Responds to the independent Claude Opus 5.5 verdict REPAIR bound to 347e452
(issue comment 6048458388). The builder does not review or accept this leaf: a fresh
independent review of the new head and separate technical acceptance are still required.

**B4 is MON-7b and remains PARKED until payment stages exist. No exposure figure, curve
or schedule was built or defined in this round. MON-7 is not fully accepted while B4 is
parked.** No live provider, paid check or outbound call exists or was made. Synthetic data only.

## Round-2 changes, one per finding

**P1-1 (every command crashed with PostgreSQL 42P08).** The receipt claim used `$1` both as
the uuid `command_id` and as `$1::text` for `semantic_key`. It now passes the command ID a
second time as its own parameter (`$5`), exactly as CH-3a does in
`packages/db/src/job-parties-repository.ts:84-85`
(`packages/db/src/prevention-check-repository.ts`, receipt claim).

**P1-2 (upgrade-migration test could not connect, 28P01).** `{...admin.options}` loses the
password because pg-pool keeps it non-enumerable. The upgrade test now builds its pool with
explicit host, port, user, password and database, as `beforeAll` does
(`packages/db/test/prevention-checks.integration.test.ts`; the port is now a module variable).

**P2-1 (eligibility followed the job's pinned customer revision) — integrator decision (b), fail closed.**
- Rule, still named `prevention-company-eligibility-reference.v1`: "the current customer
  revision" means the customer's LATEST revision. A company check or watch is eligible only if
  the job binding's pinned customer revision IS that customer's latest revision AND the latest
  revision is `business` with a valid company number (eight digits, or two capitals and six
  digits). Anything else refuses with `NOT_REGISTERED_COMPANY` and the panel shows
  `not run — not a registered company`, never `clear`. Property facts (B1) and the paying-party
  display (B2) are unaffected: they concern the site and the saved binding.
- Enforced in three places: the pure core predicate `preventionCompanyEligibleAtLatest`
  (unit tested); the repository, for both the view and every non-property command
  (`companyEligible`, which reads the latest revision of the binding's customer); and the 0103
  trigger `app.require_prevention_subject`, which re-reads the latest revision at insert time and
  raises `NOT_REGISTERED_COMPANY` (23514) when the pinned revision is not the latest or the latest
  is not eligible. 0103 is unmerged, so its SQL was edited in place. The migration number stays 0103.
- Existing watch — smallest correct design, **no stop row; the watch is derived inactive.** When the
  customer is not eligible the view skips the company card, the watch state and the feed results
  entirely, so the panel shows an inactive watch with no results and every watch command
  (start, evaluate, stop) is refused. No new write path, no new table, no write on a read path.
  A revision can never become "latest" again once a later one exists (revisions only increase), so
  a watch derived inactive on a binding stays inactive; re-binding the job (a CH-3a correction)
  creates a new binding, which starts with no watch. Earlier company and feed facts stay in the
  append-only tables (never deleted) but are not displayed.
- Consequence to note: CH-3a customers are shared across jobs. Revising the customer record from
  another job makes this job's company check and watch refuse until the job is re-bound to the latest
  revision. That is the fail-closed behaviour the integrator chose.
- Residual race, stated plainly: the runtime role has no row-lock privilege on customer tables, so a
  customer revision committed in the instant between the trigger's read and the transaction commit
  cannot be excluded. The row records the exact customer revision it was checked against (immutable
  lineage), and the read is repeated at insert time inside the same transaction.
- Real-PostgreSQL regression (`fails closed when the customer's latest revision is not eligible ...`):
  business customer with a company check and a running watch; the same customer is re-recorded as
  `person`; a new company check, start, evaluate and stop are all refused with
  `NOT_REGISTERED_COMPANY`; the view shows `not run — not a registered company`, no company card and
  `{enabled:false, revision:0, results:[]}`; no new counterparty row; property facts still run; a direct
  runtime INSERT bound to the stale revision is refused by the trigger with 23514; a later revision that
  would itself be eligible still refuses until the job is re-bound; after a CH-3a correction to the
  latest revision, a check on the new binding works with no inherited watch, and the old binding is a
  `REVISION_CONFLICT`.

**P3-1 (receipt location).** New receipt here, `docs/verdicts/MON-7a/BUILDER_RECEIPT.md`. The
`mon-7a` lane line (one compact JSON line, same sorted position, no other line changed) now has
`"receipt":"docs/verdicts/MON-7a/BUILDER_RECEIPT.md"` and its allow list gains
`docs/verdicts/MON-7a/**`. `docs/verdicts/MON-7/**` stays in the allow list because the round-1
copy remains in the PR. Nothing was deleted.

**P3-2 (sub-millisecond scenario time gave an unexplained 503).** `scenarioNow` is now capped at
millisecond precision in `preventionCommandV1` (`packages/core/src/prevention-checks.ts`, a Zod
transform that returns `new Date(Date.parse(value)).toISOString()`). TypeScript and the 0103
validator therefore evaluate the same instant. Two commands that differ only below one millisecond
are the same command (the request hash is taken after parsing). Unit test: `...0004Z`, `...000999Z`
and no-fraction inputs normalise to `.000Z`; the flood boundary evaluates identically at
`15:00:00.0004Z` (clear, 180 minutes) and one millisecond later is `unknown`. PostgreSQL test: the
same inputs through the repository produce `clear`/`current` and `unknown`/`stale` with no 503.

**P3-3 (panel disabled while a draft saves or previews).** `<PreventionChecks>` moved out of the
quote pricing `<fieldset disabled={!quoteReady||saving||previewing}>` to a sibling immediately after
`</fieldset>` in `apps/web/app/ui/quote-editor.tsx`. "Price the work" is still the first heading
inside the fieldset. No quote behaviour, calculation or state changed (one-line move). No browser
assertion for the enabled state was added because no browser can run here; see P1-3.

**P3-4 (stale title).** `demo-bootstrap.integration.test.ts` title now lists 0103 (still asserts 48).

**P1-3 (browser evidence never ran).** Still true: no Playwright execution happened in this round.
`playwright test --list` discovers all 6 cases (3 tests x `mobile-360`, `desktop`). Nothing was faked.
**What the exact-head CI `checks` job must show**, with both `mobile-360` and `desktop` projects
for `MON-7.spec.ts`:
1. `pnpm test`: `@jobguard/db` `prevention-checks.integration.test.ts` 11 of 11 (including the 0103
   upgrade test, no 28P01), core prevention tests, and the api DW4 architecture test; then `pnpm build`
   and both Playwright steps must run (they were skipped on 347e452).
2. Test "cited property facts persist ...": panel visible; Article 4 and flood show `unknown`; each card
   shows source ID/name and retrieval date; focus ring visible and 44 px targets; reload shows the same
   persisted facts; reopening the job from the Jobs list shows them; a second browser context reusing the
   session cookie sees the same facts; another practice session gets 404 for this job and for a random
   job ID, on both GET and POST; a context with no session gets 401 on both GET and POST; a company command
   on the `person` homeowner job is 400 `NOT_REGISTERED_COMPANY`; forged `customerType`/`isIndividual` is
   400; sandbox banner present; no horizontal overflow.
3. Test "free company and opted-in feeds ...": saving a business customer with company number shows
   `eligible` (the UI re-binds the revised customer, so pinned equals latest); company card `clear`;
   watch off by default then on; feed cards `advisory`; stale and missing scenarios show `unknown`;
   reload keeps the unknown company card; stopping the watch hides feed cards; external actions 0.
4. Test "leaves VALUE-1 and saved fee illustration figures unchanged": value page `£125.00` approved
   extras and fee illustration `£203.00` before and after all five prevention actions; fee-illustration
   API response and `.statement-facts` and value-card text identical; a replayed command returns the
   identical result and a changed payload with the same ID is 409.
5. Round 2 does not change any of these assertions. The only UI change is the panel's DOM position
   (P3-3); a reviewer can confirm by reading the diff that the panel is no longer inside the fieldset.

## Round-2 evidence

Environment: macOS, Node v24.17.0, pnpm 10.28.1 (default launcher, prints a harmless
`pnpm.overrides` warning), Vitest 4.1.11, embedded PostgreSQL 16.10. `pnpm install` was NOT run
(no downloads). Embedded PostgreSQL first failed to start (`initdb`: `Library not loaded:
@loader_path/../lib/libicudata.68.dylib`), because the package's dylib symlinks had not been
created. The package's own postinstall script was run once, from its own directory inside this
worktree's `node_modules` (`node scripts/hydrate-symlinks.js`, exit 0): it only creates relative
symlinks in a git-ignored folder, changes no tracked file and is not `pnpm install`. After that
PostgreSQL started. Logs are in the session scratchpad and are not committed.

| Command | Exit | Observed |
|---|---:|---|
| `pnpm --filter @jobguard/core exec vitest run src/prevention-checks.test.ts` | 0 | 29 passed (27 before; +2 new) |
| `pnpm --filter @jobguard/core test` | 0 | 108 files, 2918 passed |
| `pnpm --filter @jobguard/api test` (runs `vitest run src && openapi:check`) | 0 | 21 files, 382 passed; OpenAPI check passed with no change to `openapi.json` |
| `pnpm --filter @jobguard/web test` | 0 | 13 files, 115 passed |
| `pnpm --filter @jobguard/db exec vitest run src` | 0 | 2 files, 8 passed |
| `pnpm typecheck` | 0 | 7 of 7 packages |
| `pnpm build` | 0 | 7 of 7 packages, including the production Next build |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/prevention-checks.integration.test.ts` | 0 | **11 of 11 passed on real PostgreSQL 16** (9 round-1 cases incl. the upgrade test, plus the P2-1 and P3-2 regressions) |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/tenancy.integration.test.ts test/demo-bootstrap.integration.test.ts test/UIWIRE-12.integration.test.ts test/job-parties.integration.test.ts` | 0 | 4 files, 121 passed (migration counts and CH-3a unchanged) |
| `pnpm --filter @jobguard/web exec playwright test --list --project=mobile-360 --project=desktop MON-7.spec.ts` | 0 | 6 tests listed; discovery only, not execution |
| `node tools/core-purity-lint.mjs`; `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | 0; 0; 0 | all pass |

Failed-first evidence (temporary reversions of the fixed files, each restored byte for byte, verified by SHA-256):
- Round-1 repository and migration with the corrected test file: 10 of 11 failed (the command cases with
  PostgreSQL `42P08`); the upgrade test passes only because the test itself now connects with explicit details.
- Receipt-claim fix kept, but eligibility reverted to the pinned revision: the new P2-1 regression failed
  (`promise resolved ... instead of rejecting`); 10 passed.
- New repository with the round-1 migration trigger: the direct-SQL stale-revision write was not refused by the
  database (`expected error ... duplicate key ... to match object { code: '23514' }`); 1 failed, 10 passed.
- Core with the millisecond cap reverted: the new scenarioNow unit test failed
  (`expected '2026-10-07T15:00:00.0004Z' to be '2026-10-07T15:00:00.000Z'`); 28 passed.

Not run in this round, and why: `pnpm test` as one command, `pnpm lint` as one command and `pnpm test:db`
(only the suites above, which are the ones this change can affect); the Playwright execution (no browser
run was attempted, to avoid binding shared local ports); a full clean install. The lane guard needs PR
metadata and a commit: it was run with the simulated event after committing, and its exit code is in the
builder handback (and CI re-runs it).

Remaining gates, unchanged: B4 / MON-7b (parked), G1, live M2-6, D04 and D12 v3 per live source, D14 for any
paid check, exact-head CI green including both browser projects, fresh independent Claude review of the new
head, separate technical acceptance. CH-9 and MON-1 must keep the DW4 severance test passing.

### Round-2 changed-file SHA-256 manifest

Files changed relative to 347e452, excluding this receipt (a file cannot hash itself).

| File | SHA-256 |
|---|---|
| `apps/web/app/ui/quote-editor.tsx` | `44cf5b33bcc3cbab8016e8b8a859c1d663430d402cd05851822d84301607c845` |
| `config/agent-lane-assignments.json` | `09e345ca019097b325bdafa18b09217762599c71ebf6ad9336748389a0f0ad0b` |
| `docs/contracts/prevention-checks-v1.md` | `b147f0c5ab618801ec800f63dbebc186e8e0e9d59aa2fa9cc90133b0d5e3d5b3` |
| `packages/core/src/prevention-checks.test.ts` | `0171722d01a090ea8b69f74901c46de8c37b5af6148fe0f80973d3d7fb678c1f` |
| `packages/core/src/prevention-checks.ts` | `fe47ca83f19c4c90bc58eeec96b52b7cb31c267b04770c2eda891a8f6445f7e7` |
| `packages/db/MIGRATIONS.md` | `0c41f73b4b11367ca3507696a5d80a489bfd161f468973b120e0991108414289` |
| `packages/db/migrations/0103_prevention_checks.sql` | `ea2b4a2a2cd11bc6798a2f2310d3b231bd11a196031b514e84e9c2ce2b1ab5ea` |
| `packages/db/src/prevention-check-repository.ts` | `ac873613ffad030c312bb33d6fb6328bd78a0de9ee158d42aee3ab4de1b5e781` |
| `packages/db/test/demo-bootstrap.integration.test.ts` | `a99c75e06c2a4578f171ea3158a05617ff3efe40bc2de4da2467d18fd3ce92a8` |
| `packages/db/test/prevention-checks.integration.test.ts` | `2d951bf8e61afa258bb91c085929c1ed5a1ed15c2c328adb33e5a21f87614977` |

---

Everything below is the round-1 receipt, carried over unchanged for the record. Where it
conflicts with round 2 (the Q7 eligibility reading, "awaits CI" statements, the implementation-HEAD
paragraph, the round-1 SHA-256 manifest, the old receipt path), round 2 above governs.

# Round 1 record (superseded where it conflicts with round 2)

Branch/lane: `codex/sandbox/mon-7a` / `mon-7a`.
Base and starting HEAD: `0264158ffa8fbe61f7c896be9a9c5aa210f07af0` (merged CH-3a #98; M2-6-S #89 is present).
Implementation HEAD: **not yet assigned**. The implementation is an uncommitted
working-tree diff. The dispatcher commits and supplies the exact implementation
SHA; the starting HEAD is not a claim that this implementation was committed or
reviewed. No git write, push, merge or PR operation was performed.

**B4 is MON-7b and PARKED until payment stages exist. No exposure figure, curve
or schedule is built or defined. MON-7 is not fully accepted while B4 is parked.**
This receipt covers only issued MON-7a: B1, B2, B3, B5 and B6 and their DW1–DW4.
The draft's Sol PASS was a work-order check, not review of this implementation.
No independent Claude verdict or separate technical acceptance exists for this diff.

### Delivered behavior and decisions

- B1: five persisted property checks on the current CH-3a site revision, available
  in the quote editor and the existing non-capture workspace. Homeowners remain
  eligible for property facts. The card shows its exact source and retrieval date.
- B2: the job's own saved paying-party binding, with server retrieval time and
  separately labelled binding recorded time/revision. Missing binding shows
  `unknown`. No named individual is searched.
- B3: a cited free generated company card. The binding's customer revision is
  authoritative; no client eligibility/type/individual/company-number claim is
  accepted. Unknown boundary fields are rejected by the strict schema.
- B5: explicit start/stop/evaluate commands, no default watch or scheduler. Only
  Companies House (synthetic) and The Gazette (synthetic) fixtures are evaluated
  on demand at the supplied scenario server time. Results are advisory cards;
  no Decision, notification, outbox action, fee or outbound call is created.
- B6: generated dated fictional records, with mixed, fresh, stale and missing
  variants. No live route, real company/address lookup or paid check is built.
  The live factory refuses every initialization, with no fallback.

`prevention-company-eligibility-reference.v1` (Q7): exactly `business` AND a valid
CH-3a company number (eight digits, or two capitals and six digits). Every other
customer type or missing/invalid number yields `not run — not a registered company`,
never `clear`. `person` is always ineligible for a company check or watch. This is
reference-only; production eligibility remains D12 v3 / Ben's decision.

Fixture identity: `generated-prevention-registers.2026-10-07.v1`.
Retrieval: `2026-10-07T12:00:00.000Z`; stale observation:
`2026-09-01T00:00:00.000Z`; missing information keeps the dated retrieval attempt
but has null fact/observation. Mixed: Article 4 missing, flood stale, listed-building
constraint, company active, a fictional Gazette notice. UI scenario evaluation:
`2026-10-07T13:00:00.000Z`. Results remain labelled snapshots at their evaluation
scenario time; GET does not re-run a check. Dates are not fabricated at read time.

Q2: `prevention-staleness-reference.v1`, explicitly reference-only, with observation
age inclusive at the maximum and fail-closed missing/future data. Each synthetic
maximum is recorded below; none selects a production source threshold.

| Source | Maximum age (minutes) |
|---|---:|
| synthetic-listed-building.v1 | 1440 |
| synthetic-conservation-area.v1 | 1440 |
| synthetic-article-4.v1 | 1440 |
| synthetic-planning-history.v1 | 1440 |
| synthetic-flood.v1 | 180 |
| synthetic-companies-house-card.v1 | 1440 |
| synthetic-companies-house-feed.v1 | 180 |
| synthetic-gazette-feed.v1 | 180 |

### Done-when evidence

| Assertion | Implemented coverage | Observed result / limit |
|---|---|---|
| DW1 source and retrieval date | Strict core result/schema; matching PostgreSQL citation constraints; property/company/feed UI cards; separate paying-party provenance | Core tests pass. PostgreSQL and browser assertions await CI. |
| DW2 stale/missing = unknown | Pure versioned staleness policy, all eight result kinds, forged-clear rejection, future-date handling; API fixture tests; PostgreSQL invalid-state inserts; browser stale/missing variants | Core/API deterministic tests pass. PostgreSQL/browser behavior is not locally verified. |
| DW3 subject restrictions | Business+number guard; current binding derived server-side; PracticeAccess on every endpoint; repository membership/session check; wrong-job/individual SQL guards; all seven types tested; forged type/flag rejected | Core/API checks pass. Actual PostgreSQL and two-session browser denial assertions await CI. |
| DW4 complete severance | Architecture scan of fee, charging, ledger, journal, recovery, meter, plan, entitlement and value modules; DB byte-identical financial/value-input/Decision/outbox snapshots; browser unchanged £125 VALUE-1 extra and £203 fee-illustration figures after all actions | Architecture test passes. DB/browser assertions await CI. No protected money/value module changed. CH-9 and MON-1 must retain this architecture test and re-prove their future receipts/meters. |

C1–C2: shared `createWorkspaceApplication.preventionChecks`, thin Next adapters,
Nest controller and generated OpenAPI. Same persisted source results survive
reload, Jobs reopening and a returning browser in the authored browser assertions.
C3: synthetic gate; fixture-only adapter; live refusal; zero fixture fetch calls
verified by a deterministic spy (not a live-provider test).
C4–C5: two tenant-owned append-only tables; command receipt uniqueness; expected
binding/watch revisions; concurrent replay/one-effect conflict tests; atomic audit
rollback test. No new SECURITY DEFINER helper or elevated runtime table grants.
Runtime cannot directly row-lock job or membership tables (no UPDATE grants),
so prevention commands use a tenant/job transaction advisory lock and reuse
CH-3a's narrow `require_current_job_parties` share-lock routine. All business and
receipt writes precede the final audit-head lock. Replays recheck current access
and return the exact persisted command result.
The quote-panel mount follows the existing Price the work heading so the
existing workspace keyboard-focus target remains first.
C6–C7: nine PostgreSQL integration cases and three browser journeys in both
viewports; source assertions, unknown states, focus, 44px targets, banner and
horizontal-overflow checks. Test discovery succeeds; execution is held by sandbox.
C8: receipt and path manifest supplied. Independent exact-commit review and
separate acceptance are still required. The builder does not self-accept.

### Commands actually observed

Node: `v24.17.0`; local cached pnpm: `10.28.1`; Vitest: `4.1.11`.
Dependencies were already installed. `pnpm install --frozen-lockfile` was NOT run,
following the dispatcher's explicit no-download/preinstalled-dependencies note;
this is not a clean-install verification.

For pnpm commands below, the actual command prefix was
`PATH=/private/tmp/jg-pnpm-mon7a:$PATH`. This temporary launcher executes
`node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`.
The default pnpm launcher warned that the package's pnpm.overrides were ignored
and hung before the first core/API tests; both attempts were interrupted (130).
The cached pinned launcher needs no download and leaves package/lockfiles intact.

| Exact command (prefix above unless stated) | Exit | Evidence |
|---|---:|---|
| `pnpm --filter @jobguard/core exec vitest run src/prevention-checks.test.ts` — failed first | 1 | `Cannot find module './prevention-checks.js'`; implementation absent, 0 tests collected. |
| `pnpm --filter @jobguard/api exec vitest run src/prevention-check.application.test.ts` — failed first | 1 | Unbuilt `@jobguard/db` entry prevented collection; this is not a behavioral failure proof. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/prevention-checks.integration.test.ts` — failed first | 1 | Unbuilt `@jobguard/core` entry prevented collection; no PostgreSQL assertion executed. |
| `pnpm --filter @jobguard/core build` | 0 | Compiled core exports. |
| `pnpm --filter @jobguard/db typecheck` | 0 | Compiled repository types. |
| `pnpm --filter @jobguard/db build` | 0 | Compiled DB exports. |
| `pnpm --filter @jobguard/storage build`; `pnpm --filter @jobguard/config build`; `pnpm --filter @jobguard/ai build` | 0 each | Materialized existing workspace dependency dist outputs; no source changes. |
| `pnpm --filter @jobguard/core exec vitest run src/prevention-checks.test.ts` — final | 0 | 27 tests pass (`/private/tmp/mon7a-core-final-exact.log`). Earlier passing run: 26 before additional policy predicate case. |
| `pnpm --filter @jobguard/api exec vitest run src/prevention-check.application.test.ts` — final | 0 | 5 tests pass (`/private/tmp/mon7a-api-final-exact.log`). |
| `pnpm typecheck` — three runs | 0 each | 7 packages successful, final `/private/tmp/mon7a-typecheck-last.log`. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passes; lane guard refuses a self-comparison because HEAD equals origin/main. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same `Missing branch or self-comparison range; refusing a misleading pass.` |
| `pnpm turbo run lint` — twice | 0 each | All 7 package checks pass; final `/private/tmp/mon7a-package-lint-final.log`. This does not replace the root lane guard. |
| `node tools/core-purity-lint.mjs` (no pnpm prefix) | 0 | Core purity passes, 109 TypeScript files. |
| `node tools/money-arithmetic-lint.mjs` (no pnpm prefix) | 0 | Money arithmetic boundary check passes. |
| `node tools/commercial-boundary-lint.mjs` (no pnpm prefix) | 0 | Commercial boundary check passes. |
| `pnpm test` | 1 | Tool tests pass; unchanged receipt-allocation tests time out (4 failures across src/dist, 2910 pass). Turbo stops before full downstream suites. `/private/tmp/mon7a-test.log`. |
| `VITEST_MAX_WORKERS=1 pnpm test` | 1 | Same four receipt-allocation timeouts; 2910 pass. `/private/tmp/mon7a-test-serial.log`. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src/prevention-checks.test.ts src/receipt-allocation.test.ts` | 1 | 60 pass; one unchanged 2000-line receipt-allocation test exceeds 5000ms. `/private/tmp/mon7a-core-final.log`. No money implementation or test timeout weakened. No baseline checkout/run performed, so pre-existing failure is not claimed as independently established. |
| `pnpm build` — three runs | 0 each | All 7 packages; production Next build includes both new routes. Final `/private/tmp/mon7a-build-last.log`. |
| `pnpm --filter @jobguard/api openapi:generate` | 1 | tsx CLI IPC `listen EPERM` for its temporary `.pipe`. |
| `node --import tsx apps/api/src/generate-openapi.ts` from root | 1 | Root cannot resolve the API-local tsx package. |
| `node --import tsx src/generate-openapi.ts` from `apps/api` (no pnpm prefix) | 0 | Actual generator executed without CLI IPC; openapi.json regenerated. |
| `pnpm openapi:check` from `apps/api` | 1 | Same tsx CLI IPC `listen EPERM`. |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` (no pnpm prefix) — twice | 0 each | Same real generator verifies committed JSON, no substituted contract check. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/prevention-checks.integration.test.ts` — with built dependencies | 1 | `Postgres init script exited with code null. Please check the logs for extra info. The data directory might already exist.` Final run: 9 skipped, 0 DB assertions; `/private/tmp/mon7a-db-final.log`. |
| `pnpm test:db` | 1 | Embedded PostgreSQL unavailable; 41 suites failed, 5 passed, 30 tests passed/302 skipped/3 failed, 2 errors. Two free-port cases time out at 5000ms; restore-rehearsal and its errors report `listen EPERM: operation not permitted 127.0.0.1`. `/private/tmp/mon7a-testdb.log`; no claim of a DB guarantee passing. |
| `pnpm test:migrations` | 1 | Both integration suites fail PostgreSQL initialization; 1 deterministic test passes, 12 skip. `/private/tmp/mon7a-migrations.log`. |
| `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop MON-7.spec.ts` | 1 | Web server `listen EPERM: operation not permitted 0.0.0.0:3000`; journeys never execute. `/private/tmp/mon7a-e2e.log`. |
| `pnpm --filter @jobguard/web exec playwright test --list --project=mobile-360 --project=desktop MON-7.spec.ts` | 0 | Discovers all six cases; not execution evidence. |
| `pnpm --filter @jobguard/db exec vitest list test/prevention-checks.integration.test.ts` | 0 | Discovers all nine cases; not execution evidence. |
| `pnpm --filter @jobguard/web typecheck` | 0 | Includes the final browser spec. |
| `git diff --check` (no pnpm prefix) | 0 | No whitespace errors. |

A separate read-only working-tree path check used the existing `selectLane` and
`matches` helpers against `git diff --name-only` plus untracked files: exit 0,
all paths in mon-7a. It is explicitly not the failed commit-range CI guard.
The lane file changes by exactly one compact JSON line, between main-integration
and outbox-adapter-1. No other lane line changed. The real lane guard must run
again on the dispatcher's committed head. Turbo emitted non-fatal sandbox cache
`IO error: Operation not permitted (os error 1)` warnings and replayed two existing
package-cache entries; this is recorded rather than called a clean pinned install.
Existing global CSS autoprefixer and multiple-lockfile tracing warnings remain.

No screenshot/trace of a successful browser run exists. No live model/provider,
CI, clean install, PostgreSQL constraint or browser success is claimed. `pnpm eval`
was not run: AI prompts/models/parsers/gateway/matching are unchanged; prevention
is a deterministic fixture result policy with its own domain tests.

### Migration, overlaps and gates

0103 is the issued number, not draft 0057. Additive two-table migration with
reference-only validation, subject guards, indexes, RLS, ownership and narrow
grants. No data backfill or historical rewrite. Fresh install and upgrade from
0095 are authored tests, not locally executed proof. Rollout is expand-compatible;
forward fix in a later reviewed migration, preserving facts/audit; disable affected
commands during repair. Migration notes and the versioned contract are updated.

Shared editing seams: lane registry, core/db barrel exports, migration registry,
Nest module/OpenAPI, workspace composition/index, quote-editor and workspace-shell
mount points, and catalog/count test rows. Integration/serialization owner is the
JobGuard integrator/dispatcher; this builder owns only this working-tree leaf.
No other lane was edited. Catalog/count changes are additions/totals for 0103 only.
`BUILD_PLAN.md` is allowed solely for the integrator's §12.2 ledger and remains
untouched by the builder. The data-flow register remains untouched (Q6): no
external route is introduced; each live source needs its own entry with D04 and
D12 v3 evidence before use. AGENTS, decisions, policy/config packages, AI source,
fee/recovery/value/meter/entitlement code, package files and lockfile are unchanged.
TENANT-STAMP-1 is not merged in this base. New tests use the available membership
context constructor; applications obtain context exclusively through PracticeAccess.

Invariants touched: tenant/subject isolation, immutable binding lineage, strict
input/output schemas, exact idempotency, explicit watch authorization, audit atomicity
and final-lock ordering, synthetic-only gate, prevention/financial severance.
No new provider destination, financial migration, professional approval or worker
alert/schedule. Remaining gates: G1; live M2-6; D04 and D12 v3 per live source;
D14 for any future paid check; full exact-head CI, independent Claude verdict and
separate technical acceptance. CH-9 / MON-1 must keep severance tests passing.
B4 remains parked; full MON-7 acceptance is not achieved.

Intended message is `/private/tmp/jg-msg-mon-7a.txt`.

### Changed-file SHA-256 manifest

Generated from actual tracked changes and untracked source files. Receipt excluded
from its own hash to avoid a circular digest. Exact implementation commit binding
is still the dispatcher's responsibility.

| File | SHA-256 |
|---|---|
| `apps/api/openapi.json` | `b6ae856f90bb5374cad701724242b84ef9a55df07ef042fe6e1032ae5b7fbf7a` |
| `apps/api/src/app.module.ts` | `0ba4cfae46270dd6a0e3c6f774b4049bfeff7e67d28f882b607c6bb87acd5045` |
| `apps/api/src/prevention-check.application.test.ts` | `68029216d8ad5b1b90f9d36bf61023532c6a5472994a788d2b97ee8337370be3` |
| `apps/api/src/prevention-check.application.ts` | `260852260866eb1f215d08d585ab25ab2f440bf58865748a07a510e59ad99003` |
| `apps/api/src/prevention-check.contracts.ts` | `dbd4045fbfacbb8de7b3b469a34fcce2de8700a97488d8a68615d46aa1c80834` |
| `apps/api/src/prevention-check.controller.ts` | `1d31f6403c5ab94382e145de0070fc7e8808dad9a530924ea0774bdb058950a5` |
| `apps/api/src/workspace/application.ts` | `c47bb72068801b145816f478e4f0b6b71cd440809d937d0d2ab4575faa489196` |
| `apps/api/src/workspace/index.ts` | `a97d4fb7a8fe395efd81df247c73296198f2f9de1c49beb40e1600046cb9619c` |
| `apps/web/app/api/jobs/[id]/prevention-checks/[action]/route.ts` | `baefc90791373916554a2eb47793bea445ab79dbf97ffbb80c400f139d502b08` |
| `apps/web/app/api/jobs/[id]/prevention-checks/route.ts` | `9faa4b06f00e2cd8d489b857a244c738c22e8d12bde04d80a64665112f56b12e` |
| `apps/web/app/ui/prevention-checks.module.css` | `596fc35d139673ee4d3b84f4c85a6588e0132eff093e08e62df45f8a289118a4` |
| `apps/web/app/ui/prevention-checks.tsx` | `4b7d9e7f2edaed1db93afe1bf44b407f1a1e16aa843134d7b14fb5fbf9b87da9` |
| `apps/web/app/ui/quote-editor.tsx` | `28537d248486bde1fdd437de6826abb4d1d24dd247072182b8cbb8a5a7af5d8c` |
| `apps/web/app/ui/workspace-shell.tsx` | `28cee80d4e1bfc3f928177d76845d072f042967d4730b3a116d182dd2f09dafb` |
| `apps/web/e2e/MON-7.spec.ts` | `1b2a0f9093e847dc6d447ed0876d263fd7d3a22cdc508ad41a167a65dcc39fc3` |
| `config/agent-lane-assignments.json` | `c34b68c92560a5c5f15a131bdc3b5a16ecafd932f50d85f19e51f00c1bc023f6` |
| `docs/contracts/prevention-checks-v1.md` | `24ea613a06a46e6a7a7303a7bb56ff5d2d3713c56b8ed64875d88131da6e8810` |
| `packages/core/src/index.ts` | `820e2035ce92369b7ff840c387c78e34f928b1571fd12ba851b1443664f42c33` |
| `packages/core/src/prevention-checks.test.ts` | `dc58123474245094966b2954b5245cd0890d6b018e824e8f6d6e4b189331f570` |
| `packages/core/src/prevention-checks.ts` | `ddddf67d82e3891ef99439ef9a76d1a4fe3d6a85aedcd6365b08ee0f851b5677` |
| `packages/db/MIGRATIONS.md` | `1ff994692a17e009717d61ff2c90dc93e17bf50aa57e5c990eefa4482ff931e6` |
| `packages/db/migrations/0103_prevention_checks.sql` | `f0ba63eb2e9c47bd446fb2977fd453ed4ac11174946f4b47b1c2625c8e407340` |
| `packages/db/src/index.ts` | `bd2f36b9932f49aa18cc814525b564dae4160a3fbe35c70290bac52acf2275e3` |
| `packages/db/src/migrate.ts` | `6a2323d2e6b23b339cf0a81eaf73bce2fb037f7668c4719167c41049e14dfb57` |
| `packages/db/src/prevention-check-repository.ts` | `0a6e7a8d940b244682546c97be0ffc10e0a9f9236dfe72ecd0b098c09ab0d712` |
| `packages/db/src/prevention-register-fixtures.ts` | `6f0910cb67dc5d744cd7c09a9e4ae8a117f9eecac804cb3529043e5108259544` |
| `packages/db/test/UIWIRE-12.integration.test.ts` | `03e3c38329963fc739ff2ec490089113563b5694741b850718e0df912ae238f8` |
| `packages/db/test/demo-bootstrap.integration.test.ts` | `9dc34365251f6f9e38010198f4b470e93d8ea80753ea7795dc7e37a49b7251f0` |
| `packages/db/test/prevention-checks.integration.test.ts` | `5983ddc23b539980eca8fd9f9aeeb72c453ffe7975bb670cc1afda849cfd4116` |
| `packages/db/test/tenancy.integration.test.ts` | `bca558d942571dabe7469cc6b40b6e607d92f0889c3c324403f486bac2f42dad` |
