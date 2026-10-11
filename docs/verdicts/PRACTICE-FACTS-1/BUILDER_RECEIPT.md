# PRACTICE-FACTS-1 — part A builder receipt

Builder: Codex GPT-6.1 Sol. Issued order: 11 October 2026, coordinator/integrator
header takes precedence over the draft. Base and unchanged HEAD:
`4a70824d1fa9cab84699436ea4217a1da0ad487e` (CH-7 #132 merged).
Branch: `codex/sandbox/practice-facts-1`. Working-tree delivery only; no git write,
commit, push, PR, merge, deployment or acceptance was performed.

**Builder receipt only — not independently verified, not accepted.**
Check lane RED. After CI: fresh Claude Opus review AND separate Sol check must
explicitly confirm preserved merged source/assertions, no existing row change,
and byte-identical merged practice-feed assertions, against the dispatcher’s
exact commit. Those reviews and separate acceptance are still owed.

## Delivered scope

| Step | Status and evidence |
|---|---|
| A1 | BUILT: separate frozen `practiceFactsCatalogueV1`, strict command/query/event schemas, exact pence, reuse of the merged pure generator/projection/assessment through an internal one-to-one semantic bridge. `practice-facts.test.ts`: 22 passing tests; all six steps, all six facts, receipt-reason parity, duplicate holding, exact supplier sum and forged fields. |
| A2 | BUILT (source only): migration 0124, widened checks and unchanged session-bound write guards/completeness. New real-PostgreSQL tests written before implementation for the main acceptance cases; additional raw/upgrade probes added during self-review. NOT RUN. |
| A3 | BUILT (source/build): appended `factsView`/`factsCommand`, shared revision, original private guard/authorize/snapshot and audit helper reused. One merged-projection read-filter block excludes new-key events/matches and exact-amount extra receipts, and keeps new reconciliation commands from the merged key parser without losing their revisions. Mixed-catalogue and upgrade integration assertions written, NOT RUN. |
| A4 | BUILT: PracticeAccess's existing stamped context is passed whole. Next GET/POST and Nest use the same application. Two `pre_live_allowed` rows; composition and exports appended; OpenAPI generated and checked using the unchanged generator. `practice-facts.application.test.ts` and `practice-facts.controller.test.ts`: 47 passing unit tests. Repository is a test double in those tests, not a database integration. |
| A5 | BUILT (compiled, browser NOT RUN): separate `#practice-facts` section immediately after Practice receipts, outside its section. Six labelled movements, merged wording, exact pounds, supplier paid-state, receipt matches, reload and unknown-outcome pause. Existing panel, banner and controls unchanged. Browser journeys cover both projects, matching, keyboard, layout, reload, Jobs/saved-URL reopen and second context. |
| B1/B2/B3 | HELD / NOT BUILT: expressly outside issued part A; PRACTICE-FACTS-1b is owed after A merges. No CH-7 routine, repository, test or screen was edited. |

The header's Q6 adds two receipts to the four draft facts, so this catalogue has
**six** additional movements, including four receipt keys. Accordingly all six
CHECKs retain every old value and admit the six issued keys (receipt-only checks
admit only the four customer-receipt keys). Both supplier-payment keys are
refused in receipt matching. No merged seven-row count is increased.

## Reference figures and fixture identity

| Reference | Exact pence | Status |
|---|---:|---|
| F5 deposit movement | 1200000 | Added `receipt-12000`, `test-m`; no allocator or qualifying-principal assertion here |
| F5 subsequent movement | 1464000 | Added `receipt-14640`, `test-m`; saved F5 stays owed to M4-8-S |
| Later invoice cash due | 144000 | Server catalogue constant; no supplier document created |
| Later invoice payments | 60000 then 84000 | Added `supplier_invoice_payment` facts, `later-supplier-invoice` |
| F14 Q | 30000 | Plan reference only; saved positive path remains HELD for part B |
| F16 Q | 0 then 30000 | Plan reference only; saved positive path remains HELD for part B |
| F15 Q | 0 | Existing CH-7 figure, unchanged |
| F18 extra statutory interest receipt | 12000 | Added `receipt-interest-120`, `F18-outside-vat` |
| F18 extra fixed compensation receipt | 7000 | Added `receipt-compensation-70`, `F18-outside-vat`; never added to Q here |
| CH-7 F18 original receipt / existing Q | 300000 / 262000 | Existing receipt and evaluator unchanged; the new integration control checks both extra receipt timestamps are after case opening |

Supplier values: **INTERIM synthetic fixture amounts (coordinator ruling 11 Oct);
not product figures**. F18 additions are **outside-VAT synthetic fixtures**;
VAT treatment is **HELD for the founder**. Fixtures are fictional and synthetic
only. No live tax choice, fee entitlement, allocation, landing, journal, fee,
statement or collection is introduced. New events use `practice-feed-event.v1`
and the identical source-hash inputs; the internal bridge never stores or
returns representative keys/amounts. New error codes: **none** (existing typed
vocabulary, with `practice-facts-error.v1` transport envelope).

## Migration and existing guarantees

`0124_practice_feed_facts.sql` creates **NO table, column, role, grant, policy or
trigger**, replaces no routine, and **updates, rewrites or deletes NO existing
row**. It alters only the six catalogue CHECK constraints on
`app.practice_feed_command`, `app.practice_feed_event` and
`app.practice_feed_receipt_match`. Discovery uses table identity plus
`pg_get_constraintdef` containing `receipt-384`, demands exactly two per table,
and aborts on a mismatch. Drop/add occurs in one transaction with explicit new
constraint names. Existing key/amount branches and command-shape alternatives
are retained; the two merged feed routines are not restated.

Expand-compatible. Operational cost: access-exclusive table locks and check
validation scans. Forward-fix: retain the expanded checks and disable the new
application surface if needed; narrowing checks after new facts exist is unsafe.
Do not rewrite append-only facts. No backfill. The integrator owns renumbering
and the BUILD_PLAN §12.2 ledger line; BUILD_PLAN was not edited.

Security catalogue expected by the new tests (NOT database-verified here): all
five feed tables retain ENABLE + FORCE RLS, `jobguard_migration` ownership,
`tenant_isolation` policy for migration/runtime roles, and runtime **SELECT and
INSERT only**. Runtime UPDATE/DELETE/TRUNCATE are refused. Both feed routines
remain SECURITY INVOKER, migration-owned, with runtime EXECUTE revoked.
Tenant/job/account/command/payment composite foreign keys remain unchanged.
The existing CH-7 `(tenant_id,job_id,id)` event identity is retained.

The upgrade suite populates all seven original keys and an original matched
receipt before 0124. It compares `row_to_json` text for every pre-existing
command/event/match, compares policies, ACLs, owners, triggers and function
source, requires both new checks per table validated, checks the merged view,
and checks migration re-run is a no-op. Fresh-install coverage is also authored.
These tests have not been executed. RLS assumes a correctly authenticated
context; server-supplied environment settings do not prove physical deployment
separation by themselves, as already documented for the merged feed.

## Observed commands

No packages downloaded; installed dependencies were used. Node: `v24.17.0`.
The default launcher (pnpm 11) tried to switch versions and failed on unavailable
registry signatures before Vitest ran. An already installed native pnpm
**10.28.1** was found and linked into `/private/tmp/jg-pf-bin`; subsequent pnpm
commands used `export PATH=/private/tmp/jg-pf-bin:$PATH`. No repository manifest,
lockfile or package-manager setting was changed.

| Actual command | Observed result |
|---|---|
| Default-launcher `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/practice-facts.test.ts` | Exit 1 before Vitest: pinned-version registry lookup unavailable. NOT test-red evidence. |
| Default-launcher `npm_config_manage_package_manager_versions=false pnpm --version` diagnostic | Launcher reported the same switch failure; enclosing diagnostic shell exited 0 after later commands. No package obtained. |
| Installed pinned native pnpm `--version` | Exit 0, `10.28.1` |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/practice-facts.test.ts` BEFORE implementation | Exit 1, one failed suite, zero tests collected: new module absent. Written-first red evidence. |
| Same core command, first implementation | Exit 1, 9 failed / 13 passed (22); new schema mistakenly read `.shape` from ZodEffects. Corrected to `.innerType().shape`; no assertion changed. |
| Same core command after correction; final repeated after later core edits | Both exit 0, 1 file, 22/22 tests passed each. |
| `pnpm turbo run build --filter=@jobguard/api...`, first prerequisite attempt | Exit 2: new DB query inference crossed two installed Zod patch versions; audit classification was outside allowed vocabulary. Fixed using an exported core query type and the existing financial classification. |
| Same prerequisite build, second attempt | Exit 1: missing not-yet-implemented API files/new test import. Dependencies had built; API tests could then run. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/practice-facts.application.test.ts src/practice-facts.controller.test.ts` BEFORE API implementation | Exit 1, 2 failed suites, zero collected tests: new application/controller absent. Written-first red evidence. |
| Same API command after implementation; final repeated after repository/core edits | Both exit 0, 2 files, 47/47 tests passed each. |
| `pnpm turbo run build --filter=@jobguard/api...`, after API implementation | Exit 0, 6/6 package tasks successful (2 cached). |
| `pnpm --filter @jobguard/api openapi:generate` | Exit 1: `tsx` CLI IPC socket EPERM. |
| From apps/api: `node --import tsx src/generate-openapi.ts` | Exit 0; unchanged generator ran without the CLI's IPC server; artifact generated. |
| `pnpm typecheck` (one final run) | Exit 2: new browser second-context options supplied `baseURL: undefined`. Fixed to explicit default URL. Not rerun under the order's once-only rule; subsequent full build passed its type validation. |
| `LANE_BASE_REF=origin/main pnpm lint` (one final run) | Exit 1: core purity passed, unchanged lane checker refused `HEAD == origin/main`; remaining package lint did not execute. No checker modified or bypassed to claim a pass. |
| `pnpm lint:lanes` | Exit 1: same self-comparison refusal in the uncommitted worktree. Dispatcher/CI must run after commit. |
| `pnpm build` (one final run) | Exit 0, 7/7 package tasks successful (2 cached), including Next compilation and type validation; 24 static pages generated. Existing workspace-root/CSS support and sandbox cache-write warnings; no build failure. |
| `pnpm openapi:check` | Exit 1: unchanged `tsx` CLI could not bind its IPC socket. |
| From apps/api: `node --import tsx src/generate-openapi.ts --check` | Exit 0; exact same unchanged checker executed without CLI IPC. |
| `node tools/money-arithmetic-lint.mjs` and `node tools/commercial-boundary-lint.mjs` | Both exit 0. Partial deterministic lint evidence only, not a full `pnpm lint` pass. |
| Read-only preservation Python check | Exit 0: 21 protected files byte-identical, all 83 existing OpenAPI path objects identical, 3 minified composition files recover byte-identical originals by removing only appended tokens, 7 other shared edits have zero removed lines. |
| Working-tree path comparison with unchanged `selectLane`/`matches` helpers | Exit 0, 25 files within the issued allow-list at that point. Manual path evidence only, NOT the committed-range lane checker. Receipt/evidence files subsequently added under its existing docs allow-list. |
| `git diff --check` | Exit 0. |

Only this lane's three unit-test files ran, one test run at a time, with at most
two workers and at most two files per run. No package-wide or repository-wide
test suite ran. No node --test suite was needed.

## NOT RUN and integrator checks owed

Every database and browser test: **NOT RUN (sandbox cannot start PostgreSQL /
a browser)**. No PostgreSQL cluster, browser, development server or live provider
was started. Tests-first for those suites means source written first, not an
observed failing run. Raw guard/FK/audit/fresh-install probes and the second
matching browser journey were added during self-review, after implementation.

Integrator/CI must run, respecting the memory limits and one run at a time:

- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/practice-facts.integration.test.ts test/practice-feed.integration.test.ts test/recovery-eligibility-v3.integration.test.ts`
- `pnpm test:db` — whole-suite execution reserved for CI/integrator, not builder sandbox
- `pnpm test:migrations`
- `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop PRACTICE-FACTS-1.spec.ts M4-7-S.spec.ts CH-7.spec.ts` (then unchanged M4-1-S separately)
- Unchanged merged core/API feed and CH-7 suites; pinned context-boundary suite
- `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `pnpm lint:lanes`, normal `pnpm openapi:check` against the committed leaf

Captured practice jobs remain excluded from the Jobs home by the unchanged
founder-owned filtering. Browser reopening follows the merged convention: go to
Jobs, then reopen the saved URL; no home-list or source-pinned file is edited.

## Shared edits, overlaps and owner

The first edit was exactly one compact lane line after `plan-rev30`, before
`sbox-1`. It uses the issued filename `0124_practice_feed_facts.sql`, not the
draft placeholder. No existing lane line changed.

Existing files edited, with additive proof:

- `config/agent-lane-assignments.json`: one new lane line, zero removed lines.
- `packages/core/src/index.ts`: appended export, zero removed lines.
- `packages/core/src/watchdog.ts`: two appended route rows, zero removed lines.
- `packages/db/src/migrate.ts`: one migration URL in numeric order, zero removed lines.
- `packages/db/MIGRATIONS.md`: appended migration note, zero removed lines.
- `packages/db/src/practice-feed-repository.ts`: appended import/methods and the one authorized read-filter block, zero removed lines. Original method text remains intact.
- `apps/api/src/workspace/index.ts`: three appended exports, zero removed lines.
- `apps/api/src/workspace/application.ts`: import, service construction and one object entry inserted. Removing exactly these additions recovers the original file byte-for-byte.
- `apps/api/src/app.module.ts`: import and appended controller registration. Removing only those tokens recovers the original file byte-for-byte.
- `apps/web/app/ui/workspace-shell.tsx`: import after the existing client directive and one appended panel element. Removing only those additions recovers the original file byte-for-byte.
- `apps/api/openapi.json`: 246 inserted lines, zero removed lines; every existing path object unchanged.

No existing test file was edited; zero removed OR changed assertion lines. No
M4-8-S, CH-7, feed routine, SH-1, SV-1, auth pin, provider, AI, config, decision,
plan, manifest, lockfile or tools file changed. `SOURCE_PRESERVATION.json` records
the protected-file hashes. Shared registrations, migration order, feed repository
and workspace-shell overlap with other lanes: integrator/dispatcher owns
serialization and the exact committed diff. No other agent worked on this leaf.

## Self-review

Re-read the whole diff against `origin/main` while it matched the issued base, the new files and the issued header
as a strict reviewer. This is builder self-review, not independent model review.

Checked:

- Every part-A acceptance group maps to new core/API, PostgreSQL or browser probes: catalogue/steps/assessment parity; pending/settled/dedup/held/reconciliation; exact receipt matching; shared revision/replay/conflict/race; populated upgrade/no-op/fresh install; unchanged view/catalogues; FORCE RLS/grants/append-only; missing context, nonmember and another-session refusal; raw amounts/hashes/command links/supplier matches; audit atomicity; disconnect; synthetic-only deployment boundaries.
- Exact amounts are 1200000, 1464000, 60000, 84000, 12000, 7000; cash due is 144000 through SH-1 integer primitives. No fee is shown, stored or derived. Existing F18 Q/reason are checked only as a CH-7 preservation control, not changed.
- All written business rows carry the verified tenant, job, same account and command. Database FK probes isolate native composite FKs with ONLY the user guard disabled in a rolled-back fixture transaction; FK triggers stay enabled. Production code disables no trigger or check.
- Source-hash ordering matches 0106. New commands append `practice_feed.<action>` audit events that the unchanged deferred completeness routine requires. Existing authorization/locks/snapshot are reused, and no business network call exists.
- One authorized read-filter block accounts for new-key events, matches and reconciliation without losing the latest shared revision. Extra receipt amounts appear only in the new panel. Merged tests/counters remain byte-identical.
- All six old key/amount constraints retain every old literal and branch; only allow-list additions are made. Migration has no DML, no new table/column/role/grant/policy/trigger and no function statement. Owners, privileges and policies are untouched in source; actual PostgreSQL verification is held.
- Held part B and M4-8-S saved F5 are not built. F18 fixture addition follows the issued header; VAT stays held. No founder approval inferred.
- All changed paths fit this lane; checked exact additive token reconstruction and protected file hashes. No assertion removed, weakened or updated. Existing timeouts are untouched.

Corrections made during build/self-review: ZodEffects shape access; exported core
query type for differing installed Zod patches; existing audit classification;
new test's stale renamed import; preserve the workspace client directive; browser
helper import, exact merged state labels and receipt-history wait; explicit
browser baseURL default; real audit-INSERT fault injection; collision-safe DB
port selection. Added raw-backstop, fresh-install and after-case F18 timestamp
probes, and a browser F5 match journey. No existing test or expected value changed.

Limitations: source inspection and green unit/build results do not verify
PostgreSQL or browser behavior. The lint command and standalone typecheck result
remain truthfully failed as above; committed CI reruns are required. No elapsed
wait or green build is recorded as commercial/security approval.

Owed: PRACTICE-FACTS-1b (including Q4 documents/consumed-credit persistence),
M4-8-S saved F5, founder F18 VAT treatment, live M4-5, migration ledger entry,
committed CI, fresh Opus and Sol verdicts, and separate acceptance. Release gates
D01 v3, D03 v3, §5.5 consumed-credit amendment and G4-S remain unresolved.

## Final base/range note

During final source-evidence generation, `origin/main` advanced externally to
`bbca5ca5ee55a6a4d7fcdf89de426195d28c3e27` (ENT-10a / migration 0120 merged).
HEAD and this working tree remain based on the issued CH-7 merge `4a70824`.
The initial 21-file/83-path preservation checks and minified-token reconstruction
ran while origin/main equalled that base. Final SOURCE_PRESERVATION.json is bound
to the fixed issued base, not the moving remote ref. An attempted final comparison
using the moving ref detected the newer SSO paths and stopped; it was not recorded
as a preservation pass. Rechecking the fixed issued base succeeded, including all
seven scanner source pins. Syntax-only transpilation of the new database/browser
files also exited 0; this is not test execution.

The dispatcher must commit only this worktree's 27 changed files and reconcile
shared registrations/OpenAPI/migration order with ENT-10a before committed CI.
No ENT-10a file was edited, removed or imported into this worktree; the apparent
older-tree removals in `git diff origin/main` are remote-base movement, not leaf
edits. No git checkout, merge, rebase or other git write was attempted.

Final housekeeping: removed 16 generated output/cache paths (dist, .next,
package .turbo caches and TypeScript build info); left no .pnpm-store,
test-results or build output in the worktree. Final `git diff --check` exited 0.
Intended conventional commit subject/body are written to
`/private/tmp/jg-msg-practice-facts-1.txt`. No git write occurred.
