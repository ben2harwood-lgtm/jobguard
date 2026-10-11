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
