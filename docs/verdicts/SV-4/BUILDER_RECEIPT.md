# SV-4 — builder receipt, continuation round 1

Builder: Codex GPT-6.1 Sol. Issued 12 October 2026 by the dispatcher. Branch `codex/sandbox/sv-4`, LOCAL. SV-2 base `262f939`; resumed saved draft head `cac7c15`. That saved head was the builder's interrupted draft, not acceptance. No commit/add/checkout/fetch/push was performed. Dispatcher owns committing the working tree; intended message: `/private/tmp/jg-msg-sv-4.txt`.

Builder receipt only — not independently verified, not accepted.

## Audit of the interrupted session and continuation edits

The criterion-by-criterion initial checklist is [DRAFT_AUDIT.md](DRAFT_AUDIT.md). The interrupted session left 38 files/1,923 inserted lines/4 deleted lines but no builder receipt, no self-review and no trustworthy final verification record. Most requested behavior and tests existed. Missing: real two-database API isolation (the existing API test was scripted only); actual protected INSERT/mutation and lock/disposition composite-key attacks across every new table. Wrong: the new SQL lock/review path also admitted `pilot_no_charge`; the lane note was abbreviated rather than the issued line. Self-review also found baseline rows included in the extras capture register (contrary to the exact F12 register total) and a Vitest Pool.connect overload typing error in an uncompiled DB test. This continuation adds coverage, restricts that new path to synthetic mode, restores the exact issued lane line, fixes the test spy overload and excludes baseline entries from the extras register. The complete account-revision fingerprint remains bound through each line source; the corruption proof now also mutates that revision. The F12 proof adds assertions on the entire register (not merely a filtered subset). It does not weaken or delete any existing assertion.

## Criteria and named evidence

BUILT below means implemented with test assertions, not a claim that PostgreSQL or Playwright passed. Paths under `packages/db/test` are real PostgreSQL tests and are NOT RUN here. API isolation now also needs PostgreSQL.

| Criterion | Status | Files and named tests |
|---|---|---|
| B1 baseline/capture-only account | BUILT | Existing `FinalAccountCommandService` assembler/read reused by `final-account-lock.application.ts`; lock review also lists every capture state. DB: `DW1 capture includes every state, £3,200 logged and £400 reviewed; post-lock review writes nothing`; API real isolation compares the full account projection. |
| B2 review prompt | BUILT | `core/src/final-account-lock.ts`, web `final-account-lock.tsx`; core `preserves exact declaration, prompt, check text and only the four terms statements`; browser `DW2/DW4/DW9: persisted completion survives reload, Jobs and a second browser`. |
| B3 final_review extras | BUILT | Additive `VariationRepository.addFinalReviewExtra`, shared SH-1 identity/price/origin contract; API `final-review proposal uses the server origin and existing exact price contract`; DB DW1 and `synthetic-only lock and final-review routines refuse a pilot track without writes`. |
| B4 dispositions | BUILT | `0132` append-only `final_account_scope_disposition`, `record_final_account_disposition`; DB DW2 and `C4 lock and disposition composite keys reject foreign tenants and same-tenant wrong jobs`. Removed/deferred change no money. |
| B5 declaration | BUILT | Closed declaration/version and exact button text; core strict commands and fixed text test; DB controlled lock routine. |
| B6 atomic lock | BUILT | `0132 lock_final_account`, repository/application/controller/Next route; DB DW4 replay/concurrency and `audit failure rolls back lock and its command receipt atomically`. |
| B7 final/supplementary invoice | BUILT within Q1 | New routine/command/UI with invoice and line side bindings. DB `F7 main £40,320 and supplementary £960 bind exact source lines, replay once and never rebill the baseline`. Catch revision is a test-only fixture; real catch flow HELD for SV-5. |
| DW1 every pre-lock capture | BUILT | `final-account-lock.integration.test.ts` DW1 records all five states, exact 360000 pence for the entire extras register, no baseline entries, both origins, and post-lock review no-write refusal; core `sums exact F12 captures and retains unknown values and all states in the digest`. |
| DW2 disposition/terms | BUILT | DB `DW2 refuses missing dispositions and terms through repository and runtime routine without side effects`; strict schema and browser refused lock. |
| DW3 immutable hash reconstruction | BUILT | Delegates to SV-1 snapshot plus three additive component hashes; DB `DW3 recomputes all source hashes and detects separate capture, line and disposition corruption` also tests account-revision corruption; core `delegates to the SV-1 snapshot and verifies all source bindings`. |
| DW4 replay/double/second browser | BUILT | DB `DW4 replay, altered payload and two concurrent commands create one lock and one matching audit event`; `capture and lock sharing one command identity serialize before receipt claim without deadlock`; browser persisted completion/second context. |
| DW5 immutable lock | BUILT | DB `DW5 runtime, shadow and migration owner cannot mutate the lock; later revisions do not change it`; additional all-table SQL mutation tests. |
| DW6 locked-job reveal | BUILT | `final-account-lock-reveal.integration.test.ts`: `a genuinely locked job reveals only revealed rows for that tenant and job; unlocked and cross-tenant jobs yield none`, `the reveal function's EXECUTE grantees stay migration owner and runtime only`. This implements the positive half SV-2 deferred; execution/verification remains owed on Mac/CI. |
| DW7 fail-closed issue and races | BUILT within Q1 | `final-account-lock-invoice.integration.test.ts`: missing lock/no completion/pending/failed repository AND direct routine refusals; exact lock/microsecond-cutoff FK; foreign-tenant completion; latest failed overrides completion; concurrent completed/pending/failed facts; F7; interim side row no lock. Core `guards final and supplementary issue against absent, pending, failed and misbound checks`; controller typed errors; browser `DW7: pending and failed reconciliation refuse both invoice kinds in commands and UI` and `DW7: another lock or cutoff cannot complete this job's check in commands or UI`. |
| DW8 identical builder boundary | BUILT | Scripted API read test retained and labelled. Added API `identical seeded databases with zero/25 evidence-linked held signals have identical review, lock replay and post-lock bytes; runtime statements never name shadow tables`; real DB fixture copies exact public history and retains 25 private evidence links. Generated lock identity/time is copied as immutable history before comparing replay bytes; independent first creations are not falsely claimed byte-identical. DB zero/25 persisted-view/replay test and browser fixed-view fixtures retained. |
| DW9 refresh/Jobs authoritative state | BUILT | Browser persisted-completion test asserts `V('lock-state','Final account completed')` after reload/Jobs, second context, banner, keyboard focus, 44px target, no overflow, pounds to two decimals. Both configured projects owed. |
| C1/C2 vertical/service seam | BUILT | One shared application, four Next routes, Nest controller, appended exports/registrations/generated OpenAPI; controller `all four lock commands and read use the shared application`. Invoice command uses the new `/final-account/lock` POST with closed version `lock-bound-invoice.issue.v1`; no new legacy invoice transport implementation. |
| C3 synthetic | BUILT | PracticeAccess verifies synthetic principal/job; application production and unauthenticated refusals; SQL synthetic-only track test; `.invalid` recipient, fixed sandbox banner, no external send/provider/fee. |
| C4 catalogue/tenant/money | BUILT | Six owned tables, FORCE RLS, exact grants/owners/routine grantees; actual runtime INSERT/mutation refusal; composite FK tests; upgrade/fingerprint/grant proof; exact F7/F12 sums with merged primitives. |
| C5 boundaries/authorization | BUILT | Core strict versioned input/server-fact rejection; API unowned-job, unauthenticated/production rejection; DB owner/tenant/wrong-job/missing-context tests; inline approved exact invoice Decision; receipts and audit atomic. |
| C6 executed evidence | HELD for DB/browser | Only allowable local checks can run here; exact results recorded below. No mocked test is a database proof. |
| C7 specified UI | BUILT | Requested strings/states and browser accessibility/money/persistence assertions only; polish parked. |
| C8 verdict/acceptance | HELD | Lane present. Fresh independent Claude Opus verdict AND separate Sol check on dispatcher commit, separate technical acceptance, green CI, then founder-authorized merge/release. Builder does not accept its own work. |

## HELD and owed work

The older invoice-without-lock path is NOT guarded yet; 'no unguarded final-invoice path remains' is HELD and owed by SV-5.

Q1: existing practice invoice routine/repository/transport and roughly ten existing unlocked-invoice tests remain unchanged. The legacy UI body is preserved inside an additive wrapper; lock-flow buttons use only the new path. Q2: SV-5 owes evidence-complete runs and completion writing, including zero-result processing; this leaf stores facts only. Q3: only four exact §10.2.10 statements and synthetic version are used; other terms, real onboarding/pilot disclosures are founder-held D12/D13. Q4 adopted: only three appended SV-1 hash exports/tests; no replacement canonicaliser in core. Q5: later catch revision fixture only, real confirmation/reveal/catch path is SV-5. Q6: interim kind is a side-table value only, no interim issue route. Q7: no financial effect of removed/deferred. Q8: owner only; widening held. Q9: fixed running-check text/pending disabled state; failed displays typed error. UI polish, work-state/post-lock rules (CH-4), detector (SV-3), fees/allocations and production work remain outside this lane. D12, D13, G1 and applicable real-data/release gates remain unresolved.

## Migration 0132 and integrator ledger

`packages/db/migrations/0132_final_account_lock.sql` registers after 0128 (and any lower migration integrated before merge). Adds SIX tables: `final_account_lock`, `final_account_scope_disposition`, `final_check_terms_acceptance`, `final_account_lock_check`, `final_account_invoice_binding`, `final_account_invoiced_line`. Six tables rather than the older five-table draft implements the issued fingerprinted-table side-binding rule. It alters NO existing table columns/constraints, rewrites NO existing rows, changes NO existing grant/policy/role/routine. Adds serialization triggers on existing `command_receipt`, `variation`, `final_account_revision`, `final_account_line`; mutation/check/line-validation triggers on its own tables. Fingerprinted tables, including customer_invoice, retain their full shape.

Runtime SELECT only on all six. Shadow INSERT only on `final_account_lock_check`, with a tenant policy and INVOKER trigger; no SELECT, new callable helper, or other grant for that role. All six migration-owned/FORCE RLS/append-only. Tenant-only terms acceptance intentionally has no job key. EXECUTE: migration owner + runtime only on `accept_final_check_terms`, `record_final_account_disposition`, `lock_final_account`, `issue_lock_bound_customer_invoice`, `read_final_account_lock_verification`, `prepare_final_review_extra`. Migration owner only on `guard_final_account_lock_check`, `guard_final_account_invoiced_line`, `final_lock_canonical`, `final_lock_hash`, `final_lock_require_owner`, `append_final_lock_audit`, `read_final_account_lock_sources`, `serialize_final_account_source`, `serialize_final_review_receipt`. No new function has PUBLIC EXECUTE. SV-2 routines/grantees are unchanged. Source/job locks precede receipt/audit head; check append/issue shares advisory serialization. No business network call occurs in a transaction.

Rule 9 proof: install before 0132, seed existing invoices, snapshot named columns/types/PK identities and canonical row text, apply 0132 alone/compare, apply later migrations twice/compare. Rolled-back controls: one-microsecond change and pre-existing column retype fail; nullable column, replaced fixture function and later inserted row pass. At least one pre-existing row is required per compared table. Fingerprinted-column guard is separate. Catalog compares pre-existing grants, schemas, role posture and membership around 0132; new objects tested separately. Forward-fix with an additive migration; never delete immutable locks/invoices/history. No data backfill.

Integrator-owned BUILD_PLAN §12.2 ledger sentence: the allocation first written here as 0130 (`0130_final_account_lock.sql`) was renumbered to **0132** on 12 October 2026; the new ledger paragraph is in BUILD_PLAN.md §12.2 ("Ledger amendment — SV-4, 12 October 2026 (catch-up renumber, merge-ahead ruling)"). The dated sections below (Mac verification record, Round 2 repair) were written before the renumber and still use the old name; see "Mac verification (12 Oct, round 2)" for the rename and the hashes.

Shared overlaps serialize with integrator: lane registry, `migrate.ts`, MIGRATIONS, core/db indexes, tenancy catalogue rows (SV-3/M4-8-S); watchdog registry, app.module/workspace registrations and OpenAPI (M4-8-S). No other lane's owned file changes. Regenerate OpenAPI after integration/rebase.

## Exact edits to existing tests

Relative to SV-2 base 262f939: `packages/core/src/shadow-domain/lock.test.ts` adds one describe block with two tests after the existing final byte; no pre-existing statement/assertion changed. `packages/db/test/tenancy.integration.test.ts` adds six catalogue rows in each of the RLS/guard and ownership arrays (12 rows total), with no assertion changed. UIWIRE-12 and demo-bootstrap tests require no count change because they already use MIGRATION_URLS length. No other pre-existing test changes, including authentication context-boundary, its pinned files, SV-2 catalogue/allowed-routines list and legacy unlocked invoice tests. Continuation edits only new SV-4 tests. Preservation hashes/stat audit recorded in self-review below.

## Commands and results

All primary commands ran from `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv-4`. Filtered Vitest reports its package working directory (`packages/core` or `apps/api`). Dependencies were already installed; no clean install was claimed and no package download was requested. Node v24.17.0 observed; .nvmrc says v24.15.0 (engine permits Node 24). Cached pnpm **10.28.1** confirmed.

The system `pnpm --version` probe stalled in the pnpm 11 wrapper, emitted its existing package-field warning and was interrupted (exit 130). A second early read-only version probe returned only that warning and no version; no previous-session command result is adopted. To prevent manager auto-selection/network behavior, a temporary `/private/tmp/jg-sv4-bin/pnpm` invokes the already-cached `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs "$@"`. All subsequent pnpm commands have the exact common prefix `PATH=/private/tmp/jg-sv4-bin:$PATH COREPACK_ENABLE_NETWORK=0`; no package/script/lockfile changed. `pnpm --version` with that prefix: exit 0, 10.28.1.

| Actual command after common prefix | Exit | Observed result/count |
|---|---:|---|
| `pnpm typecheck` | 0 | 7/7 Turbo tasks successful; 2 cached; 48.413s |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Core purity 131 TS files; lane sv-4 passed; money/commercial boundary checks; 7/7 package tasks, 2 cached; 43.219s |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | sv-4 lane passed; merge-base comparison, head cac7c15 plus working tree/untracked paths |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/final-account-lock.test.ts src/shadow-domain/lock.test.ts` | 0 | 2 files, **9 tests passed**, 0 failures; 759ms |
| `pnpm turbo run build --filter=@jobguard/api...` | 0 | 6/6 tasks, 2 cached; 27.282s |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/final-account-lock.controller.test.ts src/final-account-lock.application.test.ts` | 0 | 2 files, **19 tests passed**, 0 failures; 1.43s; scripted service/controller evidence only |
| `pnpm build` | 0 | 7/7 tasks, 2 cached; Next production build generated 27/27 static pages and dynamic lock routes; 1m21.856s |
| `pnpm openapi:check` | **1** | Sandbox failure before checker execution: tsx CLI `listen EPERM` on its local IPC pipe. Not a stale-contract result. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | The **same existing OpenAPI checker** via Node loader, avoiding the tsx CLI IPC socket; committed document matched, no source/script changed. |

28 bounded unit tests passed; zero DB or browser tests executed. Non-fatal build/check warnings: shared Turbo cache writes outside the sandbox were denied; existing Next workspace-root/multiple-lockfile warning; existing `practice-receipts.module.css` autoprefixer `end` warning. Those files are untouched. The final self-review SQL/register correction does not change TypeScript application code or the unit-tested pure core; its new DB assertions were statically compiled after the correction, and SQL execution remains explicitly NOT RUN.

Additional static commands from the same root (not database execution): `git diff --check 262f939` exit 0, no whitespace diagnostics; the one-off Python preservation audit exit 0 (14 byte-identical protected/dependency files, additive SV-1 prefix checks, unchanged legacy UI body, only two pre-existing tests changed); hashes retained in [PRESERVATION.json](PRESERVATION.json). No standing test freezes other leaves' files. A TypeScript createProgram check found 1 draft diagnostic (Pool.connect spy overload); after changing `mockResolvedValue(client)` to `mockImplementation(async()=>client)` the same three-entry check returned 0 diagnostics. A second three-entry upgrade/browser check returned 0 diagnostics. A final one-entry F12/source-revision check returned 0 diagnostics. All commands below were `node --input-type=module` here-doc invocations, exit sequence **1, 0, 0, 0**, and no test/runtime database operation occurred:

```js
import ts from 'typescript';
// Runs 1/2 (same files):
const files=['packages/db/test/final-account-lock.integration.test.ts','packages/db/test/final-account-lock-invoice.integration.test.ts','packages/db/test/final-account-lock-reveal.integration.test.ts'];
// Run 3 substitutes:
// ['packages/db/test/final-account-lock-upgrade.integration.test.ts','apps/web/e2e/SV-4.spec.ts','apps/web/e2e/helpers/final-account-lock-journey.ts']
// Run 4 substitutes: ['packages/db/test/final-account-lock.integration.test.ts']
const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile);
const options=ts.parseJsonConfigFileContent(config.config,ts.sys,'.').options;
const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram(files,{...options,noEmit:true}));
if(diagnostics.length)process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:ts.sys.getCurrentDirectory,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
// Each run printed its entry-file count/diagnostic count and that it executed no DB/browser test.
process.exitCode=diagnostics.length?1:0;
```

## NOT RUN

Each database/browser item: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.

- `packages/db/test/final-account-lock.integration.test.ts`
- `packages/db/test/final-account-lock-reveal.integration.test.ts`
- `packages/db/test/final-account-lock-invoice.integration.test.ts`
- `packages/db/test/final-account-lock-upgrade.integration.test.ts`
- `apps/api/src/final-account-lock.isolation.test.ts` (now includes real PostgreSQL; retained scripted assertions are not an integration substitute)
- `packages/db/test/tenancy.integration.test.ts`, `UIWIRE-12.integration.test.ts`, `demo-bootstrap.integration.test.ts`, `shadow-catalog.integration.test.ts` and remaining mandatory DB regressions via `pnpm test:db` / `pnpm test:migrations`
- Playwright `SV-4.spec.ts`, `UIWIRE-9.spec.ts`, `UIWIRE-10.spec.ts`, `customer-invoice.spec.ts`, `final-account.spec.ts`, both mobile-360/desktop, plus existing mandatory browser regressions.

Whole repository/package Vitest suites not run under binding memory rule: only new/changed test files, at most three, maxWorkers=2, one run at a time. Unchanged `watchdog.test.ts` and `watchdog-registry.test.ts` are not run under that more specific rule; their checks remain owed on Mac/CI, with no test edits to evade the limit. `pnpm eval` inapplicable: no prompt/model/parser/AI policy change. No live provider, browser screenshot or professional approval claimed.

## Self-review

Builder self-review, source-inspected against **the whole 262f939-to-working-tree diff**, including the initial 38-file saved draft and every continuation edit. This is not an independent model verdict.

- Re-read the issued addendum/header/draft, applicable AGENTS/plan contracts and test names. Checked B1–B7/DW1–DW9, F7/F12 exact pence and fixed review/declaration/terms/check strings. Corrected F12's baseline-in-register error with stronger whole-register assertions; preserved all existing assertions.
- Checked strict command boundaries, synthetic principal/job ownership, owner re-check after the job lock, inline exact invoice approval, receipt identity/payload conflicts, audit rollback and source/job-before-audit ordering. No business network call/provider adapter is added. New SQL lock/review paths now admit only synthetic_demo; earlier LogBuilderExtra behavior remains unchanged.
- Inspected all six new table DDL, tenant/job-qualified FKs, non-null tenant IDs, FORCE RLS, migration ownership, append-only statement triggers, exact callable/private routine grantees and shadow INVOKER check guard. Invoice issue re-checks latest completed fact under its advisory lock; supplementary source selection excludes prior invoiced identities and rejects source corrections. Actual SQL denial/race/constraint behavior still needs PostgreSQL.
- Checked canonical hashes delegate to SV-1 in core, component stable-ID ordering, source-row fingerprints, UTC/microsecond timestamps, immutable lock reconstruction and privileged-bypass corruption tests. Account revision now participates in the line-set hash; baseline is separately bound instead of counted as extra capture. SQL/core parity is asserted before transaction commit, but its database execution remains unverified.
- Checked Rule 9 step boundary, canonical named-column text/full types/PK identities, seeded-row guards, later-migrations-twice behavior, all rolled-back controls and separate fingerprinted-column guard. No later-functions/all-whole-row freeze added.
- Checked no private signal read in builder source/routines and real zero/25 evidence-linked isolation setup. Exact lock replay compares the same copied persisted history, since independent random IDs/time naturally differ. Runtime-client statements are traced; this is not an assertion that PostgreSQL internal statement logging was executed here.
- Checked UI persistence/reload/Jobs/second context and requested refusal/accessibility/money assertions in the browser source only. No UI polish added. Added wrong-lock/cutoff refusal assertions; DOM rendering/layout/focus/timing/browser state remains unverified.
- One-off preservation audit recorded byte hashes of authentication scanner and seven pinned bridges, practice invoice repository, 0095/0128 migrations, SV-2 catalogue, UIWIRE-12 and demo-bootstrap tests, and legacy practice UI body. No protected or earlier invoice test changed. SV-1 source and test retain exact prefixes, with only appended exports/tests. Tenancy changes are precisely twelve catalogue rows. BUILD_PLAN, packages/lockfile, provider/config/decision files and other lanes are untouched.
- Checked lane scope, registration append behavior, Rule 11 generated credentials, Rule 12 absence of permanent other-file pinning tests, no held detector/catch/reconciliation completion/policy/fee feature built. Shared overlaps and owed ledger/independent review/acceptance are listed above.
- Local checks and their limitations are separated from source inspection; standard OpenAPI command failure remains recorded alongside the successful same-checker loader run. Real PG16 grants/RLS/catalogues/migrations, SQL hash parity, rollback/concurrency, browser projects/regressions and release approvals are NOT independently verified. **Technical acceptance remains HOLD pending those external checks and the issued independent verdicts.**

## Changed files and cleanup

All changed implementation/test paths are the issued 38-file saved draft paths; continuation updates only its owned SQL/contract/tests/lane entry and adds this receipt, initial audit and preservation evidence. Full path list follows (relative to 262f939; receipt evidence is untracked until dispatcher commit). No generated binary or screenshot artifact is included. Generated dist/.next/Turbo logs, tsbuildinfo, .pnpm-store and test-results artifacts are removed before handoff; installed node_modules is retained. Cleanup executed successfully (exit 0). The final one-off path audit initially hit an assertion because Python fnmatch treats [id] as glob syntax; its corrected comparison accepts exact path matches first. Final lane/preservation/credential-text/artifact inspection passed (exit 0), and final git diff --check returned 0. Final tracked diff versus 262f939: **38 files, 2,079 insertions, 4 deletions**, plus the three new receipt/audit/preservation files (41 paths total). Continuation touched eight saved-draft paths; no commit was created.

- `apps/api/openapi.json`
- `apps/api/src/app.module.ts`
- `apps/api/src/final-account-lock.application.test.ts`
- `apps/api/src/final-account-lock.application.ts`
- `apps/api/src/final-account-lock.contracts.ts`
- `apps/api/src/final-account-lock.controller.test.ts`
- `apps/api/src/final-account-lock.controller.ts`
- `apps/api/src/final-account-lock.isolation.test.ts`
- `apps/api/src/workspace/application.ts`
- `apps/api/src/workspace/index.ts`
- `apps/web/app/api/jobs/[id]/final-account/dispositions/route.ts`
- `apps/web/app/api/jobs/[id]/final-account/lock/route.ts`
- `apps/web/app/api/jobs/[id]/final-account/review-extras/route.ts`
- `apps/web/app/api/jobs/[id]/final-account/terms/route.ts`
- `apps/web/app/ui/customer-invoices.tsx`
- `apps/web/app/ui/final-account-lock.tsx`
- `apps/web/app/ui/job-final-account.tsx`
- `apps/web/e2e/SV-4.spec.ts`
- `apps/web/e2e/helpers/final-account-lock-journey.ts`
- `config/agent-lane-assignments.json`
- `docs/contracts/final-account-lock-v1.md`
- `docs/verdicts/SV-4/BUILDER_RECEIPT.md`
- `docs/verdicts/SV-4/DRAFT_AUDIT.md`
- `docs/verdicts/SV-4/PRESERVATION.json`
- `packages/core/src/final-account-lock.test.ts`
- `packages/core/src/final-account-lock.ts`
- `packages/core/src/index.ts`
- `packages/core/src/shadow-domain/lock.test.ts`
- `packages/core/src/shadow-domain/lock.ts`
- `packages/core/src/watchdog.ts`
- `packages/db/MIGRATIONS.md`
- `packages/db/migrations/0132_final_account_lock.sql`
- `packages/db/src/final-account-lock-repository.ts`
- `packages/db/src/index.ts`
- `packages/db/src/migrate.ts`
- `packages/db/src/variation-repository.ts`
- `packages/db/test/final-account-lock-invoice.integration.test.ts`
- `packages/db/test/final-account-lock-reveal.integration.test.ts`
- `packages/db/test/final-account-lock-upgrade.integration.test.ts`
- `packages/db/test/final-account-lock.integration.test.ts`
- `packages/db/test/tenancy.integration.test.ts`

Builder receipt only — not independently verified, not accepted.

## Mac verification (12 Oct)

Run by the JobGuard dispatcher's Mac helper (Claude Sonnet 5.5), 12 Oct 2026, in the worktree `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv-4`, branch `codex/sandbox/sv-4`. This is the first time any SV-4 database, API-with-database or browser test ran. Start: 8d176a9 (clean). Step 1: `git fetch origin`, then `git merge origin/main` (17c82ee) made merge commit 860d34b with NO conflicts; migration 0130 kept and registered after 0128 in `migrate.ts` (0127 and 0128 now precede it; 0129 untouched). No product file was changed. Every edit below is in SV-4's own test or e2e files.

### Fixture fixes (all four test-only; no assertion, deadline or timeout changed or removed)

1. `packages/db/test/final-account-lock.integration.test.ts`, three `app.evidence_object` inserts (old lines ~93 in `createApplicationIsolationFixture`, ~216 and ~232 in the DW8 test). Before: `INSERT INTO app.evidence_object(... kind 'original' ...)` with no `upload_id`. Migration 0002 `evidence_object_kind_ck` requires an `upload_id` for kind `original`, and `upload_id` references `app.evidence_upload`. Error seen: `new row for relation "evidence_object" violates check constraint "evidence_object_kind_ck"`. After: a new exported helper `insertFixtureOriginalEvidence(pool, tenantId, jobId, scopeItemId, evidence, objectVersion)` inserts the `evidence_upload` parent (same transaction, same object key, `synthetic/<id>`) and then the same `evidence_object` row with `upload_id`; the three sites call it. Same parent-first pattern as the merged `shadow-persistence.integration.test.ts` fixtures. Fixture-only: it only creates the parent row the product schema requires; the evidence values, hashes, signals and every `expect` are unchanged.
2. `packages/db/test/final-account-lock.integration.test.ts`, `createApplicationIsolationFixture` (used by the API isolation test). Before: `INSERT INTO control_plane.practice_session(token_digest)` run directly as the superuser. Error: `session fixture requires migration owner` (SQLSTATE 42501, raised by the merged trigger `app.seed_saved_v1_sample` from migration 0109, which insists on `current_user = 'jobguard_migration'`). After: `SELECT app.issue_practice_session($1)`, the product's own SECURITY DEFINER routine (migration 0094; the fixture already created the exact membership it checks). Fixture-only: it changes how the test session is created, not what is asserted.
3. `apps/api/src/final-account-lock.isolation.test.ts`. Before: `const fixturePath = "../../../packages/db/test/final-account-lock.integration.test.ts"; await import(fixturePath)`. Vite resolves a variable dynamic import against the API root, so `../../../` clamped to `/` and the suite failed with `Cannot find module '/packages/db/test/final-account-lock.integration.test.ts'` (the real-database test was SKIPPED, not run). After: `fileURLToPath(new URL("../../../packages/db/test/final-account-lock.integration.test.ts", import.meta.url))` (plus the `node:url` import). Fixture-only wiring.
4. `apps/web/e2e/helpers/final-account-lock-journey.ts` and `apps/web/e2e/SV-4.spec.ts` (three e2e fixture defects):
   a. `finishDispositionsAndTerms` counted the disposition dropdowns with the non-waiting `count()` right after `page.reload()` while the panel still read "Loading final account…", so it chose no dispositions and "Complete final account" stayed disabled (both `DW8` tests, both projects). Added one wait first: `expect(panel.getByTestId("lock-state")).toHaveText("Final account review")`. Waits for a condition; no timeout changed.
   b. `DW7: another lock or cutoff...` called `prepareLockJob(page)` a second time on the same page; `openCapture` does `goto("/")` and waits for the "Start the demo" button, which does not exist once a session has started (30 s timeout). The second job is now prepared in a fresh `browser.newContext()` page (same demo tenant), closed after it is locked; the rest of the test is unchanged.
   c. `withSyntheticShadow` set `app.tenant_id` once on the single connection of a `max: 1` pool. `pg` discards a connection after a failed `pool.query`, so after the first expected foreign-key refusal the second insert ran on a new connection with no tenant context and the product's guard trigger correctly refused it (`FORBIDDEN`, 42501) instead of reaching the composite foreign key (23503). The tenant context now travels with every new connection (Pool `options: "-c app.tenant_id=<tenant>"`). The expected `23503` assertions are untouched and now pass for both the wrong-lock and the wrong-cutoff insert.
   While diagnosing 4c I changed the spec's matcher twice and restored it from a saved copy straight after each run; the committed spec diff is only the 4b change.

### Product defects found

None. Every failure was one of the fixture defects above. (The product behaved correctly in 4c: with no tenant context the shadow insert into `final_account_lock_check` fails closed.)

### Commands as run (cwd = worktree root unless shown; `HS` = `~/.local/bin/heavy-slot <label>`; `memory_pressure` was 67-76% free before every heavy run)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `git fetch origin`; `git merge origin/main` | 0 | merge 860d34b, no conflicts |
| 2 | `HS pnpm --filter @jobguard/core build`, then `@jobguard/storage`, `@jobguard/db`, `@jobguard/config`, `@jobguard/ai` (each alone) | 0 each | dist built |
| 3 | `HS pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 --reporter=verbose test/final-account-lock.integration.test.ts` (first, before step 4) | 1 | PostgreSQL would not start (`Postgres init script exited with code null`); 14 skipped |
| 4 | `node scripts/hydrate-symlinks.js` in `node_modules/.pnpm/@embedded-postgres+darwin-arm64@16.10.0-beta.15/node_modules/@embedded-postgres/darwin-arm64` | 0 | node_modules only |
| 5 | same command as 3, again | 1 | 13 passed, 1 failed (DW8, `evidence_object_kind_ck`) = the sibling helper's result |
| 6 | same, after fixture fix 1 | 0 | 14/14 |
| 7 | `... vitest run ... test/final-account-lock-invoice.integration.test.ts` | 0 | 10/10 |
| 8 | `... test/final-account-lock-reveal.integration.test.ts` | 0 | 2/2 |
| 9 | `... test/final-account-lock-upgrade.integration.test.ts` | 0 | 1/1 |
| 10 | `... test/shadow-catalog.integration.test.ts test/tenancy.integration.test.ts test/small-builder-origin.integration.test.ts` | 0 | 3 files, 25/25 |
| 11 | `... test/shared-money-origin.integration.test.ts test/recovery-timing-pin.integration.test.ts test/extra-origin-upgrade.integration.test.ts` | 0 | 3 files, 40/40 |
| 12 | `HS pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 --reporter=verbose src/final-account-lock.application.test.ts src/final-account-lock.controller.test.ts src/final-account-lock.isolation.test.ts` | 1 | application 14/14, controller 5/5, isolation 2 passed + real-database suite 1 skipped, suite error `Cannot find module` (fix 3) |
| 13 | `... src/final-account-lock.isolation.test.ts` (after fix 3) | 1 | real-database suite ran, `session fixture requires migration owner` (fix 2) |
| 14 | `... src/final-account-lock.isolation.test.ts` (after fix 2) | 0 | 3/3 including the real-database zero-versus-25-signals byte-identity test (DW8) |
| 15 | step 6 command re-run after fix 2 | 0 | 14/14 |
| 16 | `HS pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/final-account-lock.test.ts src/shadow-domain/lock.test.ts src/watchdog.test.ts` | 0 | 3 files, 16/16 |
| 17 | `HS pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/watchdog-registry.test.ts` | 0 | 121/121 |
| 18 | `HS pnpm typecheck` (re-run after the e2e edits) | 0 | 7 of 7 tasks |
| 19 | `HS env LANE_BASE_REF=origin/main pnpm lint` (re-run after the e2e edits) | 0 | 7 of 7 tasks |
| 20 | `HS env LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | "Lane boundary passed" (lane `sv-4`, run on committed head 860d34b; all four edited files are in the lane allow-list) |
| 21 | `HS pnpm openapi:check` | 0 | pass |
| 22 | `HS pnpm build` (alone) | 0 | 7 of 7 tasks |
| 23 | `cd apps/web; CI=1 PLAYWRIGHT_SKIP_BROWSER_GC=1 HS pnpm exec playwright test --config ~/.local/share/full-steam/jg-runs/pw-local-channel-sv-4.config.ts --workers=1 --project=mobile-360 --project=desktop e2e/SV-4.spec.ts` (first) | 1 | 4 passed, 6 failed (DW8 x4 helper race; DW7 "another lock" x2 timeout) |
| 24 | same, after fixes 4a and 4b | 1 | 8 passed, 2 failed (DW7 "another lock": 42501 instead of 23503, fix 4c) |
| 25 | same, after fix 4c | 0 | **10 passed** (5 tests x mobile-360 and desktop), 50.7 s |

The wrapper config is out of repo: `~/.local/share/full-steam/jg-runs/pw-local-channel-sv-4.config.ts` (copy of the ent-3a wrapper with `channel: "chromium"`, pointing at this worktree). `CI=1` makes the repo's own config start `next start` on the production build from step 22 instead of `pnpm dev`.

### NOT RUN

- The existing browser specs the issued order lists for the integrator (`UIWIRE-9`, `UIWIRE-10`, `customer-invoice`, `final-account`) although `job-final-account.tsx` and `customer-invoices.tsx` changed; not part of this brief.
- `pnpm test:db`, `pnpm test:migrations` and any whole-package suite (memory rule); the other `demo-bootstrap` and `UIWIRE-12` catalogue files.
- `ENT-2.spec.ts` (known failing on plain main on this Mac; not this piece's file).

Mac verification record only; the builder receipt above is still "not independently verified, not accepted".

## Round 2 repair

12 October 2026. Builder: Codex GPT-6.1 Sol. Reviewed head: `1965aea297db7995d29a831cf3dc7d0c9db41583`; actual clean starting head: `d620264da0461decb2b9c516ebb3947b1976e10e`, branch `codex/sandbox/sv-4`. The intervening commit contains only the coordinator's B1 one-line replacement in `shadow-persistence.integration.test.ts`. This round does not edit that file, any SV-2 file, or the lane policy. The F7 test does not depend on the obsolete table-absence assertion. No git write command, package download, commit, push or acceptance was performed; dispatcher owns the commit, using `/private/tmp/jg-msg-sv-4.txt`.

### B2 fix and test-first sequence

First appended one assertion to the existing test **F7 main £40,320 and supplementary £960 bind exact source lines, replay once and never rebill the baseline**, named **F7 builder issuer and trigger-populated party snapshot**. It compares both invoice fields with `toEqual`: `issuer_details` must contain exactly `{legalName:'Fictional Builder Ltd',runIdentity:a.tenantId}`, and `parties_snapshot` must equal the current job-party snapshot returned by the same `app.require_current_job_parties` routine used by the merged insert trigger. All existing assertions remain byte-identical. The test and SQL were inspected before changing SQL; the old issuer value is the customer/site/paying-party object and cannot equal that builder object. This is a source-inspected expected failure, not an executed red test: PostgreSQL is unavailable here.

Then changed exactly one value in the unmerged `0130_final_account_lock.sql` customer-invoice INSERT:

- Before: `party_snapshot`.
- After: `jsonb_build_object('legalName','Fictional Builder Ltd','runIdentity',p_tenant)`.

Copied the expression exactly from `app.issue_practice_customer_invoice` in `origin/main:packages/db/migrations/0095_job_parties.sql`. Added no column and supplied no `parties_snapshot` insert value; the existing `invoice_party_snapshot` trigger still populates it. No existing invoices are rewritten. The upgrade proof reads migration text to execute it, but does not hash or snapshot that text, so it remains untouched under rule 9. No other SQL value, DDL, grant, policy, arithmetic, UI, SV-3 behavior or LATER item changed. The repair affects the accuracy of immutable invoice/evidence-pack records; authorization, totals, lock/check guards and the older invoice routine remain unchanged. No new operational alert or external action.

### Round 2 commands and results

All commands run from `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv-4`. As in the first receipt, use the existing cached-pnpm shim: common prefix **`PATH=/private/tmp/jg-sv4-bin:$PATH COREPACK_ENABLE_NETWORK=0`**. It invokes the installed pnpm 10.28.1 without network access. The initial system `pnpm typecheck` stalled in the pnpm 11 wrapper before Turbo started; interrupted with Ctrl-C, exit **130**, zero tasks/tests executed. The prefixed version probe then returned **10.28.1**, exit **0**. This is not a clean-install claim.

| Command (after common prefix for pnpm) | Exit | Result/count |
|---|---:|---|
| `pnpm typecheck` | 0 | 7/7 Turbo tasks successful, 4 cached; 1m59.655s |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed (131 TypeScript files); lane check refused the coordinator's already-committed `packages/db/test/shadow-persistence.integration.test.ts`; package lint not reached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same single coordinator-owned path refused; no lane policy edit or waiver |
| `node tools/money-arithmetic-lint.mjs` | 0 | Money arithmetic boundary passed |
| `node tools/commercial-boundary-lint.mjs` | 0 | Commercial boundary passed (no diagnostics) |
| `pnpm turbo run lint` | 0 | 7/7 package tasks successful, 4 cached; 9m8.225s; package checks not reached by the top-level lint failure |
| `node --input-type=module` (TypeScript compiler here-doc below) | 0 | 1 changed entry file, 0 diagnostics; no test/database execution |
| `pnpm build` | 0 | 7/7 Turbo tasks successful, 4 cached; 5m29.731s; Next generated 27/27 static pages |
| `pnpm openapi:check` | 1 | tsx CLI failed on forbidden IPC socket (`listen EPERM`) before checker execution; not a stale-schema result |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same existing OpenAPI checker via Node loader; committed document matched, no source/script changed |

Static test-file compilation used the existing root compiler options (package typecheck includes `src` only):

```js
import ts from 'typescript';
const files=['packages/db/test/final-account-lock-invoice.integration.test.ts'];
const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile);
const options=ts.parseJsonConfigFileContent(config.config,ts.sys,'.').options;
const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram(files,{...options,noEmit:true}));
if(diagnostics.length)process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:ts.sys.getCurrentDirectory,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
process.stdout.write(`${files.length} entry file; ${diagnostics.length} diagnostics; no database or test execution.\n`);
process.exitCode=diagnostics.length?1:0;
```

One-off `python3 - <<'PY'` source-preservation audit, exit **0**, **8 grouped checks passed**, zero tests/SQL executed: the entire migration equals HEAD with exactly the one replacement; the expression is present verbatim on origin/main; the merged trigger exists; the new INSERT omits `parties_snapshot`; the test equals HEAD with only the two appended lines (one query, one assertion); the receipt keeps its existing prefix; the working diff has exactly the three repair paths. No permanent test pins any unowned source.

| Repair source | HEAD SHA-256 | Working SHA-256 |
|---|---|---|
| `0130_final_account_lock.sql` | `31afda6d5d32c4afc92fa2c77b47fe7ac0b5abf3ae2bb845124d3d10571dfe8b` | `543977d99659b724f9f22ca23279c4b9e6210eb053f599ac3d9ffd8df16b7df7` |
| `final-account-lock-invoice.integration.test.ts` | `15076e980b6cfffa35b8251b2815f3b5a0d53844fbc073a83bdf6a36b29346b0` | `f882f61ae1ee2742d0563133cb67cfd9a79c9dccf667872afc03579000c65730` |

Build/check warnings: shared Turbo cache writes outside the sandbox were denied; existing Next workspace-root/multiple-lockfile and `practice-receipts.module.css` autoprefixer/webpack-cache warnings. No affected source was changed. Read-only `memory_pressure`: exit **0**, 66% free during package lint. Read-only process inspection was unavailable (`ps`: operation not permitted); it provides no check evidence.

Generated-output cleanup (`python3` here-doc): exit **0**, **17** output/cache paths removed after all checks. It enumerated only root/app/package `dist`, `.next`, `.turbo`, `test-results`, `playwright-report`, `.pnpm-store` and `*.tsbuildinfo`; asserted no tracked files and ignored-output status before removal. Installed `node_modules` was retained. `git status --short`, `git diff --stat`, `git diff --check`, `git rev-parse HEAD`: exit **0**, exactly three repair paths, no whitespace diagnostics, HEAD still `d620264`. Implementation/test diff is **3 insertions / 1 deletion**; receipt changes are appended only. Intended conventional commit subject/body written to `/private/tmp/jg-msg-sv-4.txt`; no git write.

Dispatcher follow-up: the coordinator's B1 commit is already at HEAD, but the unchanged SV-4 lane checker rejects its SV-2 path when comparing to `origin/main`. Resolve that coordinator-owned lane evidence separately; this builder does not widen the lane. Run the real PostgreSQL F7 assertion against the old value to establish executed red evidence, then against this repaired SQL, plus the required database/migration/browser suites on the repaired commit. The sandbox provides neither red nor green database execution. Full green GitHub checks and fresh independent review/separate acceptance remain required.

### Round 2 NOT RUN

`packages/db/test/final-account-lock-invoice.integration.test.ts` (including the new F7 assertion), lock/reveal/upgrade integration files, API database isolation, all other database suites (`pnpm test:db`, `pnpm test:migrations`) and all browser suites: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. No database/browser command was attempted and no skip, timeout, retry wrapper or weakened assertion was introduced. Whole-repository tests and unchanged pure/unit test files are not run under the binding rule allowing only test files changed in this round (at most three per run, Vitest `--maxWorkers=2`, one run at a time). The only changed test file requires PostgreSQL; consequently no eligible unit test executes in this round. `pnpm eval` is inapplicable: no AI change.

### Round 2 Self-review

Source-inspected the complete round-2 diff against starting HEAD, the issued/continuation orders, Opus BLOCKING section, applicable plan lock/invoice contracts and merged routine/trigger. Confirmed the only SQL change is the exact builder object; no `parties_snapshot` column/value is supplied by the new routine. The paired `toEqual` assertion checks the full builder shape and the trigger's existing party snapshot in a distinct field, after the real lock-bound issue command. It would fail on the old SQL by source inspection; actual PostgreSQL execution is still owed. All prior F7 money, replay and supplementary-line assertions remain byte-identical; no old test name, assertion, skip or timeout changed.

Checked the upgrade proof does not pin the changed SQL text. No schema, grant, RLS, tenant boundary, lock order, hash, fee, prompt, UI or production-policy change is needed for this value repair. Exact whole-file replacement/insertion checks and the three-path working diff confirm SV-2, SV-3, auth pins, shared registrations, the merged invoice routine and all LATER findings are untouched in this round. The coordinator's B1 commit remains separately owned. The test has no reliance on absence of the lock table.

Final verification and cleanup completed as recorded above. Rechecked exact source hashes, the entire three-file working diff, byte-identical existing test lines and unchanged starting HEAD; no additional repair found. Typecheck, package lint, static test compilation, build and the same OpenAPI checker passed; branch lint/lane checks remain red on the coordinator-owned B1 file. No SQL, database concurrency/RLS/trigger, browser or live-provider execution is claimed. Builder self-review only — not an independent model verdict. Builder receipt only — not independently verified, not accepted. Green GitHub checks including database/browser evidence and fresh independent verdict/separate acceptance remain owed; D12, D13, G1 and the older unguarded path owed to SV-5 remain held. B1's presence at the starting head is not a claim that it passed.


## Mac verification (12 Oct, round 2)

Run by the JobGuard dispatcher's Mac helper (Claude Sonnet 5.5), 12 October 2026, in `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv-4`, branch `codex/sandbox/sv-4`. This is the first time the Round 2 repair (builder `issuer_details`) and the coordinator's B1 line ran against real PostgreSQL, and the first run on the merged and renumbered tree. It is a verification record only: **not independently verified, not accepted**. Earlier sections of this receipt that name the migration `0130` were written before the renumber.

### Start, merge and renumber

- Start: head `9f93e5b` (clean), `origin/main` `96c0cb8`. Free disk at start 119 GiB.
- `git merge origin/main` -> merge commit `b588185`. Conflicts only in append-only files; resolved by keeping both sides, main's lines first: `packages/db/src/migrate.ts` (main's 0129 and 0130 lines, then this branch's line), `packages/db/src/index.ts`, `packages/db/MIGRATIONS.md`, `apps/api/src/app.module.ts` (the import, and the one `@Module` line: main's line plus `,FinalAccountLockController` once; character-level diff against main's line = a single 27-character insertion `,FinalAccountLockController` after `IdentityController`), `apps/api/src/workspace/application.ts` (the import, the `const finalAccountLock = ...` line, and main's `return Object.freeze({ ssoRequired, sso, ...` line plus `, finalAccountLock` once before ` });`; character-level diff = a single 18-character insertion). `config/agent-lane-assignments.json`, `BUILD_PLAN.md` and `apps/api/src/workspace/index.ts` merged without conflict; the lane JSON parses.
- `apps/api/openapi.json`: not hand-merged. Took main's file, ran `pnpm openapi:generate` in `apps/api` (exit 0), then `pnpm openapi:check` (exit 0). Result vs main: 73 lines added, 0 removed, exactly the four `/jobs/{id}/final-account/{lock,dispositions,terms,review-extras}` routes (commit `685aacf`). sha256 of the file: `829f84558973f5b79c7b03a7b1a4994609a88b963b0c86c1db237dc8a236c79f`.
- Renumber `0130` -> `0132` (commit `9168997`), `git mv packages/db/migrations/0130_final_account_lock.sql packages/db/migrations/0132_final_account_lock.sql`:
  - sha256 **before** `543977d99659b724f9f22ca23279c4b9e6210eb053f599ac3d9ffd8df16b7df7`, **after** `543977d99659b724f9f22ca23279c4b9e6210eb053f599ac3d9ffd8df16b7df7` (equal; it is also the "Working SHA-256" of Round 2 above).
  - Why: main's 0129 (ENT-10d) and 0130 (CH-7-F17-BEFORE-OPEN) merged first; 0131 is held for PRACTICE-FACTS-1 (#139).
  - Changed: `migrate.ts` (registered last, after 0130), `MIGRATIONS.md` (heading `## 0132 — SV-4 final-account lock` with the renumber sentence), `final-account-lock-upgrade.integration.test.ts` (`OWN` name and test title; it installs everything before the file by NAME), `docs/contracts/final-account-lock-v1.md`, this receipt's body and `DRAFT_AUDIT.md`, the SV-4 line of `config/agent-lane-assignments.json` (the allow-list path of the migration file only), and a new `BUILD_PLAN.md` §12.2 paragraph "Ledger amendment — SV-4, 12 October 2026 (catch-up renumber, merge-ahead ruling)".
  - `ls packages/db/migrations`: exactly one `final_account_lock` migration (0132); no duplicate numbers.
- Packages rebuilt before any test, each alone through `heavy-slot`: `@jobguard/core`, `db`, `storage`, `config`, `ai`, `api` (all exit 0).

### Results (working directory = worktree root unless shown; every command through `~/.local/bin/heavy-slot <label>`; logs in `~/.local/share/full-steam/jg-runs/sv-4-r2-mac/`)

| # | Command (vitest `--reporter=verbose`) | Exit | Result |
|---|---|---|---|
| 1 | `packages/db`: `vitest run --maxWorkers=1 test/shadow-persistence.integration.test.ts` (SV-2's file, unedited, sha256 `a7b1f2670d96290a2778117317d6e8a6b590c4433415aa955d91af294933148c` = HEAD) | 0 | 1 file, **8/8**, including "returns nothing before a lock even with own revealed rows present (DW3 split)" (the coordinator's one-line change checks for no lock ROWS) |
| 2 | RED EXPERIMENT, same file, `-t "returns nothing before a lock"`, uncommitted scratch edit | 1 | **RED as required**: with a real `final_account_lock` row for job J inserted first, the assertion `SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=ANY($2::uuid[])` ... `toBe(0)` fails: `AssertionError: expected 1 to be +0` (1 failed, 7 skipped by the filter). Details below. |
| 3 | `packages/db`: `--maxWorkers=1 test/final-account-lock.integration.test.ts test/final-account-lock-invoice.integration.test.ts test/final-account-lock-reveal.integration.test.ts` | 0 | 3 files, **26/26** (14 + 10 + 2). Includes the Round 2 assertion inside "F7 main £40,320 and supplementary £960 bind exact source lines, replay once and never rebill the baseline" (builder `issuer_details`, trigger-filled `parties_snapshot`) |
| 4 | `packages/db`: `--maxWorkers=1 test/final-account-lock-upgrade.integration.test.ts test/shadow-catalog.integration.test.ts test/tenancy.integration.test.ts` | 0 | 3 files, **16/16**; the rule-9 proof "installs before 0132, compares 0132 alone, all later twice, and exercises the same comparator's rolled-back controls" passed (1.6 s) |
| 5 | `packages/db`: `--maxWorkers=1 test/UIWIRE-12.integration.test.ts test/demo-bootstrap.integration.test.ts` (catalogue rows touched by SV-4) | 0 | 2 files, **26/26** |
| 6 | `apps/api`: `--maxWorkers=2 src/final-account-lock.application.test.ts src/final-account-lock.controller.test.ts src/final-account-lock.isolation.test.ts` | 0 | 3 files, **22/22**, including the real-database zero-versus-25-signals test (DW8) |
| 7 | `packages/core`: `--maxWorkers=2 src/final-account-lock.test.ts src/shadow-domain/lock.test.ts src/watchdog.test.ts` | 0 | 3 files, **16/16** |
| 8 | `apps/api`: `--maxWorkers=2 src/auth/context-boundary.test.ts src/watchdog-registry.test.ts` | 0 | 2 files, **266/266**; the scanner alone (step run separately) **145/145** (expected 145); watchdog registry 121 |
| 9 | `pnpm typecheck` | 0 | 7/7 tasks |
| 10 | `LANE_BASE_REF=origin/main pnpm lint` | **1** | **FAILED at the lane step**: `Lane boundary FAILED: Lane sv-4 cannot edit: "packages/db/test/shadow-persistence.integration.test.ts"`. This is the only path named. It is the coordinator's one-line commit `d620264` (B1); the SV-4 lane allow-list does not contain it (the SV-2 lane line does). Nothing was added to the allow-list and the file was not touched: widening the lane is the coordinator's decision. |
| 10a | the rest of `pnpm lint`, run separately because the lane step stops the chain: `node tools/core-purity-lint.mjs`; `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs`; `pnpm turbo run lint` | 0 each | core purity 131 files; money arithmetic and commercial boundary passed; turbo lint 7/7 |
| 11 | `pnpm openapi:check` (in `apps/api`) | 0 | pass |
| 12 | `pnpm build` | 0 | 7/7 tasks (the production build the browser specs use) |
| 13 | `apps/web`: `CI=1 PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm exec playwright test --config ~/.local/share/full-steam/jg-runs/sv-4-r2-mac/pw-local-channel-sv-4-r2.config.ts --workers=1 e2e/SV-4.spec.ts e2e/customer-invoice.spec.ts e2e/final-account.spec.ts` (both projects, mobile-360 and desktop) | 0 | **14 passed** |
| 14 | same config, `e2e/UIWIRE-9.spec.ts e2e/UIWIRE-10.spec.ts` | 0 | **4 passed** |
| 15 | same config, `e2e/CH-1.spec.ts e2e/M4-3-S.spec.ts e2e/M4-7-S.spec.ts` (merged specs that issue invoices through the screens SV-4 changed; the older no-lock path must stay open, Q1) | 0 | **20 passed** |
| 16 | same config, `e2e/UIWIRE-12.spec.ts` | 0 | **6 passed** |

Wrapper config (out of repo): `~/.local/share/full-steam/jg-runs/sv-4-r2-mac/pw-local-channel-sv-4-r2.config.ts`, copied from `pw-local-channel-train-20261012-b.config.ts` with the worktree path changed to this worktree, `outputDir` under `sv-4-r2-mac/pw-results`, `channel: "chromium"`. `ENT-2.spec.ts` was not run, so the known Mac-only `[mobile-360] ENT-2.spec.ts:19` failure did not appear.

### Red experiment (step 2) in detail

The scratch edit (never committed) inserted, immediately before the line-52 assertion of `shadow-persistence.integration.test.ts`, a REAL lock for job J of tenant T built the way the SV-4 fixtures build one: a scope item, an accepted quote version, a final-account draft, a revision and a baseline line for J (as the migration owner, inside a tenant transaction), then through `FinalAccountLockRepository` as the runtime login: `acceptTerms`, `disposition` ("done") and `lock`. All of that succeeded (the failure is at the assertion, not in the set-up). Result: `FAIL ... returns nothing before a lock even with own revealed rows present (DW3 split)`, `AssertionError: expected 1 to be +0`, at the `final_account_lock` count line (line 71 in the scratch copy, line 52 in the committed file). Restored with `git checkout -- packages/db/test/shadow-persistence.integration.test.ts`; `git status --short` printed nothing, and the file's sha256 equals the committed one (`a7b1f267...3148c`).

### Not run

`pnpm test:db`, `pnpm test:migrations` and any whole-package suite (memory rule); `ENT-2.spec.ts`; browser specs of screens SV-4 does not change; SV-3. A real-PostgreSQL check of the Round 2 builder-`issuer_details` assertion against the OLD SQL (the executed "red" for B2) was not run: only the repaired SQL was run, where the assertion passes.

### Push

Not pushed from this run: the required `LANE_BASE_REF=origin/main pnpm lint` is red on the lane step (step 10). Everything else above is green. Resolution is the coordinator's: either add `packages/db/test/shadow-persistence.integration.test.ts` to the `sv-4` allow-list (one entry) or rule otherwise; then `git push origin HEAD:codex/sandbox/sv-4` (plain push; PR #152 is open at the older head `1965aea` and conflicts with main until pushed).

Mac verification record only; the builder receipt above is still "not independently verified, not accepted".


## Re-check after catch-up (12 Oct, evening)

Run by the JobGuard dispatcher's Mac helper (Claude Sonnet 5.5), 12 October 2026 (evening), in `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv-4`, branch `codex/sandbox/sv-4`. Verification record only: **not independently verified, not accepted**. Free disk at start 112 GiB.

- Start: head `8949219` (the dispatcher's lane-line fix, clean). `origin/main` `ad1bad2`. Merge commit `b24a20d` "Merge main (ad1bad2) into SV-4".
- Conflicts, all in append-only files, resolved keeping both sides with main's lines first: `packages/core/src/index.ts` (main's `practice-facts.js` export, then ours), `packages/db/src/migrate.ts` (main's 0131 line, then our 0132 line, registered last), `packages/db/MIGRATIONS.md` (main's 0131 section, then ours). `apps/api/src/app.module.ts`: main's `@Module` line plus `,FinalAccountLockController` once (character-level diff against main's line = a single 27-character insertion after `PracticeFactsController`). `apps/api/src/workspace/application.ts`: our `const finalAccountLock = ...` line, then main's `return Object.freeze({ ssoRequired, sso, ...` line plus `, finalAccountLock` once before ` });` (single 18-character insertion). `BUILD_PLAN.md`, `config/agent-lane-assignments.json` (parses), `apps/api/src/workspace/index.ts` and `packages/core/src/watchdog.ts` merged without conflict.
- `apps/api/openapi.json`: not hand-merged. Took main's file, rebuilt `core`, `db`, `storage`, `config`, `ai` each alone, then `api`, ran `pnpm openapi:generate` in `apps/api` (exit 0) and `pnpm openapi:check` (exit 0). Result vs main: 73 lines added, 0 removed (the four `/jobs/{id}/final-account/...` routes). sha256 `04fdd616144672010f44a4ba7f543038bf4b645eee3b4450c3debd387c00c7f5`.
- Migrations: `ls packages/db/migrations` ends 0130, 0131, 0132; exactly one `final_account_lock` file (0132); no duplicate numbers. `0132_final_account_lock.sql` sha256 still `543977d99659b724f9f22ca23279c4b9e6210eb053f599ac3d9ffd8df16b7df7` (unchanged).
- SV-2's `shadow-persistence.integration.test.ts` not edited here; sha256 `a7b1f2670d96290a2778117317d6e8a6b590c4433415aa955d91af294933148c`, the same as before the merge.

Every command through `~/.local/bin/heavy-slot <label>`; vitest `--reporter=verbose`, db files `--maxWorkers=1`, others `--maxWorkers=2`; logs in `~/.local/share/full-steam/jg-runs/sv-4-r3-mac/`.

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `packages/db`: `test/shadow-persistence.integration.test.ts test/command-replay-contract.integration.test.ts test/final-account-lock.integration.test.ts` | 0 | 3 files, **75/75** (8 + 53 + 14). The new contract test passes on this branch (no uncovered watchdog_live_only key) |
| 2 | `packages/db`: `test/final-account-lock-invoice.integration.test.ts test/final-account-lock-reveal.integration.test.ts test/final-account-lock-upgrade.integration.test.ts` | 0 | 3 files, **13/13** (10 + 2 + 1); the rule-9 upgrade proof "installs before 0132, compares 0132 alone, all later twice, and exercises the same comparator's rolled-back controls" passed |
| 3 | `packages/db`: `test/shadow-catalog.integration.test.ts test/tenancy.integration.test.ts` | 0 | 2 files, **15/15** (6 + 9) |
| 4 | `apps/api`: `src/auth/context-boundary.test.ts src/watchdog-registry.test.ts` | 0 | 2 files, **266/266**: scanner **145** (expected 145), watchdog registry **121** |
| 5 | `apps/api`: `src/final-account-lock.application.test.ts src/final-account-lock.controller.test.ts src/final-account-lock.isolation.test.ts` | 0 | 3 files, **22/22** |
| 6 | `pnpm typecheck` | 0 | 7/7 tasks |
| 7 | `LANE_BASE_REF=origin/main pnpm lint` | 0 | **passes the lane step now** ("Lane boundary passed", lane `sv-4`, base `ad1bad2`, head `b24a20d`; the file list includes `packages/db/test/shadow-persistence.integration.test.ts` as the coordinator's one allowed line); core purity 133 files; money arithmetic boundary passed; turbo lint 7/7 |
| 8 | `pnpm openapi:check` (in `apps/api`) | 0 | pass |
| 9 | `pnpm build` | 0 | 7/7 tasks (production build for the browser spec) |
| 10 | `apps/web`: `CI=1 PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm exec playwright test --config ~/.local/share/full-steam/jg-runs/sv-4-r3-mac/pw-local-channel-sv-4-r3.config.ts --workers=1 e2e/SV-4.spec.ts` (both projects, mobile-360 and desktop) | 0 | **10 passed** |

### Not run in this re-check

The shadow-persistence red experiment (done on `2cfca30`; the file is unchanged), `pnpm test:db`, `pnpm test:migrations` and any whole-package suite (memory rule), `ENT-2.spec.ts`, browser specs other than `SV-4.spec.ts` (the previous helper ran the others on `2cfca30`), SV-3.

Mac verification record only; the builder receipt above is still "not independently verified, not accepted".
