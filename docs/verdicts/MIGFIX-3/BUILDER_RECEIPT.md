Built by Codex; repair r1 dispatched 14 Oct 2026, dispatcher 5.

# MIGFIX-3 repair r1 — builder evidence, acceptance pending

This section supersedes the historical receipt below for current status, grants, catalogue permission and HEAD. The original receipt is preserved verbatim as historical evidence, including old hashes and base/final-head statements. Current branch `codex/sandbox/migfix-3`, worktree `m4-6-s`, initial/final HEAD `fa59263ea4bddf728271958057969d5234e9383a`, observed `origin/main` `077ab6383e1d3c35e6ac37691f557e67c551011d`. The initial r1 working tree was clean. Repairs are uncommitted. No git-writing command, install, package download, database/browser start, push, merge or release was performed.

Read the Opus verdict `/Users/benharwood/.local/share/full-steam/jg-runs/migfix-3-opus-fa59263.md` in full, AGENTS, applicable BUILD_PLAN §§2, 5.2, 5.3 and 5.6, issued/r1 orders, audit contract and merged 0015/0096 policy examples. Opus recorded **REPAIR**, source inspection only, bound to fa59263e. No fresh independent verdict or separate acceptance exists for this repair. Actual builder attribution remains Codex.

## B1–B7 disposition

- **B1 repaired:** both policy `format()` strings use `nullif(current_setting(''app.tenant_id'',true),'''')::uuid` in USING and WITH CHECK. They decode to the merged quoted-setting and empty-string form.
- **B2/B3 repaired together:** declaration, ALTER OWNER, REVOKE, GRANT and TypeScript call use eight UUID arguments. Eight placeholders now match the existing eight bound values.
- **B4 repaired:** invalidation's upload-lock query uses alias `proof_object`, preserving record variable `e`, the upload lock and the separate authoritative read.
- **B5 repaired:** appended the 0152 MIGRATIONS.md entry with privileges, compatibility, forward fix, integrity alert and pending PostgreSQL evidence; added that path to this lane.
- **B6 evidence pending:** failing-first cannot run in this sandbox. No executed red-on-base or green-on-repaired-head result exists for either PostgreSQL file. B1–B4 previously prevented installation; a failed install at fa59263e does not prove the domain regression. Mac/CI must record red on original base `bd959b01e857de0ba7cbd3588bab84add7d0f493` and green on the dispatcher-committed repaired head for `packages/db/test/migfix-3.integration.test.ts` (12 cases) and `packages/db/test/migfix-3-upgrade.integration.test.ts` (one case) before any PASS. Test authorship order and source inspection are not executed failing-first evidence.
- **B7 repaired with r1 dispatcher approval:** inserted exactly the historical receipt's six proposed catalogue rows at its four before/after anchors (base lines 292, 369, 533, 610), in name order; added the tenancy path to this lane and corrected only this lane's stale ownership note. Removing those six rows reproduces the HEAD tenancy file byte for byte. No existing expected value, refusal, count, pinned name, fingerprint or hash was changed. No context-boundary edit.

Exact B7 before/after, now applied under r1 approval:

```ts
// Before at 292:
      { relname: "proof_application_response", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
// After:
      { relname: "proof_application_response", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "proof_invalidation_command", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "proof_invalidation_response", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
// Before at 369:
      { relname: "stage_completion", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
// After:
      { relname: "stage_completion", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "stage_proof_replacement", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
// Before at 533:
      { relname: "proof_application_response", owner: "jobguard_migration" },
// After:
      { relname: "proof_application_response", owner: "jobguard_migration" },
      { relname: "proof_invalidation_command", owner: "jobguard_migration" },
      { relname: "proof_invalidation_response", owner: "jobguard_migration" },
// Before at 610:
      { relname: "stage_completion", owner: "jobguard_migration" },
// After:
      { relname: "stage_completion", owner: "jobguard_migration" },
      { relname: "stage_proof_replacement", owner: "jobguard_migration" },
```

## Whole-migration inspection and current runtime grants

Reread all 243 lines of 0152 after repair, every `format()` string, function/block and final deferred-audit triggers/COMMIT. A one-off Python lexical check found eight matched dollar-quoted bodies (two DO, six functions), eight BEGIN/END pairs, 19 IF/END IF pairs, three LOOP/END LOOP pairs, no CASE, balanced parentheses/quoted literals in each body and all nine format strings, one outer BEGIN/COMMIT and consistent replacement signatures. Both decoded CREATE POLICY statements were inspected. This is **static/source evidence**, not PostgreSQL parsing, installation or PL/pgSQL execution.

Standard F: no new direct runtime INSERT/UPDATE/DELETE grant on money, membership, authorization, receipt or audit; new history/response tables allow SELECT only and checked migration-owned writers check active owner authority. Current runtime grants (historical nine-UUID signature below is superseded), one line each:

```sql
GRANT SELECT ON app.stage_proof_replacement TO jobguard_runtime;
GRANT SELECT ON app.proof_invalidation_command TO jobguard_runtime;
GRANT SELECT ON app.proof_invalidation_response TO jobguard_runtime;
GRANT SELECT ON app.current_stage_proof TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.invalidate_proof_command(uuid,uuid,uuid,uuid,varchar,char) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.record_invalidation_response(uuid,uuid,uuid,char,jsonb) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.replace_stage_proof(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO jobguard_runtime;
```

No backfill, existing-row rewrite, production-policy change, external action or release-gate advance. Original completion uniqueness, closed kind/action checks, refusals and stored-artifact hashes stay intact. Install migration/readers together and retain history through a reviewed forward fix. Opus's LATER items (narrower migration-role policies, session-bound actor and replay/access ordering confirmation) remain outside r1.

## Commands actually run in r1

Node v24.17.0; resource samples before heavy work: 83% free memory, 37 GB free disk. Unit runs selected one existing proof file at a time with `--maxWorkers=2`; no whole package/repository test suite. Executing builds/tests did not overlap; attempted pnpm build never reached a build task. Direct checks execute installed tools; they are supplementary, not completion of the pinned pnpm/Turbo gate. No reinstall or intentional download was attempted.

| Command | Exit | Result |
|---|---:|---|
| PATH prefixed as issued, `pnpm exec turbo run typecheck --force` | 130 | launcher stalled; interrupted; no Turbo tasks |
| same PATH, `LANE_BASE_REF=origin/main pnpm lint -- --force` | 130 | launcher stalled; interrupted before lint |
| same PATH, `LANE_BASE_REF=origin/main pnpm lint:lanes` | 130 | launcher stalled; interrupted before lane check |
| same PATH, `pnpm build --concurrency=2 --force` | 130 | launcher stalled; interrupted; no build tasks |
| same PATH, `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 130 | launcher stalled; interrupted; no Turbo tasks |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0 | core purity (158 files), lane, money and commercial boundary checks passed |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 0 | passed including working-tree paths against origin/main |
| `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` | 0 | DB source typecheck passed |
| `./node_modules/.bin/vitest run src/proof/proof.application.test.ts --maxWorkers=2` in apps/api | 0 | one file, 9/9 existing unit tests |
| `./node_modules/.bin/vitest run src/proof.test.ts --maxWorkers=2` in packages/core | 0 | one file, 9/9 existing unit tests |
| `./node_modules/.bin/tsx src/generate-openapi.ts --check` in apps/api | 1 | IPC permission refusal before verification; NOT RUN |
| `./node_modules/.bin/tsc -p packages/config/tsconfig.json --noEmit` | 0 | source typecheck / package lint compiler passed |
| `./node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit` | 0 | source typecheck / package lint compiler passed |
| `./node_modules/.bin/tsc -p packages/storage/tsconfig.json --noEmit` | 0 | source typecheck / package lint compiler passed |
| `./node_modules/.bin/tsc -p packages/ai/tsconfig.json --noEmit` | 0 | source typecheck / package lint compiler passed |
| `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` | 0 | source typecheck / package lint compiler passed |
| `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` | 0 | source typecheck / package lint compiler passed |
| `./node_modules/.bin/tsc -p packages/config/tsconfig.json` in . | 0 | direct build passed; log `/private/tmp/jg-migfix-3-r1-build-0.log` |
| `./node_modules/.bin/tsc -p packages/core/tsconfig.json` in . | 0 | direct build passed; log `/private/tmp/jg-migfix-3-r1-build-1.log` |
| `./node_modules/.bin/tsc -p packages/storage/tsconfig.json` in . | 0 | direct build passed; log `/private/tmp/jg-migfix-3-r1-build-2.log` |
| `./node_modules/.bin/tsc -p packages/ai/tsconfig.json` in . | 0 | direct build passed; log `/private/tmp/jg-migfix-3-r1-build-3.log` |
| `./node_modules/.bin/tsc -p packages/db/tsconfig.json` in . | 0 | direct build passed; log `/private/tmp/jg-migfix-3-r1-build-4.log` |
| `./node_modules/.bin/nest build` in apps/api | 0 | direct build passed; log `/private/tmp/jg-migfix-3-r1-build-5.log` |
| `./node_modules/.bin/next build` in apps/web | 0 | direct build passed; log `/private/tmp/jg-migfix-3-r1-build-6.log` |
| one-off Python SQL/scope and migration/hash checks | 0 | structural inspection; six additive rows; protected files/other migrations/lanes unchanged |
| Python receipt/message write | 1 then 0 | first attempt had a quoting SyntaxError before any write; corrected attempt wrote this section and message |
| `git diff --check` (initial/final) | 0 | no whitespace errors |

Pnpm launcher points to global v11, prints the ignored `pnpm.overrides` warning and stalls. No package command completed through it; exact repository package-manager pin was not verified. Each stalled command was interrupted via tool stdin Ctrl-C, exit 130; no cleanup/git write. Requested cache-off commands were attempted with `--force`, but no Turbo task ran and none is claimed green. Direct typecheck/build commands executed; source typecheck and package lint compiler are the same configured `tsc --noEmit`, run once per package. Next build passed with existing workspace-root and CSS `end`/`flex-end` warnings. Logs: `/private/tmp/jg-migfix-3-r1-typecheck.json`, `/private/tmp/jg-migfix-3-r1-build.json`, build logs 0–6.

Read-only inspection ledger (zero tests): `pwd`, `git status --short`, `git rev-parse HEAD origin/main`, `git branch --show-current`, `git diff --stat/--numstat`, `git diff -- <paths>`, `git show HEAD:<path>`, `rg --files`, `rg -n`, `cat`, `head`, `tail`, `sed`, `ls -l`, `command -v pnpm`, `node --version`, memory/disk queries, package/tool/contract/order/verdict reads returned 0 except an initial optional/guessed-path group returned 1 for absent guessed migration names `0015_proof_invalidation.sql` / `0096_shadow_signal_privacy.sql`; actual `0015_proof_stage_gates.sql` / `0096_watchdog_live.sql` were found/read next. Some search groups bounded output with `head`; no failed runtime check was treated as passed. Edit Python heredoc returned 0; receipt's initial quoting error returned 1 before writing, corrected heredoc 0. All inspection evidence remains distinct from executed tests and independent verification.

## NOT RUN, Mac/CI and exact STOP

The sandbox cannot bind localhost or start PostgreSQL/browser. NOT RUN:

- `packages/db/test/migfix-3.integration.test.ts`: all 12 acceptance/race/rollback/authority/grant/RLS cases.
- `packages/db/test/migfix-3-upgrade.integration.test.ts`: `[MIGFIX-3.U1]` fresh/upgrade/repeat, named-column/full-type/identity/microsecond preservation and controls.
- `packages/db/test/tenancy.integration.test.ts`: catalogue/RLS/grants including the approved new-table rows.
- `apps/web/e2e/proof-capture.spec.ts`: including `[MIGFIX-3.1/2/3] original-stage replacements repair the final-account gate and invalidation replays its first response`.
- Root `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, full mandatory browser suites and pinned forced checks: dispatcher/GitHub CI ownership. No mandatory suite became optional. No AI/prompt/model change; eval inapplicable to r1.

Exact Mac commands after dispatcher commit (not executed here):

```sh
~/.local/bin/heavy-slot migfix-3-r1 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/migfix-3.integration.test.ts test/migfix-3-upgrade.integration.test.ts test/tenancy.integration.test.ts
~/.local/bin/heavy-slot migfix-3-r1-browser pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop proof-capture.spec.ts
pnpm openapi:check
```

Additionally record B6 red-on-original-base, green-on-repaired-head for both named MIGFIX files before any PASS. The cited other-piece `proof-invalidation.integration.test.ts` remains absent here; integration is dispatcher-owned. The historical shared-harness optional extra typecheck diagnostic was not rerun or edited.

**STOP — OpenAPI:** exact command `./node_modules/.bin/tsx src/generate-openapi.ts --check` in apps/api. Exact refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/66355.pipe`. Stopped that item; no alternate IPC route or escalation tried. Former catalogue permission STOP is resolved by r1 approval. PostgreSQL execution and failing-first evidence remain pending.

## Scope and current hashes

All other lane entries and migration files match their HEAD bytes; MIGRATIONS.md is appended only. Both MIGFIX test files, browser spec, context-boundary.test.ts, watchdog.ts, command-replay-contract test and shared harness match HEAD byte for byte. Removing exactly the six approved catalogue additions gives the original tenancy bytes. Historical receipt and existing hashes below are preserved. Current repaired-file hashes are new evidence, not changed pins:

| Path | Working SHA-256 |
|---|---|
| `packages/db/migrations/0152_proof_replacement_commands.sql` | `2b8d187e7207077d277bcd4646904ecddc8b41dc6b7f02ae770e474da946e835` |
| `packages/db/src/proof-repository.ts` | `6d365f478a6973d5b3dad1f5c3278da0dc6addafa578165f6c1e8a4848d68aec` |
| `packages/db/test/tenancy.integration.test.ts` | `189e9e850101a35309e3447fb8aecc1ab1680c12f4dcf4b44c58f8357f489c63` |
| `packages/db/MIGRATIONS.md` | `22a8d458970f192e804221d18f3e480d0c1259dc0a7c2f323111b162fe79bcf9` |
| `config/agent-lane-assignments.json` | `906421c4698c4c8c3becdb05a51c505842bab58a5eb0faf9ab538aa5cf9b9da4` |

Implementation diff against fa59263e (receipt excluded explicitly):

```text
 config/agent-lane-assignments.json                         |  2 +-
 packages/db/MIGRATIONS.md                                  |  8 ++++++++
 packages/db/migrations/0152_proof_replacement_commands.sql | 14 +++++++-------
 packages/db/src/proof-repository.ts                        |  2 +-
 packages/db/test/tenancy.integration.test.ts               |  6 ++++++
 5 files changed, 23 insertions(+), 9 deletions(-)
```

Final HEAD remains `fa59263ea4bddf728271958057969d5234e9383a`; repairs are uncommitted for dispatcher commit. Intended conventional commit message `/private/tmp/jg-msg-migfix-3.txt` is overwritten for r1. Changed paths: this receipt, lane registry, MIGRATIONS.md, 0152, replacement call and six catalogue rows. Fresh exact-commit independent verdict, separate acceptance, failing-first evidence, PostgreSQL/browser CI, OpenAPI and pinned checks remain required. No acceptance/release is claimed.

---

# Historical initial-build receipt (verbatim; superseded by r1 above)

Built by Codex; dispatched 13 Oct 2026.

# MIGFIX-3 builder receipt — partial, RED

This is an uncommitted builder result, not technical acceptance. The dispatch addendum supplied a Claude attribution; this receipt records the actual builder instead. No model verdict or separate acceptance has been produced. The dispatcher must bind review to the eventual commit.

## Checkout and authority

- Issued and observed base/head: `bd959b01e857de0ba7cbd3588bab84add7d0f493`. `origin/main` is the same SHA. Branch `codex/sandbox/migfix-3`; reused worktree `m4-6-s` exactly as the header permits. Initial working tree was clean. No git write, commit, push, PR or package install was performed.
- Read repository `AGENTS.md`, applicable `BUILD_PLAN.md` proof/evidence contracts and task mapping, the issued MIGFIX-3 order, and the standing handoff. This work preserves the proof and tenant invariants; release gates remain held.
- Main wins over the cited API-PROOF receipt: its B1/B3a repairs and `proof-invalidation.integration.test.ts` are not on this base. Its proposed extension of the closed kind/action CHECKs is superseded by this order's separately guarded registry. The issued source files receive the lock/audit repairs here; no file from that other worktree was copied or overwritten.
- Installed Node: `v24.17.0`. The pnpm launcher targets a global v11 executable and emits the v11 ignored-overrides warning; its tools directory contains 11.8.0 and 9.0.0, not the repository's pinned 10.28.1. Repository pnpm invocations did not reach their requested command and were interrupted with exit 130. No download was authorized or attempted deliberately. These attempts are not green checks.
- Resource samples: 80–82% free memory, 37–38 GB free disk, above the issued 35%/35 GB stop lines. No database or browser process was started. No heavy-slot database/browser command ran because those runs are expressly unavailable here.

## Result built for review

Migration `0152_proof_replacement_commands.sql` adds three tenant-owned append-only tables, two additional candidate keys, checked writers, collision triggers and a security-invoker current-proof view. No old migration, closed command-kind/action CHECK, fingerprinted-table column or original completion/receipt row is changed.

`stage_proof_replacement` binds the original completion and stage, the reviewed invalidation, replacement evidence link, generation/previous replacement, actor, receipt, approved proof Decision resolution and same-transaction audit event. Its writer locks the replacement upload before its eligibility read and checks owner authority, current invalidation, live job, finalized original evidence of the original required type, exact receipt identity and the matching rework Decision. It leaves the original stage-wide uniqueness intact. Replacement receipts use `replacement.v1:<invalidation-id>`; old command results keep their old hashes and semantic keys.

`proof_invalidation_command` binds evidence/job, actor, reason, request hash, original invalidation ID and first result. The SQL writer locks the upload in a separate statement before effects, serializes on the existing watchdog command-ID key, and checks old registries. Old registry inserts check the new registry under that same key. Exact retries replay; changed payloads/kinds conflict. A fresh command on already invalidated evidence records its own no-op result without another business audit event. New business events refer to the stored invalidation ID. Deferred checks require the correctly bound audit row from the same transaction.

`proof_invalidation_response` records the application's first response through a checked writer, in the transaction that creates its effect. Replays re-check active membership and return the stored response. The API now includes invalidate in application replay handling, without inserting it into the old closed response table. Proof and newly assembled final accounts read the latest generation; the original `electrical-stage` and original completion ID remain stable. No storage/network call occurs inside a business transaction.

The new SQL writers use the existing synthetic owner role and re-check active/unexpired/unrevoked membership internally. The actor for response recording comes from the persisted command. This does not enable a wider contractor proof permission matrix or production processing. Existing route phases, watchdog guard counts and shared replay harness are untouched. No new route was registered and no screen was changed.

## Tests first and acceptance evidence

The two new PostgreSQL files were written before the SQL/application implementation. First failing run: **NOT RUN (cannot start PostgreSQL here)**, as the dispatch addendum requires. Static inspection of main identifies the absent tables/view, consumed original-stage semantic key and invalidation replay bypass; this is source evidence, not an executed red regression. The browser regression was added later as supplementary workflow coverage, not as an executed failing-first result.

| Acceptance | Authored coverage | Execution |
|---|---|---|
| MIGFIX-3.1 | original-stage E1→E2, one completion, preserved original replay, approved replacement Decision | NOT RUN |
| MIGFIX-3.2 | E2 invalidation blocks; E3 repairs; both replacement generations retained | NOT RUN |
| MIGFIX-3.3 | first response replay, changed evidence/reason/job/kind conflict, stored-ID audit and fresh-ID no-op | NOT RUN |
| MIGFIX-3.4 | concurrent identical/conflicting IDs; original completion IDs and receipt insert collisions; unique replacement retry | NOT RUN |
| MIGFIX-3.5 | response failure rollback, missing-audit commit failure, replacement rollback, expired/revoked actors, authority before lifecycle | NOT RUN |
| MIGFIX-3.6 / B1 / B3a | both upload-lock race directions using server lock catalogues | NOT RUN; cited other-piece suite absent on main |
| MIGFIX-3.7 | SELECT-only runtime access, FORCE RLS/owner catalogues, foreign tenant reads, pending/rejected/wrong-type/wrong-job proof refusals | NOT RUN |
| MIGFIX-3.U1 | before N seed/snapshot; N alone; preserve existing function/CHECK definitions at N; all later migrations and runner twice; fresh runner twice; preservation controls | NOT RUN |
| MIGFIX-3.1/2/3 browser | three generations through existing HTTP commands, final-account proof gate, exact invalidate response replay | NOT RUN |

There are 12 new integration cases, one upgrade case and one added browser case. The normal mandatory database Vitest glob includes both new `.test.ts` files; CI configuration was not edited. The existing API unit file and core proof unit file each passed 9 tests (18 distinct existing tests). These are supplementary unit results, not verification of the new SQL. The API file was repeated after the typed-error mapping change and again passed 9/9.

## Rule 9 upgrade proof

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

The proof uses the existing `upgrade-proof-utils.ts`: named-column `row_to_json(... )::text`, original primary-key identities, and every pre-existing name/full `format_type`. It seeds at least one original row in each of the eight compared proof/receipt/identity tables. Only old identities are compared afterwards; later inserts are ignored. Rolled-back controls use the same comparison code: a one-microsecond time change and a semantic-key retype must fail; an added nullable column, replaced function and later receipt insert must pass. Existing function definitions and closed CHECK definitions are compared at N's step only. No assertion freezes later functions/columns or merged file bytes. The integration test installs with the actual runner twice in a fresh database and twice after N; all of this remains NOT RUN.

## New GRANTs — Standard F

Standard F: **no new direct INSERT/UPDATE/DELETE grant to `jobguard_runtime` on money, membership, authorization, receipt or audit data. New history/receipt tables grant SELECT only; writes run through SECURITY DEFINER functions owned by `jobguard_migration`, with their own owner/active-membership check.** The following are all new runtime grants, expanding the migration's table loop one line each:

```sql
GRANT SELECT ON app.stage_proof_replacement TO jobguard_runtime;
GRANT SELECT ON app.proof_invalidation_command TO jobguard_runtime;
GRANT SELECT ON app.proof_invalidation_response TO jobguard_runtime;
GRANT SELECT ON app.current_stage_proof TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.invalidate_proof_command(uuid,uuid,uuid,uuid,varchar,char) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.record_invalidation_response(uuid,uuid,uuid,char,jsonb) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.replace_stage_proof(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO jobguard_runtime;
```

The three tables ENABLE/FORCE RLS and have explicit runtime write/TRUNCATE revocations and immutable update/delete triggers. New functions revoke PUBLIC/infrastructure execution; internal authority/namespace/audit helpers also revoke runtime execution. Migration-role policies on three existing proof tables are tenant-qualified and do not grant runtime writes. Database privilege/catalogue assertions are authored but unexecuted.

## Commands and results

No whole repository/package test suite was run. Test runs each select one file and use `--maxWorkers=2`. Build and test did not overlap. Compiler commands below use installed binaries directly and are supplementary; they do not replace the held pinned pnpm/Turbo checks.

| Command (repository root unless specified) | Exit | Result/count |
|---|---:|---|
| `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm exec turbo run typecheck --force` (preceded by memory/disk samples) | 130 | interrupted launcher; 0 Turbo tasks executed |
| `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --version` (after Node/catalogue inspection) | 130 | interrupted launcher; Node printed v24.17.0 |
| `export PATH="$HOME/Library/pnpm/bin:$PATH"; npm_config_manage_package_manager_versions=false pnpm --version` | 130 | interrupted launcher; no version result |
| `export PATH="$HOME/Library/pnpm/bin:$PATH"; LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 130 | interrupted launcher; 0 Turbo tasks executed |
| `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm build --concurrency=2 --force` | 130 | interrupted launcher; 0 Turbo tasks executed |
| `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` | 0 | source typecheck; no diagnostics |
| `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` (preceded by memory/disk samples) | 0 | source typecheck; no diagnostics |
| `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` | 0 | source typecheck; no diagnostics |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 1 | core purity passed, 158 files; stopped at lane self-comparison |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1 | self-comparison refusal; no source edit |
| `./node_modules/.bin/tsc -p packages/db/tsconfig.json` | 0 twice | supplementary build; second run after typed-error source change |
| `./node_modules/.bin/nest build` (apps/api; preceded by memory/disk samples) | 0 | supplementary API build |
| `../../node_modules/.bin/vitest run src/proof/proof.application.test.ts --maxWorkers=2` (apps/api) | 127 | root Vitest link absent; 0 tests executed |
| `./node_modules/.bin/vitest run src/proof/proof.application.test.ts --maxWorkers=2` (apps/api) | 0 twice | one file, 9/9 tests each run |
| `./node_modules/.bin/vitest run src/proof.test.ts --maxWorkers=2` (packages/core) | 0 | one file, 9/9 tests |
| `./node_modules/.bin/tsc -p /private/tmp/jg-migfix-3-tests-tsconfig.json` | 2 twice | initial three own-test diagnostics repaired; final only the pre-existing shared-harness diagnostic at :164 |
| `./node_modules/.bin/tsx src/generate-openapi.ts --check` (apps/api) | 1 | refused IPC listen before OpenAPI check; NOT RUN |
| `./node_modules/.bin/next build` (apps/web; preceded by memory/disk samples) | 1 then 0 | initial stale core output missing exports; after core rebuild, compilation/type validation and 31 static pages completed |
| `./node_modules/.bin/tsc -p packages/core/tsconfig.json` (preceded by memory/disk samples) | 0 | repaired local dependency build output; no source edit |
| `git diff --check` | 0 throughout | no whitespace errors |
| `git rev-parse HEAD`, `git rev-parse origin/main`, `git branch --show-current`, `git status --short`, `git diff --numstat`, `git diff --stat` | 0 | read-only checkout/diff evidence |
| `memory_pressure | tail -1`, `df -g /System/Volumes/Data` | 0 | all sampled resources above stop lines |
| `command -v pnpm`, `ls -l "$HOME/Library/pnpm/bin/pnpm"`, `cat "$HOME/Library/pnpm/bin/pnpm"` | 0 | observed installed launcher; no modification |
| `ps -axo pid,ppid,etime,command | rg 'pnpm|turbo|typecheck' | head -16` | diagnostic refused | `zsh:1: operation not permitted: ps`; pipeline status was masked by head; not retried |

Inspection/edit ledger (zero tests for every entry): shell `pwd`/initial status/head/base/resource group (0); `rg --files` task/path discovery (0); AGENTS/BUILD_PLAN/proof-repository and application-record reads (0); standing handoff/0015/application reads (0); proof repository/replay/plan/final-account inspection (0 as a combined invocation; missing guessed `0012_watchdog_commands.sql` was reported and the actual `0012_job_activation.sql` was used); migration/identity/upgrade-harness/registry/package reads (0); auth-boundary/0096/catalogue inspections (0); targeted namespace/upgrade utility/harness reads (0); application receipt/closed-kind/package inspections (2, missing guessed `0003_audit.sql`; actual `0001_audit.sql` then read); task/stack/migration registration inspection (1, no grep match); source receipt/harness/read-only identity queries (2, absent other-worktree guessed `audit-api-proof.integration.test.ts`; actual `proof-invalidation.integration.test.ts` then inspected); routine policy/evidence metadata reads (0); package-version/config/direct binary discovery groups (1 when a nonexistent optional directory or `.npmrc` was selected; no permission refusal); matched phase/authority scans (one zsh unmatched optional glob; actual contract/membership files then inspected); API unit/openapi/build-source reads (0); source line/count/hash/whitespace inspections (0). `rg`, `sed`, `cat`, `head`, `tail`, `ls` and `wc` were read-only. No missing guessed path was treated as evidence that a feature was absent until the actual file was inspected.

Edit commands were `python3 - <<'PY'` heredocs (exit 0): (1) initial 7 integration cases; (2) initial upgrade test; (3) SQL migration; (4) proof/application/final-account integration and two shared registrations; (5) response ordering/upgrade fixture/browser addition; (6) qualified invalidation key and deferred audit binding; (7) additional races/rollback/authority cases; (8) pending/rejected/tenant cases; (9) test typing corrections; (10) typed SQL error mapping; (11) upgrade context/old replay rows; (12) temporary test-typecheck config; (13) protected hash manifest; (14) this receipt/intended commit message; (15) explicit replacement-upload locking inside the checked SQL writer and the corresponding receipt hash update; final receipt/hash/changed-path checks. Heredoc bodies are represented by the authored files and tool transcript, not repeated as code listings here. The hash helper used read-only `git ls-files` and `git show HEAD:<path>` and wrote only its temporary manifest. Interrupts used `write_stdin` with Ctrl-C, each exit 130; no forceful git/process cleanup was used.

## NOT RUN and exact STOP lines

- `packages/db/test/migfix-3.integration.test.ts`: NOT RUN (cannot start PostgreSQL here).
- `packages/db/test/migfix-3-upgrade.integration.test.ts`: NOT RUN (cannot start PostgreSQL here).
- `apps/web/e2e/proof-capture.spec.ts`: NOT RUN (cannot start a browser/PostgreSQL here).
- Existing B1/B3a suite `packages/db/test/proof-invalidation.integration.test.ts`: NOT RUN, not present on this main; external other-piece observer-based fixtures are not copied into this lane. Its observers match the old direct SQL invalidation statements, whereas this migration runs those statements inside a checked routine. Dispatcher must integrate/review that suite rather than claiming it ran here.
- Existing database regression suites, `pnpm test`, `pnpm test:db` and `pnpm test:migrations`: NOT RUN per sandbox and whole-suite ownership restrictions. The new cases cannot be described as passing.
- Pinned clean-install/typecheck/lint/build: NOT RUN to completion, launcher interruption. `--force` was supplied in all three prescribed attempts; none produced a cache-hit or a task execution. Direct build/compiler results above are supplementary.
- OpenAPI: STOP, exact command `./node_modules/.bin/tsx src/generate-openapi.ts --check` from apps/api. Refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/33602.pipe`. No alternate launch route was tried.
- Process diagnostic: STOP, exact command `ps -axo pid,ppid,etime,command | rg 'pnpm|turbo|typecheck' | head -16`. Refusal `zsh:1: operation not permitted: ps`. No alternate process-enumeration route was tried.
- Lane tool: STOP at `tools/agent-lane-boundary-lint.mjs:212`; unchanged line `if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");`. Before = after. Dispatcher committing this authorized diff supplies a distinct target; no tool relaxation is requested.

**Coordinator-owned catalogue prerequisite — STOP, no edit performed.** This order does not explicitly allow the merged tenancy test to be edited. Both assertions need the new table rows in name order before a full CI verdict can pass. Exact base anchors and required additive after-state:

`packages/db/test/tenancy.integration.test.ts:292` before:
```ts
      { relname: "proof_application_response", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```
After (coordinator only):
```ts
      { relname: "proof_application_response", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "proof_invalidation_command", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "proof_invalidation_response", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```
`packages/db/test/tenancy.integration.test.ts:369` before:
```ts
      { relname: "stage_completion", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```
After (coordinator only):
```ts
      { relname: "stage_completion", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "stage_proof_replacement", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```
`packages/db/test/tenancy.integration.test.ts:533` before:
```ts
      { relname: "proof_application_response", owner: "jobguard_migration" },
```
After (coordinator only):
```ts
      { relname: "proof_application_response", owner: "jobguard_migration" },
      { relname: "proof_invalidation_command", owner: "jobguard_migration" },
      { relname: "proof_invalidation_response", owner: "jobguard_migration" },
```
`packages/db/test/tenancy.integration.test.ts:610` before:
```ts
      { relname: "stage_completion", owner: "jobguard_migration" },
```
After (coordinator only):
```ts
      { relname: "stage_completion", owner: "jobguard_migration" },
      { relname: "stage_proof_replacement", owner: "jobguard_migration" },
```

**Shared harness diagnostic — STOP, optional extra test-typecheck remains red, no edit performed.** `packages/db/test/watchdog-command-harness.ts:164:91` reports TS2345 for `ids[0]` (`string | undefined`). The regular source typecheck excludes this existing test code. This does not establish a runtime failure of the new tests; it prevents claiming a green extra typecheck. Coordinator-owned suggested tightening, if that extra check is desired:

Before:
```ts
    later: async job => { const ids = await pre.inbox(job); await inbox.dismiss(ctx, job, ids[0], { commandId: randomUUID() }, member); },
```
After (coordinator only, suggested explicit fixture guard):
```ts
    later: async job => { const ids = await pre.inbox(job); const first = ids[0]; if (!first) throw new Error("MISSING_INBOX_FIXTURE"); await inbox.dismiss(ctx, job, first, { commandId: randomUUID() }, member); },
```

## Builder source inspection — not an independent verdict

Checked the new GRANT list, immutable original completion key, original closed CHECKs, replay hash shape, upload-lock statement ordering, same-transaction callback/response/audit handling, matching rework Decision, tenant/job/scope FKs, current-proof readers and Rule 9 proof shape. This inspection found and repaired test typing errors, the upgrade fixture's missing tenant context/metadata, stale local core output and typed SQL error propagation. No shared test/pin was changed to make a check pass. SQL execution, lock races and catalogue grants still require real PostgreSQL verification; no claim of independent verification is made.

LATER: the parked proof screen disables attachment/completion after the first completion; exposing replacement controls belongs to the future UI owner. The added browser test uses existing HTTP commands and does not add a screen. Existing Next workspace-root/CSS warnings are reported by the supplementary build; no unrelated wording/style change is included.

## Deployment, compatibility and forward fix

No data backfill or destructive normalization. Install migration and updated readers together; old clients retain original completion replays but do not understand replacements. Runtime cannot alter/delete new history. Rollback strategy is feature disable plus a reviewed additive forward fix; preserve installed rows and audit history rather than dropping tables or rewriting commercial history. `COMMAND_CONFLICT`/`IDEMPOTENCY_CONFLICT` remain typed refusals; `PROOF_AUDIT_REQUIRED` is a new integrity failure that should alert the database/application operator. No new external action, provider route, payment rail or production capability was enabled. No fee or authority release gate advances. Historical invalid data, if encountered by CI/install, must be reported and held, not rewritten.

## Scope hashes and diff

83 pre-existing migration/protected files matched their HEAD bytes. Temporary expanded manifest: `/private/tmp/jg-migfix-3-protected-manifest.json`; canonical manifest SHA-256 `96e4a935a246e0f1d7dc9684157a67e0a0362bbc8599b6eb8baad5579eacedcb`. Every tracked modified path is in this task's additive lane registration. All original lines of the existing browser spec and all existing lane entries remain present; no protected source, merged migration, shared harness or catalogue test changed.

| Protected file | Equal base/working SHA-256 |
|---|---|
| `apps/api/src/auth/context-boundary.test.ts` | `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35` |
| `packages/core/src/watchdog.ts` | `1628a2c3dc2d24cdb20c11ded7461a9206af9e71f918bff571ba51e66cf9aaf7` |
| `packages/db/test/command-replay-contract.integration.test.ts` | `db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f` |
| `packages/db/test/tenancy.integration.test.ts` | `cd9c33100f69e8a5084b11c3accdfbfacf58997bb6ea5c0709c72ec9711b2a2d` |
| `packages/db/test/watchdog-command-harness.ts` | `3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6` |

Tracked `git diff --stat` (untracked additions are listed separately because no git add is authorized):
```text
apps/api/src/proof/proof.application.ts         |  7 +++--
 apps/web/e2e/proof-capture.spec.ts              | 37 +++++++++++++++++++++++
 config/agent-lane-assignments.json              |  1 +
 packages/db/src/final-account-repository.ts     |  2 +-
 packages/db/src/migrate.ts                      |  1 +
 packages/db/src/proof-application-repository.ts | 17 +++++++----
 packages/db/src/proof-repository.ts             | 39 ++++++++++++++++++++-----
 7 files changed, 87 insertions(+), 17 deletions(-)
```

| New file | Lines | SHA-256 |
|---|---:|---|
| `packages/db/migrations/0152_proof_replacement_commands.sql` | 243 | `9f238ba635785dc6c767be5a6126ca5888799278095a0379f7b54870c3797716` |
| `packages/db/test/migfix-3.integration.test.ts` | 194 | `7a4275db6066aa49c83dd0b3ccc21c7ff02d18b2980ae646f2abcef55bfd6021` |
| `packages/db/test/migfix-3-upgrade.integration.test.ts` | 80 | `63a9c82cd259feb511065f7d6214fbc86802a562e1356226f17ea0e701057ddc` |

Intended commit message is `/private/tmp/jg-msg-migfix-3.txt`. Final head is `bd959b01e857de0ba7cbd3588bab84add7d0f493`; it is the unchanged base, not a commit containing this work. Fresh independent RED verdict, separate acceptance, coordinator catalogue integration, real database/browser runs, pinned forced checks and OpenAPI verification remain pending.

---

# Post-merge PostgreSQL repair (Claude Sonnet 5.5, 14 Oct 2026)

Builder: Claude Sonnet 5.5. Not independently verified, not accepted. Starting head `33e98598` (main `c884b138` merged into `27f220e1`). First real PostgreSQL run of the piece's own new files: 5 failures, all in this piece's own new tests/code; no merged test touched, no assertion weakened or removed.

## proof-repository.ts was hand-merged
The merge of main into the piece was resolved by hand in `packages/db/src/proof-repository.ts`: the piece's rewritten `complete` and `invalidate` were kept, together with main's `checkPostLockSourceLifecycle`, `refuseLockedNewSource` and `rethrowJobWorkState` inside `complete`. Reviewers should read that merge result in full.

## Fixes (root cause each)
| # | Test | Cause | Fix |
|---|---|---|---|
| 1 | migfix-3.integration `[MIGFIX-3.5/7]` | test used nonexistent column `app.job.lifecycle_point`; the job column is `status` (CHECK allows `invoiced`) | set-up now `UPDATE app.job SET status='invoiced'`; assertions unchanged |
| 2 | `[MIGFIX-3.4]` | `$2` used bare (uuid) and as `$2::text` | `$1::uuid,$2::uuid` casts; assertion unchanged |
| 3 | `[MIGFIX-3.7]` | `state='rejected'` needs `rejection_code NOT NULL` (evidence_upload_state_ck) | set-up also sets `rejection_code='content_mismatch'`; same situation modelled |
| 4 | `[MIGFIX-3.4/5]` | REAL CODE BUG in `proof-repository.ts` `complete`: after an earlier repair the semantic key no longer carried the replacement suffix, so the replay lookup `command_id=$2 OR semantic_key=$3` could return the ORIGINAL completion's receipt (different hash) first and raise COMMAND_CONFLICT for a valid identical retry | lookup now `ORDER BY (command_id=$2) DESC LIMIT 1` |
| 5 | `migfix-3-upgrade` U1 | rolled-back `UPDATE app.stage_completion.completed_at` hit main's 0144 FK `job_site_source_receipt_..._fkey1` | control runs `SET LOCAL session_replication_role=replica` inside its rolled-back transaction (still proves a 1 microsecond change fails the comparison); a second `$1` bare/`::text` typing slip in the later-insert control fixed with `$1::uuid` |

## Commands (worktree m4-6-s, through heavy-slot, vitest --maxWorkers=2)
| Command | Exit | Result |
|---|---:|---|
| migfix-3.integration + migfix-3-upgrade.integration (before) | 1 | 5 failed, 8 passed |
| migfix-3.integration (after fixes 1-4) | 0 | 12/12 |
| migfix-3-upgrade.integration | 0 | 1/1 |
| `pnpm exec turbo run typecheck --force` | 0 | 7/7, 0 cached |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0 | 7/7, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | passed |

Not run here: full build, full db suite, browser e2e, tenancy.integration.test.ts (dispatcher/CI).
