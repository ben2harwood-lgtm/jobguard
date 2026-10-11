# STORED-TIMES-1 builder receipt

Builder: Codex. Issued 11 October 2026; fix-forward of merged CH-7/M4-7-S. Check lane RED. Base and current HEAD: `4564e888b85aba559c542e935e52fe9f78769595`, equal to the available `origin/main`. Branch: `codex/sandbox/stored-times-1`. Working-tree changes only; .git is read-only and the dispatcher will commit the exact tree. No fetch, commit, push, provider action or browser run. The dispatcher must bind independent verdicts to the resulting commit. Fresh Claude Opus review, separate Codex Sol check after CI, and separate technical acceptance remain pending; at most two repair rounds under the issued order.

Can the runtime role change either time after insert? **No**: effective runtime UPDATE/DELETE is denied on both tables by the merged grants, SQLSTATE 42501. The case also has the merged `recovery_immutable` trigger, which refuses owner changes with 55000 (`recovery history is append-only`). The feed has no append-only mutation trigger and its owner CAN update it. No non-owner application role gains a mutation path through any registered migration at this base. The new migration adds no UPDATE guard.

After this pin a raw writer can still back-date by as long as it keeps its own transaction open, because the stored time is the transaction's start. That is bounded, needs raw database access, and is not closed by this order.

The new ordinary BEFORE INSERT triggers ignore a raw writer's back-dating attempt and chosen time, for every inserting role. Both use `a_recovery_timing_pin`; one new SECURITY INVOKER function pins `created_at` to `transaction_timestamp()`. History stays unchanged, including chosen times already stored. Ordinary replica-mode bypass and privileged-owner boundaries remain explicit. No commercial policy, fee posting, authorization path, provider destination, operational alert or production release gate changes. Forward fix only: preserve history and correct by a later reviewed migration; CREATE TRIGGER takes a short table lock.

## Changed files

- `config/agent-lane-assignments.json`: first change, one compact line in name order with exactly the issued allowlist.
- `packages/db/test/recovery-timing-pin.integration.test.ts`: one new test file, written before the migration; one embedded cluster, second database for upgrade. Every title starts with its AC ID. No imports from other tests except the two allowed utility files. Database-side timestamp comparisons retain microseconds; monetary figures come from the merged catalogue/fixture definitions.
- `packages/db/migrations/0127_recovery_timing_pin.sql`: one new function, owner assignment, revocation, two ordinary insert triggers inside BEGIN/COMMIT; no other database mutation.
- `packages/db/src/migrate.ts`: one new line after 0122. 0123–0126 are absent at this base; the integrator confirmed their separate scope in the issued header.
- `packages/db/MIGRATIONS.md`: one section appended; earlier bytes unchanged.
- `docs/contracts/recovery-timing-pin-v1.md`: pinned times, firing order, unchanged guard/hash excerpts, role boundaries, history and residual.
- This receipt under `docs/verdicts/STORED-TIMES-1/`.

The shared lane, registry and migration-note edits serialize with the other issued pieces. No `BUILD_PLAN.md`, existing migration, merged test, existing contract or routine is changed. The integrator owns the §12.2 ledger entry when the PR opens. No dependency or column is added, including to any fingerprinted table. Product paths still omit these times and use the same transaction clock.

## Acceptance coverage — implementation, not execution

All database cases below: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. BUILT means assertions written, not an acceptance verdict.

| AC | Status | Test titles / evidence |
| --- | --- | --- |
| AC1 | BUILT | `[AC1] ordinary insert triggers and invoker function have the exact catalog shape`: exact definitions, exactly two callers, O mode, owner, invoker, sole search_path setting, denied runtime/infrastructure/identity EXECUTE and no PUBLIC EXECUTE |
| AC2 | BUILT | `[AC2] timing pin fires first on %s and merged insert guards remain` (two tables): name-ordered non-internal BEFORE INSERT row triggers; first and merged-name assertions |
| AC3 | BUILT | `[AC3] runtime case back-dating attempt ignores chosen time %s`; `[AC3] valid runtime advance ignores chosen time %s` (past/future each; four cases). Without 0127 each stores the chosen time, making pinned=false and kept_chosen=true; every assertion would fail. This is source reasoning, not an observed red run |
| AC4 | BUILT | `[AC4] %s case insert is pinned in ordinary mode`: owner and superuser; no exemption |
| AC5 | BUILT | `[AC5] product case and settled event use their transaction clock within server readings`: product-only controls; comparisons in SQL against claim/opened event and feed command times, bracketed by server clock readings |
| AC6 | BUILT | `[AC6] %s settled then raw case with chosen past time remains excluded` (F18/F19); `[AC6] %s opened then raw settled row with chosen past time retains full figure` (F18/F19); `[AC6] F18 raw settled row with chosen future time then product opening remains excluded`; `[AC6] %s product-only controls preserve both money answers and replay` (F18/F19). Separate jobs/cases, exact reasons, 0p / catalogue-derived 262,000p or 250,000p, saved result equality and same-command replay in every review. Five chosen-time scenarios would flip without the pin; controls already pass in the merged design |
| AC7 | BUILT | `[AC7] runtime cannot update or remove a visible %s row after insert`; `[AC7] owner case rewrite is refused by the merged append-only trigger`; `[AC7] %s cannot select, insert or update either table`; `[AC7] catalog denies every non-owner application role mutation; feed owner remains privileged (control)`. Refused statements target existing tenant-visible rows; times and existence are checked after every refusal. Includes column privilege, role membership and schema-access checks |
| AC8 | BUILT; regression execution pending | `[AC8] merged superuser UPDATE time-seeding pattern still works unaltered (control)`. Source check confirms no merged test changed by one byte. Required existing files listed below remain NOT RUN |
| AC9 | BUILT | `[AC9] populated upgrade preserves every stored row, earlier routine and table shape; reapply is inert`: second database, all earlier registered migrations, product feed/case/review, runtime chosen-time row before pin; row-text snapshots, ACL/owner/RLS/policies/constraints/columns, twelve fingerprinted lists, all earlier app function definitions and both tables' triggers/modes. migrate twice, exact preservation, only one new function/two triggers, one registry entry, new raw inserts on both tables pinned, saved review unchanged |
| AC10 | BUILT | `[AC10] registry is sorted, unique and places the pin after its two dependencies`: name/order assertions, no total/exact migration-list assertion |
| AC11 | BUILT | `[AC11] contract and migration record retain the stated boundary and forward-fix instructions`; contract and append-only migration record written with required explanations and residual |

The file expands to 27 database test cases (including parameterized cases; two AC6 control cases each execute both orders). No database case was executed. AC1/AC2/AC3/AC4/AC9/AC10 need the new migration/registration; AC5/AC7/AC8 are stated controls; AC6 combines new-money-rule protection and controls; AC11 checks the new records.

`extra-origin-upgrade.integration.test.ts` must still pass unedited for this diff: 0127 only CREATES a new function, so every earlier function definition is unchanged. The separately reported 0123 replacement concern belongs to another order; neither that test nor `extra-fixtures.ts` is edited here.

## Proof repeated at the base

Ran the issued proof command (exit 0, 20 statements in 11 files; no listed column is `created_at`). The four `${columns}` sites use the unchanged 16-column constant at `practice-feed.integration.test.ts:615`.

```sh
git grep -n -o -i -E 'INTO +app\.(recovery_case|practice_feed_event) *(\([^)]*\)|\$\{[a-z]+\}|[A-Z]+)' origin/main -- packages apps tools ':!packages/db/migrations'
```

Observed output:

```text
origin/main:packages/db/src/practice-feed-repository.ts:250:INTO app.practice_feed_event(id,tenant_id,job_id,account_id,command_id,event_kind,movement_key,event_id,identity,representation_id,gross_pence,currency,state,environment,version,source_hash)
origin/main:packages/db/src/recovery-case-repository.ts:110:INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs)
origin/main:packages/db/test/evidence-pack-fixture.ts:73:INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs)
origin/main:packages/db/test/practice-feed.integration.test.ts:359:INTO app.practice_feed_event(id,tenant_id,job_id,account_id,command_id,event_kind,movement_key,event_id,identity,representation_id,gross_pence,currency,state,environment,version,source_hash)
origin/main:packages/db/test/practice-feed.integration.test.ts:586:INTO app.practice_feed_event(id,tenant_id,job_id,account_id,command_id,event_kind,movement_key,event_id,identity,representation_id,gross_pence,currency,state,environment,version,source_hash)
origin/main:packages/db/test/practice-feed.integration.test.ts:622:INTO app.practice_feed_event${columns}
origin/main:packages/db/test/practice-feed.integration.test.ts:624:INTO app.practice_feed_event${columns}
origin/main:packages/db/test/practice-feed.integration.test.ts:625:INTO app.practice_feed_event${columns}
origin/main:packages/db/test/practice-feed.integration.test.ts:627:INTO app.practice_feed_event${columns}
origin/main:packages/db/test/recovery-cases.integration.test.ts:11:INTO app.recovery_case(id,tenant_id,job_id,case_type,counterparty,book,source_type,source_refs)
origin/main:packages/db/test/recovery-cases.workbench.integration.test.ts:9:INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic)
origin/main:packages/db/test/recovery-cases.workbench.integration.test.ts:15:INTO app.recovery_case(id,tenant_id,job_id,case_type,counterparty,book,source_type,source_refs)
origin/main:packages/db/test/recovery-cases.workbench.integration.test.ts:428:INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs)
origin/main:packages/db/test/recovery-eligibility-v3.integration.test.ts:31:INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic)
origin/main:packages/db/test/recovery-eligibility-v3.integration.test.ts:92:INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic)
origin/main:packages/db/test/recovery-follow-up-upgrade.integration.test.ts:140:INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs)
origin/main:packages/db/test/recovery-follow-up.integration.test.ts:82:INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs)
origin/main:packages/db/test/recovery-messages.integration.test.ts:39:INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs)
origin/main:packages/db/test/recovery-messages.integration.test.ts:1577:INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs)
origin/main:packages/db/test/recovery.integration.test.ts:17:INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic)
```

```sh
git grep -l -w -E 'recovery_case|practice_feed_event' origin/main -- apps tools packages/db/tools
```

Observed output: none (git grep exit 1, no matches). The base matches the draft, so no stop condition occurred. The only merged chosen-time writes remain the superuser UPDATEs in `recovery-eligibility-v3.integration.test.ts:197–198`. No chosen-time product insert exists.

## Privileges re-derived through the base

Source inspection, not live catalog execution. Searched all registered migrations, including generic loops, schema grants, role grants, defaults, table/column grants, policies, owner changes, triggers and definer write routines. Actual-catalog assertions are written in AC1/AC7/AC9 but NOT RUN.

| Role | Table | INSERT | UPDATE | DELETE | Merged guard / boundary |
| --- | --- | --- | --- | --- | --- |
| jobguard_runtime | recovery_case | Yes, tenant-scoped | No | No | SELECT from 0018:85; INSERT restored by 0034:3; UPDATE/DELETE revoked in 0018:85 and 0034:4, 42501 |
| jobguard_runtime | practice_feed_event | Yes, validated feed transaction | No | No | 0106:100–107: owner/FORCE RLS/tenant policy, REVOKE ALL then SELECT/INSERT only, mutation denial 42501; INSERT guarded by guard_practice_feed |
| jobguard_migration | recovery_case | Yes, tenant context required | Privilege yes; trigger refuses | Privilege yes; trigger refuses | 0018:76,85: recovery_immutable -> reject_recovery_mutation, 55000, recovery history is append-only |
| jobguard_migration | practice_feed_event | Yes, feed guard still applies | Yes | Yes | Owner privilege; no UPDATE/DELETE trigger. FORCE RLS requires tenant context |
| jobguard_infrastructure | both | No | No | No | 0000:88–89: no app schema access, 42501; 0006 grants only infrastructure.outbox_signal metadata access |
| jobguard_identity | both | No | No | No | 0111:181: no app schema access, 42501; later identity grants do not expose either table |
| PUBLIC | both | No | No | No | No app-schema USAGE (0000); no table/column grant; 0106 explicitly revokes PUBLIC on feed |
| Superuser, ordinary mode | recovery_case | Yes; new pin fires | Trigger refuses | Trigger refuses | recovery_immutable, 55000; privileged actor can disable/bypass guards |
| Superuser, ordinary mode | practice_feed_event | Yes; new pin and merged feed guard fire | Yes | Yes | Privileged actor, outside business runtime trust boundary |

Migration-by-migration effects after the original grants: 0034 changes case columns/INSERT but keeps mutation revoked; 0035/0041 only reference cases; 0097 creates the invoker current view and replaces the controlled landing routine (locks/reads the case, never writes its time); 0106 creates feed SELECT/INSERT privileges and its invoker insert guard; 0107 adds the advisory-lock-only case source trigger; 0112/0115 reference/read case history for follow-up; 0119 changes case-type CHECK and adds a feed composite UNIQUE/FKs, no privileges or timing trigger; 0120 grants identity-only access; 0121 grants only its new audit-export tables; 0122 grants only its new origin tables. All other registered migrations have no effect on these table privileges, policies, owners or triggers. No column UPDATE grant, owner-role membership grant, ALTER DEFAULT PRIVILEGES, global table grant or callable routine permitting a time change was found. `app.configure_recovery_demo` (0023:17–24) is the only merged definer case INSERT, omits created_at and runs as the owner: the pin intentionally includes it. No definer feed writer exists. The landing routine's SELECT FOR UPDATE is not a stored-time mutation.

**Privilege-only statement:** the feed's privilege-only guard is enough for this business-runtime boundary because runtime is a non-owner, cannot grant itself privileges or assume the owner role, and the merged test at `practice-feed.integration.test.ts:637–641` requires exactly INSERT/SELECT and rejects mutations. The owner CAN update a feed row; a superuser can too, and either could remove a trigger. This order is not protection from privileged database administrators. No non-owner application role can change either stored time after insert under the migration-defined grants; no extra UPDATE guard is added. Uninspected deployment grants are not verified here.

## Commands and environment

Node observed: v24.17.0. Repository pnpm pin: 10.28.1; cached version verified by `COREPACK_ENABLE_NETWORK=0 corepack pnpm --version` (exit 0, 10.28.1) and the temporary launcher (exit 0, 10.28.1). The default shell launcher reports 11.8.0 outside the repository (exit 0); two repository-local probes (`pnpm --version`, then `npm_config_manage_package_manager_versions=false pnpm --version`) each exited 1 after a version-switch signature lookup failed. Both emitted the package.json pnpm field/overrides warning and this diagnostic excerpt: `[ERROR] Refusing to run pnpm@10.28.1: its npm registry signature could not be verified (@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed).` No install command was run. The probes created only a local store index; it was removed after the checks. Required checks use the already-cached 10.28.1 executable via a symlink at `/private/tmp/jg-stored-times-bin/pnpm`, prepended to PATH, with `COREPACK_ENABLE_NETWORK=0`; children inherit this launcher. No package downloads are authorized.

- Own-test source type inspection using the installed TypeScript compiler API, strict root options, no emit: exit 0, **0 diagnostics**. It checks the new test and its imports but does not start PostgreSQL or execute assertions. The package's ordinary typecheck includes src only.
- Source-only scope check: exit 0; migration shape, single-line registrations, appended note, unchanged merged test files: PASS. This is deterministic source inspection, not independent review.

Required commands ran once each, one at a time, in the issued order. Each used `PATH="/private/tmp/jg-stored-times-bin:$PATH" COREPACK_ENABLE_NETWORK=0`; the lint commands also used the exact issued `LANE_BASE_REF=origin/main`.

| Command | Exit | Observed counts / result |
| --- | --- | --- |
| `pnpm typecheck` | 0 | 7 successful / 7 tasks; 4 cached; 51.709s. No source diagnostics |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed, 129 TypeScript files. Lane boundary then refused the self-comparison; later lint stages and Turbo package lint were not reached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Lane boundary refused the same self-comparison; no lane pass recorded |
| `pnpm build` | 0 | 7 successful / 7 tasks; 4 cached; 1m26.65s; Next generated 27/27 static pages |
| `pnpm openapi:check` | 1 | tsx IPC listen failed before generation; 0 OpenAPI comparisons executed |

Exact lane diagnostic in both runs:

```text
Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.
```

`HEAD` equals `origin/main` while this sandbox may only edit the working tree. The checker rejects that range before inspecting changes. Its code and the comparison ref were not changed. The dispatcher must rerun both lint commands after committing; source inspection of the allowlist is separate evidence, not a lane-check pass.

Exact OpenAPI environment diagnostic:

```text
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/13299.pipe
code: 'EPERM', errno: -1, syscall: 'listen', port: -1
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @jobguard/api@0.0.0 openapi:check: tsx src/generate-openapi.ts --check
Exit status 1
```

Typecheck/build also emitted `WARNING  IO error: Operation not permitted (os error 1)` while writing Turbo cache; both exited 0. Four tasks in each command replayed cached logs from other worktrees, not fresh compiler execution. Build emitted Next's multiple-lockfile/workspace-root warning and unchanged CSS warnings: `(25:44) autoprefixer: end value has mixed support, consider using flex-end instead` (`practice-receipts.module.css`), `(18:1503)` and `(35:224)` with the same message (`styles.css`), plus webpack's `No serializer registered for Warning`. No unrelated file was edited to address these warnings.

Full logs remain outside the working tree at `/private/tmp/jg-stored-times-typecheck.log`, `jg-stored-times-lint.log`, `jg-stored-times-lint-lanes.log`, `jg-stored-times-build.log` and `jg-stored-times-openapi.log`. These are command evidence, not database test evidence. Generated dist, Next/Turbo output, TypeScript build info and the local store index were removed after verification; dependencies remain installed. Intended commit message: `/private/tmp/jg-msg-stored-times-1.txt`.

## NOT RUN — integrator / CI execution required

Sandbox cannot bind sockets, start PostgreSQL or run a browser. Every database/Playwright case is NOT RUN (sandbox cannot start PostgreSQL / a browser). No unit-only task exists in this lane; no whole package/repository suite is run.

1. `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-timing-pin.integration.test.ts`
2. AC8 merged regressions, unchanged, at most three files per run, one run at a time:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-eligibility-v3.integration.test.ts test/practice-feed.integration.test.ts test/recovery-cases.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-cases.workbench.integration.test.ts test/recovery.integration.test.ts test/recovery-messages.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-follow-up.integration.test.ts test/recovery-follow-up-upgrade.integration.test.ts test/fingerprinted-row-shape.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/extra-origin-upgrade.integration.test.ts test/audit-export.integration.test.ts
pnpm test:migrations
```

No UI change; no browser journey is introduced. Database fresh install, populated upgrade, catalog/RLS and behavior suites remain mandatory before acceptance. Claude Opus review and separate Sol check must follow CI and bind to the committed diff; the builder has supplied neither verdict nor acceptance.

## Self-review

Re-read the entire tracked diff with `git diff origin/main` and the complete new migration, test, contract and receipt files. Re-derived privileges across every merged migration at this base, including later role/schema grants and definer routines. No non-owner application mutation path found; no UPDATE guard added. Source checks confirm one CREATE FUNCTION, one ALTER FUNCTION OWNER, one REVOKE, two CREATE TRIGGER statements, BEGIN/COMMIT and the single pin assignment; no replacement, table alteration, grant, policy, history change or ALWAYS mode. The pin fires before both merged insert guards, neither of which uses the time in its effect/hash.

The test was written first and inspected with the strict TypeScript compiler (zero diagnostics). Self-review corrected the alphabetical expectation for trigger catalog rows and used the full function-identity expression for SQL ordering. All eleven AC IDs have written coverage, with existing behavior labelled as controls; timestamp truth is compared inside PostgreSQL. AC8's actual regression execution remains pending. No merged test or fingerprinted table changed. Shared registrations are one added line each, and the migration note is appended without touching earlier bytes. Added wording uses raw writer, back-dating attempt and chosen time; no rejected wording is added. No new dependency, timeout, retry, skip, provider or UI change. No build or test output remains in the working tree. Final source-only scope inspection passed (exit 0, seven allowed files, merged tests unchanged, commit message present). Its first invocation exited 1 because the wording search incorrectly included pre-existing migration-note text; the corrected invocation inspects only added text and passed. This was a checker-scope correction, not a source change or database test. `git diff origin/main --check` exited 0; the only ignored paths left are installed dependency directories.

Builder receipt only — not independently verified, not accepted.

## Mac verification and upgrade-proof reshape (rule 9)

Repair builder: Claude Sonnet 5.5 (Mac helper for the JobGuard integrator), 11 October 2026, evening. This section is an addendum by a repair builder for the items named below only. It is not a review and not an acceptance. Nothing above this heading was rewritten; where the table row for AC9 above describes the old shape of that test, this section supersedes it.

**Catch-up with main.** `git fetch origin`, then `git merge origin/main` (8e91b2d, the tests-only FIXLATER-3 merge). Merge commit `8675b34`, no conflicts (only `config/agent-lane-assignments.json` auto-merged: one line added each side). Before the merge head was `a8c8ad1`, clean. 0127 is still listed after 0122 in `packages/db/src/migrate.ts`.

**The standing rule (quoted).** "An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'." Here N is 0127. It was made after the order was written, so the order's AC9 wording is superseded on this point.

### What changed in the test (and nothing else)

File `packages/db/test/recovery-timing-pin.integration.test.ts`, commit `4634cde`. AC9 now: installs everything before 0127 and snapshots (unchanged); applies 0127 ALONE the way the runner applies one file (reads the SQL from `MIGRATION_URLS`, runs it, records it in `public.jobguard_schema_migration`); compares the full-strength snapshot, the function and trigger counts (+1 function, +2 triggers) and the "exactly these two triggers call the function, enabled O" query on that 0127-alone state; then runs `migrate()` twice (success required, the second run is the "reapply is inert" check); then compares every pre-existing row of the eight tables by the column names they had before 0127 (a later column cannot fail it), keeps the chosen-time row check, the "registry holds 0127 exactly once" check, and the behavioural checks (a new raw insert is pinned on both tables; the saved review reads back unchanged).

Removed, because the rule forbids it: the `fingerprinted` list and its use in the column snapshot (the fingerprinted-row-shape guard owns "may never gain a column"); the comparison of the whole snapshot (triggers, functions, policies, ACLs, constraints, whole rows) taken after the later migrations; the function and trigger count assertions and the trigger-by-function assertion after the later migrations (they now sit on the 0127-alone state, byte-identical). I kept the two tables' own column lists in the snapshot, on the 0127-alone state only. At that state, whole-row text of `recovery_claim_revision` and `recovery_case_event` (both fingerprinted) is still compared byte for byte, so a column added to those rows by 0127 would still show.

AC1: the "exactly two callers of the function" query was asserted on the final database. It is now limited to the trigger `a_recovery_timing_pin` on the two tables (the exact definition and `tgenabled='O'` are still asserted for both); the exactly-two-callers statement lives on the 0127-alone state in AC9 (the moved `tgfoid` query). AC1's function-own checks (owner, SECURITY INVOKER, `proconfig`, no EXECUTE for the three roles and PUBLIC) are left as they were: they describe the function 0127 created, and a later grant on a trigger function should fail them. AC2 already asserts only "first" and "present" (not a full list); AC10 asserts only names, uniqueness and order. Neither has the fault, so both are unchanged. The AC7 privilege checks on the final database are left as they were for the same reason as AC1's: a later UPDATE grant on either table is exactly what they exist to catch.

**Comparison form (strictness).** Every row comparison in AC9, both on the 0127-alone state and after all migrations, uses canonical text from the database, never values parsed by the driver: `SELECT row_to_json(s)::text` over a sub-select of exactly the named pre-0127 columns, ordered by that same text under `COLLATE "C"`, the form the merged repaired proof uses at `recovery-follow-up-upgrade.integration.test.ts:95`. The driver rounds timestamps to the millisecond, so parsed values would let a sub-millisecond change to a stored time pass; the text form cannot. The builder's original AC9 already compared `row_to_json(...)::text`, and that strictness is kept; nothing was replaced by parsed values.

No set-up repair was needed. No assertion's meaning, expected value, timeout, grant, policy or the migration's behaviour was touched, and no merged test file was changed.

**Literal before/after of every changed test line** (`git diff -U0 a8c8ad1 4634cde -- packages/db/test/recovery-timing-pin.integration.test.ts`; `-` is before, `+` is after):

```diff
@@ -132 +132 @@ it("[AC1] ordinary insert triggers and invoker function have the exact catalog s
-    JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgfoid=$1::regprocedure ORDER BY c.relname`, [functionName])).rows;
+    JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgfoid=$1::regprocedure AND t.tgname='a_recovery_timing_pin' AND c.relname=ANY($2::text[]) ORDER BY c.relname`, [functionName, tables])).rows;
@@ -252 +251,0 @@ const rowTables = ["recovery_case", "practice_feed_event", "practice_feed_comman
-const fingerprinted = ["quote_document_version", "quote_acceptance", "evidence_object", "variation_revision", "variation_approval", "recovery_claim_revision", "recovery_case_event", "material_rate_revision", "supplier_document_version", "supplier_document", "customer_invoice", "discrepancy_review_outcome"];
@@ -262 +261 @@ async function snapshot(db: Pool) {
-    WHERE n.nspname='app' AND c.relname=ANY($1::text[]) GROUP BY c.relname ORDER BY c.relname`, [[...tables, ...fingerprinted]])).rows;
+    WHERE n.nspname='app' AND c.relname=ANY($1::text[]) GROUP BY c.relname ORDER BY c.relname`, [tables])).rows;
@@ -269,0 +269,15 @@ async function snapshot(db: Pool) {
+// Rows compared after ALL migrations are read by the column names that existed before 0127, so a later column cannot fail this proof.
+async function namedColumns(db: Pool) {
+  const named: Record<string, string[]> = {};
+  for (const table of rowTables) named[table] = (await db.query(`SELECT a.attname::text name FROM pg_attribute a
+    WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [`app.${table}`])).rows.map(row => row.name as string);
+  return named;
+}
+async function namedRows(db: Pool, named: Record<string, string[]>) {
+  const rows: Record<string, unknown> = {};
+  for (const table of rowTables) {
+    const list = named[table]!.map(name => `t."${name.replaceAll('"', '""')}"`).join(",");
+    rows[table] = (await db.query(`SELECT row_to_json(s)::text bytes FROM (SELECT ${list} FROM app.${table} t) s ORDER BY row_to_json(s)::text COLLATE "C"`)).rows;
+  }
+  return rows;
+}
@@ -288 +302,4 @@ it("[AC9] populated upgrade preserves every stored row, earlier routine and tabl
-    await migrate(upgradeAdmin); await migrate(upgradeAdmin);
+    const named = await namedColumns(upgradeAdmin), beforeRows = await namedRows(upgradeAdmin, named);
+    // Migration 0127 ALONE, the way the runner applies one file: run its SQL, then record it in the registry.
+    await upgradeAdmin.query(await readFile(MIGRATION_URLS.find(url => basename(fileURLToPath(url)) === migrationName)!, "utf8"));
+    await upgradeAdmin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [migrationName]);
@@ -290,2 +306,0 @@ it("[AC9] populated upgrade preserves every stored row, earlier routine and tabl
-    expect((await upgradeAdmin.query("SELECT created_at=$3::timestamptz kept_chosen FROM app.recovery_case WHERE tenant_id=$1 AND id=$2", [T, old.id, past])).rows).toEqual([{ kept_chosen: true }]);
-    expect((await upgradeAdmin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1", [migrationName])).rows).toEqual([{ n: 1 }]);
@@ -294,0 +310,4 @@ it("[AC9] populated upgrade preserves every stored row, earlier routine and tabl
+    await migrate(upgradeAdmin); await migrate(upgradeAdmin);
+    expect(await namedRows(upgradeAdmin, named)).toEqual(beforeRows);
+    expect((await upgradeAdmin.query("SELECT created_at=$3::timestamptz kept_chosen FROM app.recovery_case WHERE tenant_id=$1 AND id=$2", [T, old.id, past])).rows).toEqual([{ kept_chosen: true }]);
+    expect((await upgradeAdmin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1", [migrationName])).rows).toEqual([{ n: 1 }]);
```

### AC7 as observed: can any role change either stored time after insert?

Observed on the Mac, real embedded PostgreSQL 16.10 (all 27 cases of the file passed; names below are the verbose run). In every refused case the test also re-read the stored `created_at` inside the tenant and found it unchanged.

| Role | Table | What the test did | What it showed |
| --- | --- | --- | --- |
| `jobguard_runtime` | `app.recovery_case` | `UPDATE ... SET created_at`, then `DELETE`, on a visible row | both refused, SQLSTATE 42501 (no privilege); time unchanged |
| `jobguard_runtime` | `app.practice_feed_event` | same two statements on a visible row | both refused, 42501 (no privilege); time unchanged |
| owner `jobguard_migration` | `app.recovery_case` | `UPDATE ... SET created_at` on a row it can see | refused by the merged append-only trigger, 55000, message `recovery history is append-only`; time unchanged |
| owner `jobguard_migration` | `app.practice_feed_event` | `UPDATE ... SET created_at` (control) | NOT refused: the owner can change a feed time. Privilege-only guard, as the builder statement above says |
| `jobguard_infrastructure`, `jobguard_identity` | both tables | `SELECT`, `INSERT`, `UPDATE` each | all refused, 42501; neither role has USAGE on schema `app`; times unchanged |
| catalog check | both tables | `has_table_privilege` / column privileges | runtime, infrastructure, identity and the test login hold no UPDATE, DELETE, TRUNCATE, TRIGGER and no column UPDATE; runtime has INSERT and SELECT; none is superuser, create-role, bypass-RLS or a member of `jobguard_migration` |

Pin itself, as observed: a chosen past (2000-01-01) and a chosen future (2099-01-01) time were both replaced by the transaction's time on `app.recovery_case` (as `jobguard_runtime`; as owner `jobguard_migration`; as superuser in ordinary mode) and on `app.practice_feed_event` (as `jobguard_runtime`, inside a complete valid advance transaction): `pinned` true, `kept_chosen` false in every case. The pre-pin control inside AC9 (the database before 0127) stored the chosen past time on `app.recovery_case` (`pinned` false, `kept_chosen` true, observed); there is no equivalent observed pre-pin run for `app.practice_feed_event`, so for the feed table "fails without 0127" is still source reasoning. The money answers for F18 and F19 held in all five chosen-time scenarios and the four product-only controls.

### Commands, exactly as run

`WT` = `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/stored-times-1`. Node v24.17.0, pnpm 10.28.1, vitest v4.1.11, embedded-postgres 16.10.0-beta.15 (darwin-arm64). Environment for every heavy command: `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 PLAYWRIGHT_SKIP_BROWSER_GC=1`; `memory_pressure | tail -1` showed 78 to 79 percent free before each. Every heavy command ran inside `~/.local/bin/heavy-slot <label> <command>`. Logs: `~/.local/share/full-steam/jg-runs/stored-times-1-mac-*`.

| # | Working directory | Command | Exit | Result |
| --- | --- | --- | --- | --- |
| 1 | `WT` | `git fetch origin` | 0 | origin/main = 8e91b2d |
| 2 | `WT` | `git merge origin/main` | 0 | merge commit 8675b34, no conflicts |
| 3 | `WT` | `heavy-slot stored-times-1-install pnpm install --frozen-lockfile` | 0 | "Already up to date" |
| 4 | `WT/node_modules/.pnpm/@embedded-postgres+darwin-arm64@16.10.0-beta.15/node_modules/@embedded-postgres/darwin-arm64` | `node scripts/hydrate-symlinks.js` | 0 | `native/bin` has initdb, pg_ctl, postgres |
| 5 | `WT` | `heavy-slot stored-times-1-build pnpm turbo run build --filter=@jobguard/db... --concurrency=2` | 0 | 3 tasks, 3 successful (2 cached) |
| 6 | `WT/packages/db` | `heavy-slot stored-times-1-own pnpm exec vitest run --maxWorkers=2 test/recovery-timing-pin.integration.test.ts` | 0 | 1 file, 27 of 27 passed |
| 7 | `WT/packages/db` | same with `--reporter=verbose` (re-run of a passing run, only to list test names; not a retry) | 0 | 1 file, 27 of 27 passed |
| 8 | `WT/packages/db` | `heavy-slot stored-times-1-merged1 pnpm exec vitest run --maxWorkers=2 test/recovery-eligibility-v3.integration.test.ts test/practice-feed.integration.test.ts test/recovery-cases.integration.test.ts` | 0 | 3 files, 63 passed |
| 9 | `WT/packages/db` | `heavy-slot stored-times-1-merged2 pnpm exec vitest run --maxWorkers=2 test/recovery-cases.workbench.integration.test.ts test/recovery.integration.test.ts test/recovery-messages.integration.test.ts` | 0 | 3 files, 154 passed |
| 10 | `WT/packages/db` | `heavy-slot stored-times-1-upgrade pnpm exec vitest run --maxWorkers=2 test/extra-origin-upgrade.integration.test.ts test/fingerprinted-row-shape.integration.test.ts test/recovery-follow-up-upgrade.integration.test.ts` | 0 | 3 files, 17 passed |
| 11 | `WT/packages/db` | `heavy-slot stored-times-1-tenancy pnpm exec vitest run --maxWorkers=2 test/tenancy.integration.test.ts test/demo-bootstrap.integration.test.ts test/recovery-follow-up.integration.test.ts` | 0 | 3 files, 73 passed |
| 12 | `WT/packages/db` | `heavy-slot stored-times-1-audit pnpm exec vitest run --maxWorkers=2 test/audit-export.integration.test.ts` | 0 | 1 file, 11 passed |
| 13 | `WT` | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | "Lane boundary passed", lane `stored-times-1`, 8 files, head 4634cde |
| 14 | `WT` | `heavy-slot stored-times-1-typecheck pnpm --filter @jobguard/db typecheck` | 0 | no diagnostics |
| 15 | `WT` | `heavy-slot stored-times-1-lint pnpm --filter @jobguard/db lint` | 0 | no diagnostics (the package lint is `tsc -p tsconfig.json --noEmit`) |
| 16 | `WT` | `git diff origin/main...HEAD \| grep -nE "^\+.*(key\|token\|secret\|password)[A-Za-z_]*[\"']?\s*[:=]\s*[\"'][^\"']{10,}"` (before this section was added) | 1 | no match |

Runs 6 to 12 executed the test file content that is committed in `4634cde` (the later edits to `BUILD_PLAN.md` and the lane line do not affect any test). Runs 8 to 12 cover the 11 merged files named in the order's AC8 list that are database tests, plus `tenancy` and `demo-bootstrap`: 13 merged test files, 318 tests, all passed, none edited. No fault, no failure and no timing re-run occurred. Run 6 is the only run counted for the 27; run 7 is the same file again with a verbose reporter.

Not run, on purpose: `pnpm test:migrations`, `pnpm test`, `pnpm test:db` and any package `test` script (machine rules); the repository-wide `pnpm lint` (only the lane check and the `packages/db` typecheck and lint were run); `pnpm openapi:check`; any other package's tests; the "fails without 0127" red run of AC3/AC4 (not required).

Push and pull request were run after this section was committed: `git push -u origin codex/sandbox/stored-times-1` (no force) and `gh pr create --base main`; the pull request carries their result. A second run of the added-lines scan over the final diff, including this section, is the gate before the push.

Repair-builder addendum only — not an independent review and not an acceptance. The fresh Claude Opus review and the separate Sol check (check lane RED) are still to come.
