Built by Codex (GPT-6); repair round r1 dispatched 14 Oct 2026 (dispatcher 5).

## Repair round r1 — current handoff

Repair base / unchanged local HEAD: `ccd0d3676091fa4d6440bf749dc8fd1496b76c7f`, branch `codex/sandbox/migfix-2`. Comparison base `origin/main`: `bd959b01e857de0ba7cbd3588bab84add7d0f493`. Initial working tree was clean. The original build receipt below is preserved as historical evidence; its old HEAD, untracked-file counts, lane-check refusal and first-round restrictions are superseded by this repair record.

Read AGENTS.md, BUILD_PLAN.md §2 (including inherited criteria), §§5.3–5.6, M0-10 inventory and D02/charging gates, the existing migration/tests/docs and the independent [Opus REPAIR verdict for ccd0d367](/Users/benharwood/.local/share/full-steam/jg-runs/migfix-2-opus-ccd0d36.md). That verdict is source inspection only, with no tests run. This receipt records builder checks, not an independent verdict or technical acceptance. A final-commit verdict and acceptance by a separate actor remain required after dispatcher commit.

Exactly three repair files:

- `packages/db/MIGRATIONS.md`: append a 0151 section describing the three replaced 0004 routine bodies, `journal_full_reversal_uq` / UNIQUE `(tenant_id, reverses_journal_id)`, unchanged grants/owners/security and RLS, historical-duplicate install failure `23505`, no historical rewrite/backfill, forward-fix rollback strategy and both proof files.
- `config/agent-lane-assignments.json`: add only `packages/db/MIGRATIONS.md` to `migfix-2.allow`; widening explicitly approved in this repair order. All other lanes and all other fields remain identical. Registry and migration documentation are shared files; this lane's authorized edit serializes with other lanes at integration under dispatcher ownership.
- This receipt: current repair scope, actual checks and remaining holds. No SQL, implementation, test, fixture, assertion, pin or harness changes.

Migration 0151 SHA-256 before = after = `1b837fa166c586bfcf1b83784721c880e2f2762ed8110c464262ac8b695e109c`. The migration, both new proof files, migrate.ts, ledger.ts, historical 0004 and merged tenancy/ledger tests were byte-compared with HEAD. The merged API auth context-boundary test was also byte-compared with HEAD. Existing MIGRATIONS.md bytes are preserved as an exact prefix. JSON comparison proves that the one permitted allow-list item is the only registry change.

### Repair validation — commands actually run

Dependencies were already installed. No install/download or git-writing command executed. Node `v24.17.0`; cached pinned pnpm `10.28.1`. All pnpm commands used `PATH="/private/tmp/jg-migfix-2-bin:$PATH" npm_config_manage_package_manager_versions=false`; the pre-existing temporary wrapper invokes the cached pinned pnpm directly. Default `pnpm --version` hung and was interrupted (130); the cached command returned 10.28.1 (0). A read-only `ps` probe was denied by the sandbox; no escalation requested. Turbo emitted IO permission warnings, but all recorded successful Turbo tasks executed with force rather than cache hits. Build also emitted existing Next workspace-root and CSS autoprefixer warnings.

| Command | Actual result |
| --- | --- |
| `pnpm typecheck --force` | 0; 7/7 tasks executed, 0 cached; 2m20.217s |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 0; root boundary checks and 7/7 package tasks, 0 cached; 2m17.352s |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; migfix-2 comparison covers seven changed paths within the eight allowed paths, including the newly allowed migration documentation |
| `pnpm build --concurrency=2 --force` | 0; 7/7 tasks executed, 0 cached; 2m27.789s |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; existing OpenAPI check entrypoint via Node import, avoiding tsx CLI's IPC listener |
| `node --test tools/policy-gate-sites.test.mjs tools/dependency-audit.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/core-purity.test.mjs tools/shared-money-origin.test.mjs tools/commercial-boundary.test.mjs` | 0; 19 tests passed |
| `pnpm exec turbo run test --filter=@jobguard/core --filter=@jobguard/config --filter=@jobguard/storage --filter=@jobguard/ai --filter=@jobguard/web --concurrency=2 --force` | 1; config 2 tests passed, storage 4 passed. Core collected source and emitted dist tests: 4,886 passed, 4 failed (source/dist receipt-allocation timeout plus two dist tests reading missing .ts files). Turbo stopped downstream work; no whole-run pass claimed |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | 0; 81 files, 2,445 source tests passed; no timeout/expectation changed |
| `pnpm --filter @jobguard/ai exec vitest run src --maxWorkers=1` | 0; 5 files, 80 fixture tests passed; no live model/provider run |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | 0; 33 files, 784 unit tests passed; no browser journey |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2 --exclude src/health.test.ts --exclude src/shadow-isolation.application.test.ts --exclude 'src/contractor/*.http.test.ts' --exclude src/auth/sso/action-paths.test.ts` | 1; 64 files passed, 1 failed; 1,557 tests passed, 1 skipped. final-account-lock.isolation.test.ts dynamically imports a real-DB fixture: port discovery failed (`no free port in 58400..58650`) before PostgreSQL startup. This is a database-suite hold, not a unit or database pass |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude test/free-port.test.ts` | 1; 16 files passed, 2 failed; 254 tests passed, 2 failed. Source/dist audit-checkpoint-handoff test exceeded its existing 5s timeout |
| `pnpm --filter @jobguard/db exec vitest run src test --maxWorkers=1 --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.*'` | 1; same 254 passed / 2 audit-checkpoint timeouts. Vitest's substring filter `test` still collected dist; this was not a source-only run |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --exclude '**/dist/**' --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.*'` | 0; explicit dist exclusion, 13 files, 169 source unit tests passed, including audit-checkpoint; no timeout/expectation changed. Scripted DB tests do not prove PostgreSQL guarantees |
| `git diff --check` | 0; repeated before/after receipt update |
| Python byte/JSON comparison | 0 on corrected probe; exact one-item widening and unchanged SQL/runtime/test bytes. Initial probe used a wrong context-boundary path and returned 1 (read-only missing-file error); actual file is apps/api/src/auth/context-boundary.test.ts |

Raw logs are `/private/tmp/jg-migfix-2-r1-{typecheck,lint,lint-lanes,lint-lanes-final,build,openapi,tool-units,units,core-source-units,ai-source-units,web-source-units,api-units,db-units,db-source-units,db-source-final}.log`. Successful bounded source runs follow failed broad runs; the failed full-filter command remains failed and must not be reported as a green full suite. No existing check or assertion was weakened. Final lane lint after receipt update returned 0; final diff/path inspection returned 0 and names exactly the three authorized repair files. Final free disk space: 38 GB.

### Remaining holds and handoff

- `migfix-2.integration.test.ts` and `migfix-2-upgrade.integration.test.ts`: still **NOT RUN**, no baseline failure or PostgreSQL pass reproduced. The Opus merge condition requires both green on the final committed head in Mac/GitHub CI. Historical-duplicate, upgrade, catalog and concurrency guarantees remain unverified by execution here.
- Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, browser/e2e and real-DB/API HTTP suites require the dispatcher/GitHub environment. Root test also includes two lane-checker fixture suites that invoke git init/add/commit/switch; these were intentionally not run under the no-git-writes instruction. Existing suites stay mandatory in CI. The indirectly loaded API database fixture attempted port discovery but no PostgreSQL or browser process started.
- AI/native release evaluation is inapplicable to this documentation/config repair. The AI unit run above is fixture-only. No provider call, real data, spending, external message, deployment or policy approval.
- D02, production charts/accounting, recovery-fee disablement and G4-C/G4-S gates remain held. Opus LATER concerns about conservative reversal rules and role-list drift are unchanged; this order authorizes no accounting-policy or SQL alteration.
- No new grants, migrations, backwards-compatibility impacts, operational alerts or product behavior in r1. The underlying 0151 rollout/forward-fix remains as documented above and in the original receipt.
- Intended conventional commit message overwritten at `/private/tmp/jg-msg-migfix-2.txt`. Local HEAD stays `ccd0d3676091fa4d6440bf749dc8fd1496b76c7f`; the dispatcher owns commit/push. No acceptance, PR, push, merge or release performed by the builder.

## Original build receipt — 13 Oct 2026 (historical, pre-dispatcher commit)

Built by Codex (GPT-6); dispatched 13 Oct 2026.

MIGFIX-2 — RED lane. Implementation written; database acceptance remains partial/pending. No acceptance or independent verdict claimed.
The requested Claude Sonnet first line would misidentify the builder; actual identity is recorded above.
HEAD and origin/main: bd959b01e857de0ba7cbd3588bab84add7d0f493. Branch codex/sandbox/migfix-2, reused m4-5-s-fresh worktree. Base matches issuance. Node v24.17.0 (repository pin 24.15.0); dependencies already installed, no download.

Tests-first record: wrote packages/db/test/migfix-2.integration.test.ts and packages/db/test/migfix-2-upgrade.integration.test.ts before implementing migration 0151. First failing run: NOT RUN (sandbox cannot bind sockets/start PostgreSQL, explicitly prohibited by dispatch). No baseline failure reproduced or database pass claimed. These files require the dispatcher/GitHub real PostgreSQL run.

## Scope and source inspection

Read AGENTS.md, BUILD_PLAN.md §§2, 5.3–5.6, the M0-10 merged-work inventory and D02/G4 restrictions; authentication-v1 and shared-money-origin-v1; dispatcher standing rules; the DBSRC-07 stop receipt and dbsrc-07 report. Verified cited source against this checkout/main: 0004_ledger.sql:5,14–16 and ledger.ts:9,24–26 retain the reported defects. Main agrees with the four ledger findings. The earlier report's scope-total finding is outside MIGFIX-2. No historical migration edited.

Exactly six lane files: migration 0151; its single migrate.ts registration; one additive lane row; two new integration files; this receipt. ledger.ts needs no edit because callable signatures and repository transactions are unchanged. Shared registrations serialize at landing with other pieces. No new table, column, route, provider, screen, fee policy, commercial action or production chart mapping. Standard F's contractor-route clauses are inapplicable: these existing synthetic ledger ports have no job route/contractor aggregate.

## Implementation and compatibility

- Tenant-qualified UNIQUE (tenant_id, reverses_journal_id) protects one full reversal. Duplicate historical reversals prevent installation with 23505; no normalization or historical rewrite.
- Corrected settlement capacity counts only unreversed settlement credits against the original receivable, using exact numeric aggregation. A reversed obligation cannot receive payment.
- Both posting routines require distinct accounts with the existing receivable/deferred_income/provider_clearing classes, matching tenant, book and currency.
- Each replacement routine checks the approver from persisted financial_authorization against current, non-revoked/non-expired owner or finance membership (the existing finance:approve roles). It retains the exact purpose/amount/currency/hash/status/expiry authorization helper. These historic synthetic ports have no persisted-session parameter; this change does not claim to authenticate an arbitrary caller possessing a financial authorization ID. Authenticated tenant context remains the caller's trust boundary.
- Declared lock order: approving membership SHARE; obligation UPDATE; original settlement UPDATE when correcting a payment; financial authorization UPDATE; caller appends audit last. No business network calls.
- Conservative correction choices: reverse active payments before cancelling their obligation; refuse reversing a full reversal. These avoid negative receivables and prevent reinstatement from bypassing one-full-reversal capacity accounting. No real accounting policy inferred; D02 remains held.
- Existing 1,000/-1,000, 600/400 and restored 1,000/0 journey is covered by named regressions. Existing direct-write refusal 42501, recovery SQL refusal 0A000 and RECOVERY_FEE_POSTING_DISABLED remain covered. Deferred balance and matching audit triggers remain installed. All existing acceptance tests and pins stay unchanged.

## New GRANTs / standard F

**None in migration 0151.** No INSERT/UPDATE/DELETE grant, no new EXECUTE grant. CREATE OR REPLACE preserves existing owners/ACLs/search paths; runtime retains only its prior EXECUTE on posting routines and SELECT on financial projections. New test logins receive the existing jobguard_runtime role in isolated fixture databases only. Migration-owner privilege/policy preservation and runtime grants/FORCE RLS are covered by the new tests, NOT RUN here.

## Acceptance coverage (all database execution NOT RUN)

| Assertion | New test title ID | Coverage written |
| --- | --- | --- |
| One full reversal | MIGFIX-2-1 | Runtime SQL; two distinct authorizations blocked on the same original row; exactly one result; sequential refusal; journal/line/audit counts and zero receivable |
| Replacement payment after reversal | MIGFIX-2-2 | Exact existing three balance checkpoints, replacement 1,000p, further overpayment refusal with unchanged effects |
| Cancelled obligation | MIGFIX-2-3 | 23514 refusal, balances zero, journal/line/audit counts unchanged |
| Identical obligation accounts | MIGFIX-2-4 | Same-account, wrong class and swapped class refusals; no effects; distinct valid account control |
| Settlement/correction races | MIGFIX-2-5 | Both explicit settlement-versus-obligation-correction orders, blocked second operation; settlement correction versus replacement payment; bounded lock/statement timeouts |
| Authority and tenant/book checks | MIGFIX-2-AUTH | Revoked/expired/wrong-purpose/amount/hash financial authorizations; wrong-role/revoked/expired membership; foreign accounts/book; valid finance role control |
| Catalog/privileges/deferred checks | MIGFIX-2-CATALOG | Owners, definer paths, no PUBLIC EXECUTE, runtime read/write privileges, FORCE RLS, uniqueness, deferred triggers, mismatched audit rollback, existing disabled recovery and repository control |
| Populated upgrade | MIGFIX-2-UPGRADE | Everything before N, snapshot, N alone as migration owner, row and privilege comparison, later migrations via runner twice |
| Upgrade comparison controls | MIGFIX-2-UPGRADE-CONTROLS (two tests) | Original primary-key identities, named columns, format_type full types, row_to_json(subselect)::text; microsecond/retype fail; nullable column/function replacement/later row pass; all controls roll back |
| Historical duplicate | MIGFIX-2-HISTORY | Valid duplicate under pre-0151 routine in rollback control; flush deferred triggers; own migration fails 23505 and old rows remain unchanged |

Seven regression/catalog tests plus four upgrade/control tests = **11 tests written, 0 database tests executed**. Both files are automatically collected by the existing mandatory CI pnpm test → db vitest run; no CI list edit or optional skip added. No pure domain code changed and no piece-owned unit test exists; running unrelated unit suites would violate dispatch's own-files-only limit.

## Validation commands and actual results

All pnpm validation commands used this prefix:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/jg-migfix-2-bin:$PATH"
export npm_config_manage_package_manager_versions=false
```

The temporary pnpm wrapper calls the already cached /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs. No install/download command executed. Initial default pnpm launcher hung and was interrupted (130); its version was not established. Cached pinned launcher returned 10.28.1 (0). No permission or automatic approval rejection occurred.

| Command actually run | Exit / counts / evidence |
| --- | --- |
| Initial pnpm --version using only Library/pnpm/bin prefix | Interrupted 130 after launcher warning; no version result |
| Cached pnpm --version | 0; 10.28.1 |
| pnpm --filter @jobguard/db exec tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext test/migfix-2.integration.test.ts test/migfix-2-upgrade.integration.test.ts (first) | Shell 1 / tsc diagnostic exit 2; two errors in this new test (possibly undefined result and disabled port's zero-argument method). Corrected only new test |
| Same own-test strict compiler command (second) | 0; both files compile |
| Same own-test strict compiler command after final test additions (third) | 0; both final files compile; no database execution |
| pnpm exec turbo run typecheck --force | 0; 7/7 tasks executed, 0 cached; 57.568 seconds |
| LANE_BASE_REF=origin/main pnpm exec turbo run lint --force | 0; 7/7 tasks executed, 0 cached; 27.116 seconds; package lint only |
| LANE_BASE_REF=origin/main pnpm lint | 1; core purity passed, lane checker refused HEAD=origin/main before package lint |
| LANE_BASE_REF=origin/main pnpm lint:lanes | 1; “Missing branch or self-comparison range; refusing a misleading pass.” No checker edit or changed base to bypass it |
| node tools/money-arithmetic-lint.mjs | 0; money boundary check passed |
| node tools/commercial-boundary-lint.mjs | 0 |
| node tools/core-purity-lint.mjs | 0; 158 TypeScript files |
| pnpm build --concurrency=2 --force | 0; 7/7 tasks executed, 0 cached; 53.528 seconds; existing Next workspace-root warning |
| pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check | 0; exact existing generator/check entrypoint, invoked without tsx CLI's prohibited IPC listener |
| git diff --check (repeated during edits and final) | 0 |
| Python source-hash/shared-addition comparison | 0; 10 unchanged baseline/protected files, 3 new artifact hashes; all original registry rows and migrate.ts bytes preserved except the one registration |

Raw validation logs: /private/tmp/jg-migfix-2-{test-types,test-types-final,test-types-final2,typecheck,lint-force,lint-root,lint-lanes,build,openapi}.log. The first test compiler log contains its two errors; final logs are empty because the command succeeded. No Turbo cache-hit result presented as a run. No build/test fan-out. Memory checks before heavy validation: 80–81% free; disk initial 38 GB, later/final 37 GB, above dispatcher 35 GB stop line. No database/browser commands invoked, so heavy-slot was not used.

NOT RUN files and suites:

- packages/db/test/migfix-2.integration.test.ts — sandbox cannot start PostgreSQL/bind sockets (dispatch prohibition); failing baseline and corrected run both NOT RUN.
- packages/db/test/migfix-2-upgrade.integration.test.ts — same restriction; upgrade/fresh install/catalog/history controls not executed.
- pnpm test, pnpm test:db, pnpm test:migrations — dispatch prohibits whole suites and this sandbox cannot start PostgreSQL. Dispatcher/CI must run mandatory suites, including these new files; their absence is a hold.
- pnpm test:e2e / browser journeys — browser/listener startup prohibited. No affected UI/HTTP flow added, existing mandatory suite remains required in CI.
- pnpm eval / native suite — inapplicable: no AI/native changes.

## Source/edit command record

Read-only git commands: pwd; git status --short (initial/final); git rev-parse HEAD; git rev-parse origin/main; git branch --show-current; git diff --stat; git diff --numstat; git diff --check; git diff --name-only; git ls-files; git diff -- the two shared registrations; git show origin/main:<file> inside the hash check. All completed with 0, initial working tree was clean, final head stayed unchanged. No git-writing command.

Inspection used cat, head, tail, sed, rg/rg --files, ls and wc -l on AGENTS.md, BUILD_PLAN.md, contracts, the two external source receipts/rules, root/db package/TypeScript/Turbo/Vitest config, migrations (especially 0000/0001/0004/0005/0111/0120/0137), migrate.ts, ledger.ts, auth role map, tenant context, audit implementation, pool helpers, existing ledger/upgrade tests, CI and lint entrypoints. Successful inspection batches exited 0. Incidental missing-path/glob probes: zsh refused tools/test* and packages/db/test/*security* expansions (1); cat tools/migration-lint.mjs and cat packages/db/test/migration-upgrade-test-utils.ts returned 1 (files absent); ls Library/Caches/node/corepack/v1/pnpm returned 2 (absent). These were read-only lookup failures, not permission refusals; actual files/cache were then found by rg/reading the existing cached wrapper.

Python edits added the single registry line, moved this piece's historical-duplicate test before migration installation, and wrote this receipt/hash evidence; all exited 0. apply_patch operations added/edited only this piece's migration/tests and the single migrate.ts line, all succeeded. mkdir created only this receipt directory and /private/tmp/jg-migfix-2-bin; cat wrote only this new receipt and temporary wrapper; chmod made that wrapper executable (0). Temporary validation logs were written outside the repository. No file removal, overwriting of pre-existing uncommitted work, git mutation, sockets, provider calls or external messages.

## Migration operations / release holds / builder inspection

Forward migration only; no backfill or commercial-row update. Application API and journal schemas are compatible; corrected invalid operations now refuse. Recovery-fee disablement, D02 chart/recognition decisions and G4-C/G4-S release gates remain held. Adjacent LATER: the source report's application money magnitude limit is unchanged and outside this correction task.

If deployment finds duplicate full reversals, stop installation and report their identities to the coordinator; do not rewrite or delete them. Rollback strategy: rollback a failed migration transaction. After a successful install, retain the uniqueness and immutable history; fix defects through a reviewed forward migration rather than reinstalling the old unsafe bodies. No new operational alert installed; installation failure and SQL correction/capacity refusals are operational signals for the existing error monitoring.

Builder inspection (source-inspected, not an independent model verdict): reviewed new GRANT surface (none), same-book account checks, original/obligation lock order, one-full-reversal index, signed capacity, no reversal-of-reversal, deferred audit/balance preservation, source/idempotency uniqueness preservation, upgrade control DDL and matching identity/text comparison. Fixed own compiler errors and two test-design issues before handoff: privilege snapshots exclude newly created constraint indexes; historical duplicate fixtures flush deferred checks so the intended unique-key failure is tested. No runtime database guarantee is claimed as verified.

STOP/BLOCKING questions: no coordinator-owned file, assertion, pinned value or harness line needed modification; no standard-F write-grant request. Validation holds are the two NOT RUN database files and lint comparison refusal above. Root lane checker requires the dispatcher's commit before it can assess a nonempty comparison; file tools/agent-lane-boundary-lint.mjs:212 stays unchanged (before = after: `if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");`; no edit proposed). RED different-model verdict bound to the dispatcher's exact final commit, separate acceptance, and founder merge/push/release remain outstanding.

## File integrity evidence

- `AGENTS.md`: `ae66c7ba5465ec9cd34d69af2085ab3f4c2a882f7580c7cae4a1ed68061ffba1` (main and working bytes identical).
- `BUILD_PLAN.md`: `21d7c5ba11b66d000c3689b8c65d9defa9c8840889cde4ff1241105f558682b3` (main and working bytes identical).
- `packages/db/src/ledger.ts`: `47105e6c1298ac0a4ae406041b30932ad64563679152d56a1bc3e2c5d5b3ec4a` (main and working bytes identical).
- `packages/db/migrations/0004_ledger.sql`: `eaf119a1b9d8ece57f93c3c6e0fd4043eb108ce78d0c3cd599d60e6377858681` (main and working bytes identical).
- `packages/db/test/ledger.integration.test.ts`: `b06067d659842cad8618b59651403c5cda3b827c736f99545c05f701e273758e` (main and working bytes identical).
- `packages/db/test/tenancy.integration.test.ts`: `cd9c33100f69e8a5084b11c3accdfbfacf58997bb6ea5c0709c72ec9711b2a2d` (main and working bytes identical).
- `apps/api/src/auth/context-boundary.test.ts`: `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35` (main and working bytes identical).
- `packages/core/src/watchdog.ts`: `1628a2c3dc2d24cdb20c11ded7461a9206af9e71f918bff571ba51e66cf9aaf7` (main and working bytes identical).
- `packages/db/test/watchdog-command-harness.ts`: `3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6` (main and working bytes identical).
- `packages/db/test/command-replay-contract.integration.test.ts`: `db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f` (main and working bytes identical).
- `packages/db/migrations/0151_ledger_corrections_fix.sql`: `1b837fa166c586bfcf1b83784721c880e2f2762ed8110c464262ac8b695e109c` (new).
- `packages/db/test/migfix-2.integration.test.ts`: `f9eed7996e59b2ca1d96d1d5b4736d34892e4fbf2ac4cba0d4b2fbe587918b90` (new).
- `packages/db/test/migfix-2-upgrade.integration.test.ts`: `03ef3c74517425d21355a399714e6ba8ea9161d4f16bc69d8f335f6f72a03f0c` (new).

Actual git diff --stat (untracked files are not included by git):

```text
 config/agent-lane-assignments.json | 1 +
 packages/db/src/migrate.ts         | 1 +
 2 files changed, 2 insertions(+)
```

Untracked lane additions: this receipt, 0151_ledger_corrections_fix.sql (141 lines), migfix-2.integration.test.ts (240 lines), migfix-2-upgrade.integration.test.ts (160 lines). git status names exactly these six files; no other tracked changes. Receipt self-hash is intentionally omitted.

Final HEAD: bd959b01e857de0ba7cbd3588bab84add7d0f493 (no commit made). Intended commit message: /private/tmp/jg-msg-migfix-2.txt. No PR opened or pushed.
