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

## CI repair 1 — 11 October 2026 (Claude Sonnet, run on the Mac)

Repair builder only. Not a review and not an acceptance. Run on the Mac where PostgreSQL starts; every number below is from a real run.

**Catch-up.** `origin/main` dc16fd6 merged into the branch (merge commit b76171e). Conflicted files, all resolved by keeping both sides: `apps/api/src/app.module.ts` (imports; controller list now has `SsoController` first and `PracticeFactsController` last; the SSO provider kept), `apps/api/src/workspace/application.ts` (imports; the returned object carries both `sso` and `practiceFacts`), `apps/api/src/workspace/index.ts` (both export groups), `packages/db/src/migrate.ts` (0120 then 0124), `packages/db/MIGRATIONS.md` (the 0120 section, then the 0124 section). `apps/api/openapi.json` merged without conflict and `pnpm openapi:check` passes.

**Renumber.** None. 0124 was still free (merged through 0120; 0121 and 0122 held by open pull requests; 0123 is CH-7-F17-BEFORE-OPEN). Registered in numeric order after 0120. `BUILD_PLAN.md` §12.2 gained one "Ledger amendment — PRACTICE-FACTS-1" paragraph before §12.3, and `BUILD_PLAN.md` was added to this piece's own lane line (the earlier statement above that BUILD_PLAN was not edited is superseded by this).

**Routine diff.** Not applicable: `0124_practice_feed_facts.sql` contains no `CREATE FUNCTION` and restates no routine. It only drops and re-adds the six catalogue CHECK constraints. No column was added to any fingerprinted table.

**Faults.**
1. PostgreSQL would not start in this worktree (dylib symlinks not created because pnpm skips the package's install script). Fix: ran the package's own `scripts/hydrate-symlinks.js` inside `node_modules`. No repository file changed. Kind: environment.
2. `packages/db/test/practice-facts.integration.test.ts:262` (test "fresh migration installs 0124 once without introducing business objects or changing grants", failing inside `migrate` at the first query): `error: empty password returned by client`. Cause: `new Pool({...admin.options,database})` drops the pool's non-enumerable password. Before: `new Pool({...admin.options,database})`. After: `new Pool({...admin.options,password,database})` using the file's own `password` constant. Kind (i), test set-up only; no `expect` or expected value touched.

**Commands and results.**
- `pnpm install --frozen-lockfile` exit 0; `pnpm turbo run build --filter=@jobguard/db... --filter=@jobguard/api...` exit 0 (6 of 6 tasks).
- `packages/core`: `src/practice-facts.test.ts` + `src/practice-feed.test.ts` (merged, unedited) 58 passed, exit 0.
- `apps/api`: `src/practice-facts.application.test.ts` + `src/practice-facts.controller.test.ts` 47 passed, exit 0.
- `packages/db`: `test/practice-facts.integration.test.ts` 22 passed after fault 2 (before: 21 passed, 1 failed); `test/tenancy.integration.test.ts` + `test/demo-bootstrap.integration.test.ts` 13 passed; merged `test/practice-feed.integration.test.ts` (unedited; `git diff origin/main` on it is empty) + `test/recovery-eligibility-v3.integration.test.ts` 51 passed. All exit 0.
- `apps/web`: `e2e/PRACTICE-FACTS-1.spec.ts`, `--workers=1`, both projects: 4 passed. `chromium_headless_shell-1193` is not installed (`playwright install` is forbidden), so the spec ran with a throw-away config kept outside the repository (`$HOME/.local/share/full-steam/jg-runs/pw-local-channel-pf1.config.ts`) that only sets `channel: "chromium"` to use the installed full chromium-1193. Kind: environment.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`, `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `pnpm openapi:check`: all exit 0.
- Every vitest run used `--maxWorkers=2` inside `heavy-slot`, one run at a time, memory free 77 to 78 percent. `recovery-follow-up-upgrade.integration.test.ts` was not run, as instructed.

**Stopped on:** nothing. The INTERIM amounts (£1,440.00 due, paid £600.00 then £840.00) and the F18 receipts (£120.00 and £70.00) are unchanged and remain labelled synthetic fixture amounts, not product figures. No assertion, expected value, timeout, grant or policy was changed or loosened.

Builder repair record only — not independently verified, not accepted.


## Round 1 — 11 October 2026

Builder: Codex GPT-6.1 Sol. Repair only, on the same leaf and working tree at
`c26e644499536c2bb800f512c9ef349c90114d27`; no git write, package download,
PostgreSQL start, browser start, remote action or approval. Reread the issued
header and both reviews of c26e644; this round's coordinator rulings govern the
three fixes below and supersede conflicting historical statements above.
Check lane remains RED. Builder receipt only — not independently verified,
not accepted.

### Fixes

**Fix 1 — DONE (implementation and authored coverage; PostgreSQL NOT RUN).**
Before: the merged receipt projection discarded payments by equality with new
customer-receipt amounts, even on old-only jobs. After: it collects payment IDs
from stored receipt matches whose movement identity belongs to the new
`practiceFactKeyV1` catalogue, then excludes only those payment IDs. This uses
existing match identity; no column is added. Unmatched ordinary payments remain
in the merged view, whatever their amount. New matched payments appear in the
new section; that section still offers exact-amount candidates for explicit
matching. The merged event/match/reconciliation filters and shared revision
behavior are retained. No amount comparison remains in the authorized merged
read-filter block.

Four PostgreSQL regressions were written before the implementation edit, in
`packages/db/test/practice-facts.integration.test.ts`:

- `old-only job keeps all ordinary £120, £70 and £384 receipts in the merged view`
- `old-only job keeps every new example amount at once with main's receipt count and total`
- `ordinary £120 receipt stays merged beside the separate matched F18 £120 interest receipt`
- `new facts and their matched receipts leave every merged total and count unchanged`

Each is **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Source
inspection predicts failure at c26e644: respectively one receipt instead of
three; two instead of six (144000p instead of 2827000p); zero merged receipts
instead of the ordinary £120 receipt; and one ordinary receipt instead of two
(38400p instead of 50400p). These are source-inspected expectations, not observed
red test runs. The six-at-once fixture includes £12,000, £14,640, £120, £70,
£600 and £840. The fourth case also compares the entire merged view except the
shared revision, preserving movements, event count and assessments.

**Fix 2 — DONE (implementation and authored coverage; PostgreSQL NOT RUN).**
Before: 0124 replaced all six discovered CHECK names with new names. After:
0124 discovers exactly two catalogue CHECKs per table, classifies each existing
expression, and drops/re-adds its widened expression under its original name.
Default ADD CHECK validates existing rows; all changes remain in the same
access-exclusive transaction. All six widened expressions are preserved
verbatim from c26e644 (the command/event movement expression is shared).
No second migration, table, column, role, grant, policy, trigger or routine;
no existing row updated, rewritten or deleted. Expand-compatible; retain
expanded checks and disable the new surface on forward-fix rather than narrow
checks or rewrite immutable rows. No backfill.

The existing leaf test `populated upgrade preserves every old row byte-for-byte,
checks all rows, and leaves all security and routine catalogs identical;
remigrate no-op` now captures all six names and definitions before 0124, compares
the same six table/name pairs after it, requires `convalidated` on every
replacement, and checks every old allowed string/numeric literal remains.
Assertions were written before editing 0124. **NOT RUN (sandbox cannot start
PostgreSQL / a browser)**; at c26e644 all six name comparisons would fail.
Earlier row-byte, grants/RLS/owners/policies/triggers/routine comparisons and
rerun assertions remain intact. These are not claimed as database verification.

**Fix 3 — DONE (records).** The 0124 migration note and contract now explicitly
state **six movement keys** on the command/event movement checks:
`receipt-12000`, `receipt-14640`, `supplier-payment-600`, `supplier-payment-840`,
`receipt-interest-120`, `receipt-compensation-70`; and **four receipt keys** on
the receipt-only checks (command match action and receipt-match keys/amounts):
`receipt-12000`, `receipt-14640`, `receipt-interest-120`,
`receipt-compensation-70`. The six widened CHECKs keep every old allowed value.
BUILD_PLAN.md is untouched in this round; its ledger paragraph belongs to the
integrator.

Ledger paragraph says four keys; correct figure is six movement keys and four receipt keys (integrator to correct).

**Scanner working-tree repair — DONE; historical scan resolution HELD.** The
formerly flagged line 255 now derives expected movement fields from a named
list, without a quoted literal beside the field. Identical expected rows,
amounts and after-open flags are preserved. No history rewrite or scanner
exception was attempted. The old commit remains flagged; the founder decides
how that is cleared. A deterministic inspection of added lines checks the
binding scanner-shaped literal rule; this is not a GitHub secrets-scan pass.

Supplier amounts remain £1,440 due, paid £600 then £840: **INTERIM synthetic
fixture amounts (coordinator ruling 11 Oct); not product figures**. F18 £120
interest and £70 compensation remain outside-VAT synthetic fixtures; VAT
treatment HELD for the founder. No fee is shown, derived, stored or posted.

### Round 1 commands and results

Installed dependencies only. Node `v24.17.0`, installed pinned pnpm `10.28.1`;
commands use `export PATH=/private/tmp/jg-pf-bin:$PATH` to avoid the launcher's
package-version download. Only the leaf's required unit files ran, one test run
at a time, each with `--maxWorkers=2` and at most two files. No whole package or
repository test suite ran. Root typecheck, lint and build each run once.

| Actual command | Exit / result |
|---|---|
| `pnpm --version` | 0; 10.28.1 |
| `pnpm turbo run build --filter=@jobguard/api...` before unit tests | 0; 6/6 tasks successful, 4 cached |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/practice-facts.test.ts` | 0; 1 file, 22/22 passed |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/practice-facts.application.test.ts src/practice-facts.controller.test.ts` | 0; 2 files, 47/47 passed |
| `pnpm typecheck` | 0; 7/7 tasks successful, 4 cached |
| `LANE_BASE_REF=origin/main pnpm lint` | 0; purity, lane and money checks passed; 7/7 package tasks successful, 4 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; committed-range lane boundary passed |
| `pnpm build` | 0; 7/7 tasks successful, 4 cached; Next generated 25 static pages; existing CSS/workspace-root/cache warnings only |
| `pnpm openapi:check` | 1; unchanged tsx launcher cannot bind its IPC socket (EPERM) |
| From apps/api: `node --import tsx src/generate-openapi.ts --check` | 0; same unchanged checker without CLI IPC; artifact matches |
| Syntax-only TypeScript transpilation of the changed PostgreSQL test | 0; no test execution |
| Working-tree path inspection using unchanged lane helper | 0; all 6 changed files allowed; supplements committed-range lane check |
| `ps -axo pid,ppid,%cpu,%mem,etime,comm` diagnostic | 127; sandbox refuses process inspection; no process data returned |
| `git diff --check` | 0 |
| Read-only Python preservation inspection, first attempt using moving origin/main | 1; newer audit-export test absent from this leaf; stopped before claiming preservation |
| Read-only Python inspection against fixed reviewed base `dc16fd683e6ab8b319c5b2f555708bc2c7254be2` | 0; all 269 merged test files and 22 protected files byte-identical; BUILD_PLAN and parked UI unchanged from HEAD; 127 added lines had no binding-rule scanner pattern; all six widened expressions preserved verbatim and migration ALTER-only |
| `git grep -n -E "(1200000\|1464000\|12000\|7000\|60000\|84000)" -- packages/db/src/practice-feed-repository.ts` | 1; no matches (expected); no example amount controls merged inclusion/exclusion |

Every PostgreSQL and browser suite is **NOT RUN (sandbox cannot start PostgreSQL /
a browser)**, including the new/extended integration cases, fresh install,
upgrade, merged database regressions and all browser journeys. No M4 device,
AI model/prompt/evaluation or live integration changed. CI must verify actual
PostgreSQL and browser guarantees; earlier CI evidence above predates this
repair and is not a result for the repaired working tree.

### Round 1 self-review

Re-read the complete Round 1 diff as a strict reviewer. This is builder
self-review, not a fresh Sol check or an Opus verdict.

- The merged read-filter excludes payments solely by stored match payment ID
  plus new-catalogue membership. Ordinary equal-amount receipts survive with or
  without an account; a new match excludes only its own payment. The four
  written-first regressions expose c26e644's failures; they are not claimed run.
- Six original constraint names survive discovery/drop/add. Each replacement
  is validated in the same transaction. All six widened expressions are
  byte-identical to the earlier leaf; the upgrade test now verifies names,
  `convalidated` and every old literal in addition to existing row-byte and
  security/routine checks. Actual PostgreSQL catalog verification remains owed.
- Records agree on six movement keys and four receipt keys. The ledger correction
  is explicitly handed to the integrator; BUILD_PLAN was not edited this round.
- All 269 merged test files and the 22 protected files compared to the fixed
  reviewed base are byte-identical. The only edited test is this leaf's new
  integration file. No assertion, expected result, skip or timeout was weakened;
  the scanner repair constructs exactly the former expected rows from lists.
- The grep specified by the repair order returns no example-amount literals in
  the repository. New-view exact-amount candidate selection is unchanged; it
  does not remove an ordinary payment from the merged view.
- No new identity/authorization path, column, financial derivation, posting,
  external action or provider route. Existing tenant/job-qualified matches,
  RLS/grants, actor/session verification, locks and audit are reused unchanged.
- Only six files changed: this receipt, the contract, MIGRATIONS, 0124, the
  authorized read-filter and this leaf's integration test. Each is in the
  existing lane. No shared registrations need changing; migration/repository
  overlap remains serialized by the dispatcher/integrator.
- No UI, CH-7 routine, M4-8-S, part B, source-pinned auth file, model/prompt,
  decision policy, manifest, lockfile or tool changed. All listed fix-later
  issues remain parked. No security or commercial approval inferred.

`origin/main` advanced externally to
`11f394b7cd41645ef268d99fcb3ad33be408661b` during this round; HEAD remains
c26e644. The original base for both supplied reviews and this preservation
inspection is `dc16fd683e6ab8b319c5b2f555708bc2c7254be2`. No checkout,
merge, rebase, commit, add, push or history write was attempted. Lane checks
use origin/main's merge base; the dispatcher owns any later integration.

Final added-line and intended-message inspection exited 0: no binding-rule
scanner-shaped literal; this does not clear the historical scanner finding.
Generated outputs and caches were removed after the successful build; no
package store, build output or test-results is retained in the worktree.
Final whitespace/path/HEAD inspection is recorded below. The intended
conventional commit subject and body are written to
`/private/tmp/jg-msg-practice-facts-1.txt`; the dispatcher commits the working
tree. No git write occurred.

Final inspection: generated-output cleanup exited 0 (16 local paths removed);
added-line/message scan exited 0; `git diff --check` exited 0; `git status`
shows exactly the six files above; HEAD remains c26e644. The final amount grep
again exited 1 with no matches, as expected. No pending check placeholder
remains in this Round 1 record.

Owed: CI PostgreSQL/browser guarantees on the repaired head, historical secret
scan resolution by the founder, the integrator's ledger correction, the same
Opus review plus fresh Sol check of these fixes only, and separate acceptance.
No technical acceptance or production release is claimed. Part B, M4-8-S saved
F5, founder F18 VAT treatment, D01 v3, D03 v3, the consumed-credit amendment and
G4-S remain held as before.

## Round 1 verification — 11 October 2026 (Claude Sonnet, run on the Mac)

Verification run only, on the Mac where PostgreSQL starts, of the Codex round-1 commit 0da5302 on top of c26e644. Not a review and not an acceptance. `origin/main` was not merged in this job.

**Read checks (before running anything).**
- Amount search in `packages/db/src/practice-feed-repository.ts` for the pence figures of the examples (1200000, 1464000, 12000, 7000, 60000, 84000): no hits. The read filter now builds the set of payment ids that are matched to a new fact (a matched row whose movement key parses as one of the new fact keys) and removes exactly those payments from the merged view. It works on identity, never on an amount.
- `0124_practice_feed_facts.sql` finds each of the six catalogue CHECK constraints on the three practice-feed tables by what it checks, drops it and re-adds it under the same name it already had.

**Constraint names, read from a real database** (migrated to 0123, then through 0124; throw-away script kept outside the repository). Before 0124 and after 0124 the six names are identical: `practice_feed_command_check`, `practice_feed_command_movement_key_check`, `practice_feed_event_check1`, `practice_feed_event_movement_key_check`, `practice_feed_receipt_match_check` and `practice_feed_receipt_match_movement_key_check`. The round-0 head (c26e644) added six differently named constraints instead; round 1 keeps the originals. The upgrade test also compares the table and name pairs before and after.

**Faults.** None. No test failed on any run, so no repair was made and no file other than this receipt was changed in this job. Observation only: in the leaf's own test file the round-1 builder restructured one existing expectation of the F18 settled-event timing (movement names and amounts moved into two small arrays, then mapped back into the same three expected rows); the values compared are the same as before.

**Commands and results** (every vitest call used `--maxWorkers=2` with `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`, inside `heavy-slot`, one run at a time; load average under 24 and memory free at least 74 percent before each).
- `pnpm install --frozen-lockfile` exit 0; `pnpm turbo run build --filter=@jobguard/api... --concurrency=2` exit 0 (6 of 6 tasks).
- `packages/db` `test/practice-facts.integration.test.ts` 26 passed (22 before round 1; the four new read-filter tests and the constraint-name proof are included), exit 0. There is no separate upgrade test file.
- `packages/db` merged `test/practice-feed.integration.test.ts` + `test/recovery-eligibility-v3.integration.test.ts`, unedited: 51 passed, exit 0.
- `packages/db` `test/tenancy.integration.test.ts` + `test/demo-bootstrap.integration.test.ts`: 13 passed, exit 0. `test/fingerprinted-row-shape.integration.test.ts` does not exist on this branch.
- `packages/core` `src/practice-facts.test.ts` + `src/practice-feed.test.ts`: 58 passed, exit 0. `apps/api` `src/practice-facts.application.test.ts` + `src/practice-facts.controller.test.ts`: 47 passed, exit 0.
- No browser run in this job.

**Stopped on:** nothing. No assertion, expected value, timeout, grant or policy was changed or loosened by this verification.

Verification record only — not independently verified, not accepted.

## Round 2 — 11 October 2026 (Claude Sonnet, run on the Mac)

Last allowed repair round. Authority: `PRACTICE-FACTS-1-r2-repair.txt`. Starting head 4c46815, clean tree. Builder repair record only; not a review and not an acceptance.

**R2-1 (the red test): DONE.** Only this piece's own `apps/web/e2e/PRACTICE-FACTS-1.spec.ts`, second test; no product code changed. The failing line (line 45 at 4c46815) asserted that the merged "Practice receipts" panel lists zero attested receipts straight after the two matches; the panel loads on mount only, so it still listed both unmatched receipts.
- Before (at 4c46815, line 45): one line with two assertions, the extra panel showing 2 receipts, then the merged panel showing 0 attested receipts. The next line reloaded the page and checked the extra panel showed 2 qualifying receipts.
- After: (a) directly after the reload that follows the practice-feed connect command, and before any match, a new `merged` locator for the merged panel's attested receipts must have count 2, with exactly one row containing the £12,000.00 amount and exactly one containing the £14,640.00 amount. (b) The extra-panel count of 2 stays where it was. After the existing reload the extra panel must still show 2 qualifying receipts, and then the merged panel must show its empty-state sentence and an attested-receipt count of 0. The count-zero assertion is the same assertion, moved after the reload. No assertion was removed or weakened. The empty-state sentence check was added only so the zero count cannot pass before the merged panel has loaded.

**R2-2 (records): DONE.** `BUILD_PLAN.md` §12.2, this piece's ledger paragraph only: "four new keys" now says six movement keys (named as `packages/db/MIGRATIONS.md` names them) on the command and event checks and four receipt keys on the receipt-only checks. Nothing else in that file was changed by this round.

**R2-3 (evidence): DONE.** `origin/main` 4564e88 merged by merge commit 4b284fa (this branch's repair commit before the merge: d579689). Conflicts, all resolved by keeping both sides and nothing more: `BUILD_PLAN.md` (the ENT-10b and ENT-4b ledger paragraphs first, then this piece's), `apps/api/src/app.module.ts` (imports both; controller list has the audit export controller after the sign-in controller and the practice facts controller last), `apps/api/src/workspace/application.ts` (imports both; the returned object carries `sso`, `auditExports` and `practiceFacts`), `packages/core/src/index.ts` (both export lines), `packages/db/src/migrate.ts` (0121, 0122, then 0124) and `packages/db/MIGRATIONS.md` (0121 and 0122 sections, then 0124). The migration stays 0124 and is registered after 0122. Note: this piece's ledger paragraph still says 0121 and 0122 were "held by open pull requests"; that was true at dispatch and was left alone under the R2-2 limit.

Commands (every vitest call used `--maxWorkers=2` with `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`, inside `heavy-slot`, one at a time, memory free 76 to 80 percent, load average under 14):
- `pnpm install --frozen-lockfile` exit 0. `pnpm turbo run build --filter=@jobguard/api... --concurrency=2` exit 0 (6 of 6 tasks).
- `packages/db` `test/practice-facts.integration.test.ts`: exit 0, 26 passed.
- `packages/db` merged `test/practice-feed.integration.test.ts` + `test/recovery-eligibility-v3.integration.test.ts`, unedited: exit 0, 51 passed.
- `packages/db` MIG-ORDER-2 `test/fingerprinted-row-shape.integration.test.ts` + `test/recovery-follow-up-upgrade.integration.test.ts`: exit 0, 16 passed.
- `packages/core` `src/practice-facts.test.ts` + `src/practice-feed.test.ts`: exit 0, 58 passed. `apps/api` `src/practice-facts.application.test.ts` + `src/practice-facts.controller.test.ts`: exit 0, 47 passed.
- `pnpm turbo run build --filter=@jobguard/web... --concurrency=2` exit 0 (production build; the web build was a cache miss, so it was rebuilt from the merged source).
- `CI=true playwright test e2e/PRACTICE-FACTS-1.spec.ts --workers=1` through an out-of-repo wrapper config that only sets the browser channel to the installed full chromium (`playwright install` was not run), against the production build (`next start`): exit 0, 4 passed (both tests on mobile-360 and desktop). At 4c46815 the same run gave 2 passed, 2 failed.
- `LANE_BASE_REF=origin/main pnpm lint:lanes` exit 0; `pnpm turbo run typecheck` exit 0; `pnpm turbo run lint` exit 0 and `node tools/lint.mjs` exit 0 (the two halves of `pnpm lint`); `pnpm openapi:check` exit 0.

**R2-4 (this receipt): DONE.** The GitHub run id will be added by the integrator once the run starts; it was not known when this section was written.

**Stopped on:** nothing. No merged test file was edited. No assertion, expected value, timeout, grant or policy was changed or loosened.

Builder repair record only — not independently verified, not accepted.


## Upgrade-proof reshape (coordinator rule 9) — 11 October 2026 (Claude Sonnet, run on the Mac)

Test-only change to this piece's own upgrade proof, ordered by `PRACTICE-FACTS-1-proof-reshape.txt`. Starting head 51f24b9, clean tree. Only `packages/db/test/practice-facts.integration.test.ts` changed (plus this section). No product code, migration, merged test, fixture file or `migrate.ts` was touched. Builder repair record; not a review and not an acceptance.

**The rule the proof must satisfy (quoted from the order):** "An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'."

**What the old proof did wrong.** It installed everything before 0124, snapshotted whole rows, privileges, policies, triggers, two function definitions and the CHECK constraints, then ran `migrate()` to the head and required every snapshot unchanged. Any later migration that adds a column, trigger, policy or grant to a practice-feed table would have failed it.

**What it does now.**
1. The "before" state and its snapshot are unchanged.
2. 0124 is applied ALONE, as the runner applies one file: its SQL is run, then recorded in `public.jobguard_schema_migration` so a later `migrate()` skips it.
3. At that point every old comparison runs at full strength on the state after 0124 alone: rows byte for byte, privileges, policies, triggers, the two function definitions, the merged view equal to its earlier value, two catalogue CHECKs per table each validated, the six constraint names equal before and after and validated, and every old allowed value still present.
4. `migrate()` then runs twice (set-up); both succeed. 0124 is recorded once and after 0119; the row snapshot taken between the two runs is identical to the one taken after.
5. After all migrations the pre-existing rows of the three tables (found by their ids) are compared on the columns that existed before 0124, listed by name from the "before" catalogue; a column added later is ignored and a changed value fails. The tolerant check that every old allowed value is still allowed is repeated against the final catalogue. The trigger, policy, grant, function and constraint snapshots are NOT re-asserted after later migrations. The old closing line (a further `migrate()` leaves the rows unchanged) is kept.
6. Two controls were added as tests that run inside rolled-back transactions and leave the database as they found it.

**Where each old assertion now lives.** Rows, catalogues, merged view, two checks per table and validated, names, validated, old values subset: step 3 (unchanged strictness, taken on the state after 0124 alone). Applied once and in order, and the no-op re-migrate: step 4 and the kept closing line. New: named-column row comparison and the tolerant subset check after all migrations (step 5).

**Literal change (the whole diff of the file; `-` lines are before, `+` lines are after):**
```diff
@@ -7 +7 @@ import EmbeddedPostgres from "embedded-postgres";
-import { Pool } from "pg";
+import { Pool, type PoolClient } from "pg";
@@ -92,0 +93,6 @@ let upgradeRows:unknown, upgradeCatalogs:Awaited<ReturnType<typeof catalogs>>, u
+// Upgrade-proof reshape (coordinator rule 9): 0124 is applied ALONE and compared at full strength; every later migration then runs twice;
+// afterwards the pre-existing rows are compared by the names of the columns that existed before 0124.
+let alone:{rows:unknown;catalogs:Awaited<ReturnType<typeof catalogs>>;checks:Awaited<ReturnType<typeof catalogueChecks>>;perTable:{t:string;checks:{conname:string;def:string;convalidated:boolean}[]}[];view:PracticeFeedView};
+let runBetween:{first:unknown;second:unknown};
+let preColumns:Record<string,string[]>, preIds:Record<string,string[]>, namedBefore:Record<string,unknown[]>;
+const namedRows = async (db:Pick<Pool|PoolClient,"query">) => Object.fromEntries(await Promise.all(Object.keys(preColumns).map(async(t)=>[t,(await db.query(`SELECT ${preColumns[t]!.map(c=>`"${c}"`).join(",")} FROM app.${t} WHERE id=ANY($1::uuid[]) ORDER BY id`,[preIds[t]])).rows] as const))) as Record<string,unknown[]>;
@@ -116 +122,10 @@ beforeAll(async()=>{
-  await migrate(admin);await migrate(admin);
+  const columnRows=(await admin.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='app' AND table_name=ANY($1) ORDER BY table_name,ordinal_position",[tables.slice(2)])).rows;
+  preColumns=Object.fromEntries(tables.slice(2).map(t=>[t,columnRows.filter(c=>c.table_name===t).map(c=>c.column_name as string)]));
+  preIds=Object.fromEntries(await Promise.all(tables.slice(2).map(async t=>[t,(await admin.query(`SELECT id FROM app.${t} ORDER BY id`)).rows.map(r=>r.id as string)] as const)));
+  namedBefore=await namedRows(admin);
+  // Apply 0124 ALONE, the way the runner applies one file (run its SQL, then record it), and capture what it did.
+  const alonePath=fileURLToPath(MIGRATION_URLS[index]!);
+  await admin.query(await readFile(alonePath,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[alonePath.split("/").at(-1)]);
+  alone={rows:await rows(),catalogs:await catalogs(),checks:await catalogueChecks(),perTable:await Promise.all(tables.slice(2).map(async t=>({t,checks:(await admin.query("SELECT conname,pg_get_constraintdef(oid) def,convalidated FROM pg_constraint WHERE conrelid=$1::regclass AND contype='c' AND position('receipt-384' in pg_get_constraintdef(oid))>0",[`app.${t}`])).rows}))),view:await view(upgraded)};
+  // Then every later migration, twice; the second run must change nothing.
+  await migrate(admin);runBetween={first:await rows(),second:null};await migrate(admin);runBetween.second=await rows();
@@ -122,7 +137,4 @@ describe("PRACTICE-FACTS-1 real PostgreSQL (written first; NOT RUN in builder sa
-    expect(await rows()).toEqual(upgradeRows);expect(await catalogs()).toEqual(upgradeCatalogs);
-    expect(await view(upgraded)).toEqual(mergedBefore);
-    const applied=(await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r=>r.migration_name);
-    expect(applied.filter(n=>n==="0124_practice_feed_facts.sql")).toHaveLength(1);
-    expect(applied.indexOf("0119_recovery_eligibility_v3.sql")).toBeLessThan(applied.indexOf("0124_practice_feed_facts.sql"));
-    for(const t of tables.slice(2)){
-      const checks=(await admin.query("SELECT conname,pg_get_constraintdef(oid) def,convalidated FROM pg_constraint WHERE conrelid=$1::regclass AND contype='c' AND position('receipt-384' in pg_get_constraintdef(oid))>0",[`app.${t}`])).rows;
+    // 0124 applied alone: everything it did, at full strength.
+    expect(alone.rows).toEqual(upgradeRows);expect(alone.catalogs).toEqual(upgradeCatalogs);
+    expect(alone.view).toEqual(mergedBefore);
+    for(const {checks} of alone.perTable){
@@ -131 +143 @@ describe("PRACTICE-FACTS-1 real PostgreSQL (written first; NOT RUN in builder sa
-    const afterChecks = await catalogueChecks();
+    const afterChecks = alone.checks;
@@ -140,0 +153,14 @@ describe("PRACTICE-FACTS-1 real PostgreSQL (written first; NOT RUN in builder sa
+    // After every later migration, run twice: 0124 recorded once and in order, the second run changed nothing.
+    const applied=(await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r=>r.migration_name);
+    expect(applied.filter(n=>n==="0124_practice_feed_facts.sql")).toHaveLength(1);
+    expect(applied.indexOf("0119_recovery_eligibility_v3.sql")).toBeLessThan(applied.indexOf("0124_practice_feed_facts.sql"));
+    expect(runBetween.second).toEqual(runBetween.first);
+    // After ALL migrations: the pre-existing rows keep identical values in the columns that existed before 0124 (compared by name),
+    // and the original allowed values are still allowed (tolerant: a later migration may add more).
+    expect(await namedRows(admin)).toEqual(namedBefore);
+    const laterChecks = await catalogueChecks();
+    for (const previous of upgradeChecks) {
+      const now = laterChecks.find(c => c.table_name === previous.table_name && c.conname === previous.conname)!;
+      const nowValues = new Set(now.def.match(/'[^']*'|\b\d+\b/gu) ?? []);
+      expect((previous.def.match(/'[^']*'|\b\d+\b/gu) ?? []).every(value => nowValues.has(value))).toBe(true);
+    }
@@ -142,0 +169,26 @@ describe("PRACTICE-FACTS-1 real PostgreSQL (written first; NOT RUN in builder sa
+  it("upgrade-proof control: a changed value in a pre-existing column of a pre-existing row fails the named-column comparison (rolled back)",async()=>{
+    const client=await admin.connect();
+    try{
+      await client.query("BEGIN");
+      expect(await namedRows(client)).toEqual(namedBefore);
+      const changed=await client.query("UPDATE app.practice_feed_event SET source_hash=repeat('0',64) WHERE id=(SELECT id FROM app.practice_feed_event WHERE id=ANY($1::uuid[]) ORDER BY id LIMIT 1)",[preIds.practice_feed_event]);
+      expect(changed.rowCount).toBe(1);
+      expect(await namedRows(client)).not.toEqual(namedBefore);
+    }finally{await client.query("ROLLBACK");client.release();}
+    expect(await namedRows(admin)).toEqual(namedBefore);
+  });
+  it("upgrade-proof control: an added nullable column or an added trigger on a pre-existing table leaves the named-column comparison green (rolled back)",async()=>{
+    const beforeCatalogs=await catalogs();
+    const client=await admin.connect();
+    try{
+      await client.query("BEGIN");
+      await client.query("ALTER TABLE app.practice_feed_event ADD COLUMN scratch_note text");
+      await client.query("CREATE FUNCTION app.scratch_noop_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$");
+      await client.query("CREATE TRIGGER scratch_noop_trigger BEFORE INSERT ON app.practice_feed_event FOR EACH ROW EXECUTE FUNCTION app.scratch_noop_trigger()");
+      expect((await client.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='app.practice_feed_event'::regclass AND tgname='scratch_noop_trigger'")).rows[0].n).toBe(1);
+      expect((await client.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='app' AND table_name='practice_feed_event' AND column_name='scratch_note'")).rows[0].n).toBe(1);
+      expect(await namedRows(client)).toEqual(namedBefore);
+    }finally{await client.query("ROLLBACK");client.release();}
+    expect(await catalogs()).toEqual(beforeCatalogs);
+    expect(await namedRows(admin)).toEqual(namedBefore);
+  });
```

**Controls (both are in the file and passed).**
- Control (i), "a changed value in a pre-existing column of a pre-existing row fails the named-column comparison": inside a transaction the comparison first holds, then one pre-existing event row has its source hash column set to all zeros (one row changed), the comparison then differs (`not.toEqual`), and the transaction is rolled back; after the rollback the comparison holds again. Result: PASSED.
- Control (ii), "an added nullable column or an added trigger leaves the named-column comparison green": inside a transaction a nullable column and a no-op trigger (with its function) are added to the event table, both are confirmed present, and the named-column comparison is still equal; after the rollback the catalogue snapshot equals the one taken before. Result: PASSED. (A later migration that adds a column or trigger to a practice-feed table therefore no longer fails this proof.)

**Commands exactly as run this time.** Every shell call began with `export PATH="$HOME/Library/pnpm/bin:$PATH" VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2` and set `L=$HOME/.local/share/full-steam/jg-runs`. Worktree `W=/Users/benharwood/Claude/Projects/my-new-project/.worktrees/practice-facts-1`. Before each heavy command: `memory_pressure | tail -1` (79 percent free each time) and `sysctl -n vm.loadavg`; `heavy-slot` itself waits while load is above 24.
1. cwd `W`: `git rev-parse HEAD` printed 51f24b909811868d46bf14e13ccf7ce65e5ad02c; `git status --porcelain` printed nothing.
2. cwd `W/packages/db`: `cp test/practice-facts.integration.test.ts $HOME/.local/share/full-steam/jg-runs/practice-facts-1-proof-before-51f24b9.test.ts.txt` (a reference copy of the old file, outside the repository).
3. cwd `W/packages/db`: `~/.local/bin/heavy-slot practice-facts-1 pnpm exec vitest run --maxWorkers=2 test/practice-facts.integration.test.ts > $L/pf1-reshape-db1.log 2>&1` exit 0; 1 file passed; 28 tests passed (26 before plus the 2 controls).
4. cwd `W/packages/db`: `~/.local/bin/heavy-slot practice-facts-1 pnpm exec vitest run --maxWorkers=2 test/practice-feed.integration.test.ts test/recovery-eligibility-v3.integration.test.ts test/fingerprinted-row-shape.integration.test.ts > $L/pf1-reshape-db2.log 2>&1` exit 0; 3 files passed; 64 tests passed (merged files unedited; `git diff --name-only` listed only the leaf test file).
5. cwd `W`: `LANE_BASE_REF=origin/main pnpm lint:lanes > $L/pf1-reshape-lanes.log 2>&1` exit 0 ("Lane boundary passed").
6. cwd `W`: `~/.local/bin/heavy-slot practice-facts-1 pnpm --filter @jobguard/db typecheck > $L/pf1-reshape-typecheck.log 2>&1` exit 0. That script checks only `packages/db/src` (the db tsconfig includes `src/**/*.ts`), so it does not cover the test file.
7. cwd `W/packages/db`: an extra type check of the test file with an out-of-repository tsconfig (`$L/pf1-reshape-tsconfig-test.json`, extending the db tsconfig and including only this test file): `~/.local/bin/heavy-slot practice-facts-1 pnpm exec tsc -p $L/pf1-reshape-tsconfig-test.json > $L/pf1-reshape-testtypes.log 2>&1` exit 2, two errors in my new lines ("possibly undefined" at the column list lookup and at the migration list lookup). Fixed with two non-null assertions (included in the diff above). Re-run: `... > $L/pf1-reshape-testtypes2.log 2>&1` exit 0.
8. cwd `W/packages/db`: after those two fixes, `~/.local/bin/heavy-slot practice-facts-1 pnpm exec vitest run --maxWorkers=2 test/practice-facts.integration.test.ts > $L/pf1-reshape-db3.log 2>&1` exit 0; 1 file passed; 28 tests passed.

**Stopped on:** nothing. Applying 0124 alone needed no change outside the test file; no merged test failed; every existing assertion is kept at step 3 or step 5. No assertion, expected value, timeout, grant or policy was changed or loosened.

Builder repair record only — not independently verified, not accepted.

**Follow-up to the reshape (reviewer finding, same day).** The Opus reviewer found that the first version of the named-column comparison read values through the database driver, which returns a stored time only to the millisecond, so a change of under a millisecond to an existing row's creation time would have failed the old proof and passed the new one. Fix, `namedRows` only: it now returns canonical text from the database (`row_to_json(t)::text` over a sub-select of exactly the pre-0124 column names, id filter and ordering kept, the same form for the "before" capture, the "after" comparison and both controls), as the merged `recovery-follow-up-upgrade.integration.test.ts` does. Also added the reviewer's guard: each of the three tables must have at least one pre-existing row, so the comparison cannot be empty. Literal before and after (the whole diff of the follow-up):
```diff
-const namedRows = async (db:Pick<Pool|PoolClient,"query">) => Object.fromEntries(await Promise.all(Object.keys(preColumns).map(async(t)=>[t,(await db.query(`SELECT ${preColumns[t]!.map(c=>`"${c}"`).join(",")} FROM app.${t} WHERE id=ANY($1::uuid[]) ORDER BY id`,[preIds[t]])).rows] as const))) as Record<string,unknown[]>;
+const namedRows = async (db:Pick<Pool|PoolClient,"query">) => Object.fromEntries(await Promise.all(Object.keys(preColumns).map(async(t)=>[t,(await db.query(`SELECT row_to_json(t)::text AS bytes FROM (SELECT ${preColumns[t]!.map(c=>`"${c}"`).join(",")} FROM app.${t} WHERE id=ANY($1::uuid[])) t ORDER BY t.id`,[preIds[t]])).rows.map(r=>r.bytes as string)] as const))) as Record<string,string[]>;
+    for(const t of Object.keys(preColumns))expect(namedBefore[t]!.length).toBeGreaterThan(0);
```
Command as run (cwd `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/practice-facts-1/packages/db`, with `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2` exported): `~/.local/bin/heavy-slot practice-facts-1 pnpm exec vitest run --maxWorkers=2 test/practice-facts.integration.test.ts > $HOME/.local/share/full-steam/jg-runs/pf1-reshape2-db1.log 2>&1` exit 0; 1 file passed; 28 tests passed (the guard sits inside the existing upgrade test, so the count is unchanged). Also: `LANE_BASE_REF=origin/main pnpm lint:lanes` (cwd the worktree root) exit 0; the out-of-repository type check of the test file, `~/.local/bin/heavy-slot practice-facts-1 pnpm exec tsc -p $HOME/.local/share/full-steam/jg-runs/pf1-reshape-tsconfig-test.json` (cwd `packages/db`) exit 0.

**Second follow-up (separate check of the earlier head).** Two more gaps were found. (1) The proof recorded the pre-0124 column names but not their types, so a later change of a pre-existing column's type (for example the source hash column from fixed-length character to text) would have passed. It now records, before 0124, each pre-0124 column of the three tables as table name, column name and `format_type(atttypid, atttypmod)` (the full type including modifiers) from `pg_attribute` for non-dropped user columns, ordered by table then column name; it requires the list to have one entry per recorded column and to be identical after all migrations. Columns added later are ignored. (2) Two more controls, rolled back, using the same comparison functions as the proof: a change of one existing event row's creation time by one microsecond fails the row comparison; a change of the source hash column's type to text fails the type comparison (the retype was accepted inside the transaction, so no substitute was needed). Both passed (the file now has 30 tests). Literal before and after (the whole diff of this follow-up):
```diff
-let preColumns:Record<string,string[]>, preIds:Record<string,string[]>, namedBefore:Record<string,unknown[]>;
+let preColumns:Record<string,string[]>, preIds:Record<string,string[]>, namedBefore:Record<string,unknown[]>, typesBefore:{t:string;name:string;type:string}[];
+// Name and full type (with modifiers) of each pre-0124 column, in a fixed order; columns added later are ignored.
+const namedTypes = async (db:Pick<Pool|PoolClient,"query">) => (await db.query("SELECT c.relname t,a.attname name,format_type(a.atttypid,a.atttypmod) type FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE a.attrelid=ANY($1::regclass[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attname",[Object.keys(preColumns).map(t=>`app.${t}`)])).rows
+  .filter(r=>preColumns[r.t as string]!.includes(r.name as string)).map(r=>({t:r.t as string,name:r.name as string,type:r.type as string}));
-  namedBefore=await namedRows(admin);
+  namedBefore=await namedRows(admin);typesBefore=await namedTypes(admin);
+    expect(typesBefore).toHaveLength(Object.values(preColumns).flat().length);expect(await namedTypes(admin)).toEqual(typesBefore);
+  it("upgrade-proof control: a one-microsecond change to a pre-existing creation time fails the row comparison (rolled back)",async()=>{
+    const client=await admin.connect();
+    try{
+      await client.query("BEGIN");
+      expect(await namedRows(client)).toEqual(namedBefore);
+      const changed=await client.query("UPDATE app.practice_feed_event SET created_at=created_at+interval '1 microsecond' WHERE id=(SELECT id FROM app.practice_feed_event WHERE id=ANY($1::uuid[]) ORDER BY id LIMIT 1)",[preIds.practice_feed_event]);
+      expect(changed.rowCount).toBe(1);
+      expect(await namedRows(client)).not.toEqual(namedBefore);
+    }finally{await client.query("ROLLBACK");client.release();}
+    expect(await namedRows(admin)).toEqual(namedBefore);
+  });
+  it("upgrade-proof control: a type change of a pre-existing column fails the type comparison (rolled back)",async()=>{
+    const client=await admin.connect();
+    try{
+      await client.query("BEGIN");
+      expect(await namedTypes(client)).toEqual(typesBefore);
+      await client.query("ALTER TABLE app.practice_feed_event ALTER COLUMN source_hash TYPE text");
+      expect(await namedTypes(client)).not.toEqual(typesBefore);
+    }finally{await client.query("ROLLBACK");client.release();}
+    expect(await namedTypes(admin)).toEqual(typesBefore);
+  });
```
Commands as run (cwd `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/practice-facts-1/packages/db`, with `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2` exported): `~/.local/bin/heavy-slot practice-facts-1 pnpm exec vitest run --maxWorkers=2 test/practice-facts.integration.test.ts > $HOME/.local/share/full-steam/jg-runs/pf1-reshape3-db1.log 2>&1` exit 0; 1 file passed; 30 tests passed. `LANE_BASE_REF=origin/main pnpm lint:lanes` (cwd the worktree root) exit 0. `~/.local/bin/heavy-slot practice-facts-1 pnpm exec tsc -p $HOME/.local/share/full-steam/jg-runs/pf1-reshape-tsconfig-test.json` (out-of-repository type check of the test file) exit 0.

## Catch-up and renumber 0124 to 0131 (12 Oct)

Claude Sonnet, run on the Mac, 12 October 2026. Branch head before this round: `862fb126849dd7bf0ebb42d01f8142d2d14e8e08` (clean worktree). `origin/main` when merged: `80d4a06c1fb0c9afd1edf2aadd069b4b56e232af` (it moved to `18743cb` (CI-TIME-2, #150) while the round ran; `git merge-tree` of that commit against this branch reports no conflict; it was not merged here).

**Merge.** `git merge origin/main` (merge commit `5f2d675`, no rebase, no force). Four files conflicted, all append-only lists, all resolved by keeping both sides (main's lines first, this piece's after):
- `BUILD_PLAN.md` (section 12.2 ledger): main's STORED-TIMES-1 11 October and both SV-2 paragraphs kept, then this piece's own 11 October paragraph.
- `config/agent-lane-assignments.json`: main's `plan-sv2-dw3-split` line kept, then this piece's `practice-facts-1` line (JSON parses).
- `packages/db/MIGRATIONS.md`: main's 0127 and 0128 sections kept, then this piece's section.
- `packages/db/src/migrate.ts`: main's `0127_recovery_timing_pin.sql` and `0128_shadow_persistence.sql` lines kept, then this piece's line.
No conflict was inside this piece's own logic or tests; no other file conflicted.

**Renumber 0124 to 0131 (commit `3517e34`).** `git mv packages/db/migrations/0124_practice_feed_facts.sql packages/db/migrations/0131_practice_feed_facts.sql`. SHA-256 before (`git show 862fb12:...0124_practice_feed_facts.sql`): `00c2209f144443a5f7b23c94ed410873b9adc41849351c94e0b8da2e3f422cd0`. SHA-256 after (`shasum -a 256` of the 0131 file): `00c2209f144443a5f7b23c94ed410873b9adc41849351c94e0b8da2e3f422cd0`. Equal; the SQL bytes are unchanged and contain no migration number. Registered last in `migrate.ts` (after 0128; the list ends ...0128, 0131 until #146 (0129) and #138 (0130) land). The number was swapped in: the lane line `practice-facts-1` only (its `allow` entry), `packages/db/test/practice-facts.integration.test.ts` (13 lines; the upgrade proof finds the migration by name), `docs/contracts/practice-facts-v1.md` (one line), the `packages/db/MIGRATIONS.md` section (now `## 0131`, with the renumber note) and one new BUILD_PLAN section 12.2 ledger paragraph. Earlier sections of this receipt, the 11 October BUILD_PLAN paragraph, other pieces' paragraphs and `SOURCE_PRESERVATION.json` (a historical list of the files at that time) still say 0124 on purpose; no other piece's number was touched.

**Commands as run** (worktree root unless stated; every Mac run through `~/.local/bin/heavy-slot pf1-<label>`, one at a time, `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`, `--maxWorkers=2`, free memory 66-68% before each run):

| Run | Command | Exit | Result |
|---|---|---|---|
| builds, each alone | `pnpm --filter @jobguard/core build`, then `db`, `storage`, `config`, `ai` | 0 each | built |
| one-file tsc | `node ~/.local/share/full-steam/jg-runs/mig-order-4-scratch/round1-tsc-one-file.cjs <worktree> packages/db/test/practice-facts.integration.test.ts` (the only test file `git diff --name-only origin/main...HEAD -- packages/db/test` lists) | 0 | 0 diagnostics |
| own DB file | `packages/db`: `pnpm exec vitest run --maxWorkers=2 test/practice-facts.integration.test.ts` | 0 | 1 file, 30 tests passed (includes the upgrade proof and its four controls) |
| neighbours 1 | `packages/db`: `test/practice-feed.integration.test.ts test/recovery-cases.integration.test.ts test/recovery-messages.integration.test.ts` | 0 | 3 files, 137 tests passed |
| neighbours 2 | `packages/db`: `test/recovery-timing-pin.integration.test.ts test/extra-origin-upgrade.integration.test.ts test/recovery-follow-up-upgrade.integration.test.ts` | 0 | 3 files, 31 tests passed |
| neighbours 3 | `packages/db`: `test/audit-export.integration.test.ts test/tenancy.integration.test.ts test/demo-bootstrap.integration.test.ts` | 0 | 3 files, 24 tests passed |
| core unit | `packages/core`: `pnpm exec vitest run --maxWorkers=2 src/practice-facts.test.ts` | 0 | 1 file, 22 tests passed |
| API unit | `apps/api`: `pnpm exec vitest run --maxWorkers=2 src/practice-facts.application.test.ts src/practice-facts.controller.test.ts` | 0 | 2 files, 47 tests passed |
| OpenAPI file | `apps/api`: `pnpm openapi:check` | 0 | `apps/api/openapi.json` current |
| typecheck | `pnpm typecheck` | 0 | 7 of 7 tasks successful |
| lint | `LANE_BASE_REF=origin/main pnpm lint` (run after the rename was committed) | 0 | core purity, lane boundary, money arithmetic, commercial boundary and 7 of 7 package lints passed |
| lane lint | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | passed for lane `practice-facts-1`, 28 files |

A first `pnpm lint` and `pnpm lint:lanes` run, made with the rename staged but not yet committed, exited 1 with "Lane practice-facts-1 cannot edit: packages/db/migrations/0124_practice_feed_facts.sql": the lane lint counts the staged deletion of the old path, which the lane no longer allows. Committing the rename (`3517e34`) cleared it; both then exited 0 as shown. Nothing was changed to make it pass.

**NOT RUN.** `apps/web/e2e/PRACTICE-FACTS-1.spec.ts` and any browser test; the web and API builds; the remaining core and API suites (for example the watchdog tests) and the full `pnpm test`; the full database suite (only the files named above); GitHub CI on the new head.
