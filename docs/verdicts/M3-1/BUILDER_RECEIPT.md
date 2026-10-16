Built by Codex; dispatched 13 Oct 2026.

# M3-1 builder receipt — named partial, check lane AMBER

The addendum requested a first line attributing this build to Claude Sonnet 5.5 with Codex unavailable. That attribution would be false in this session; the actual builder is recorded above. No model-review or acceptance evidence is supplied by this receipt.

Issued base, inspected origin/main and final HEAD: `6671538c8d69936c162368c760dd6ce0f7f10493`. Branch: `codex/sandbox/m3-1`. The base has not moved. No commit, staging, push, checkout, merge, migration or release was performed. Intended conventional commit subject/body: `/private/tmp/jg-msg-m3-1.txt`.

## Repair r1 — 15 October 2026, dispatcher 11

PR #224, inspected repair starting head `c73ea4f8a126243d1c1d69f4d5e335b1ce054a40`, branch `codex/sandbox/m3-1`. Failure input: `/Users/benharwood/.local/share/full-steam/jg-runs/d11/m31-ci-fail.txt`. This section records the repair; the original build receipt below is historical. No Git write, dependency download, browser or PostgreSQL execution was performed. Dispatcher owns commit/push and the real database rerun. No independent verdict or acceptance is claimed.

All five failures trace to this PR's test setup. No merged behavior defect was found in the inspected paths, and no merged implementation, test, fixture or pin was changed. The repair changes only the three own DB helper/test files and this receipt. No migration, new grant, provider action, compatibility change or operational alert is introduced. Replay, tenant/actor authorization, rollback, immutable origin and per-command convergence assertions remain enforced.

| CI failure | Cause from source inspection | Repair |
| --- | --- | --- |
| M31-S11 fresh-instance persistence | `freshRuntime` spread `c.runtime.options`. Installed pg-pool 3.14.0 deliberately defines `options.password` as non-enumerable (`index.js:71–78`), so the new pool lost authentication. The fixture explicitly uses a password-bearing runtime login (`extra-fixtures.ts:38–40`). The failure occurs on the first fresh-pool capture, before the replay assertion. | Copy `password: c.runtime.options.password` explicitly while preserving the runtime user and all other runtime options; retain owned-pool closure and exact persisted-result/facts/audit assertions. |
| M31-S16 ambiguous response and rollback | The initial capture uses the working shared runtime pool. Recovery after the simulated lost response uses the same broken fresh-pool helper, failing before the rollback probe. | Same credential-copy repair. Keep exact recovery of the committed result, the injected precommit failure, its expected SITE_EXTRA_UNAVAILABLE, and unchanged receipt/domain/audit facts. |
| `replaying a command id returns the first result, never the job's current state` | The equal UUIDs were **work-order revision IDs**, not replay result IDs. `demoRow(demo, 1)` already has urgent priority and the same operative assignment (`work-order-fixtures.ts:113–119`). The old `revise` helper repeated that content. `WorkOrderRepository.reviseOrder` correctly returns the existing revision for equal content hashes (`work-order-repository.ts:231–234`). Changing the import command ID or expectedRevision alone does not change baseline content. | Alternate routine/emergency priority by expected revision and require the import row to report `revised` with no error. Retain unequal old/new provenance assertion; additionally require distinct capture IDs and bind new provenance to the returned revision ID. Successful replay must still equal the first result with byte-stable persisted facts. |
| M31-S15 multi-crew convergence, seed 17 ordered (and all fresh-pool schedules) | Every delivery goes through `freshRuntime`; the ordered history fails from lost credentials before it can exercise convergence. | Same credential-copy repair. Keep all seeds, three schedules, concurrent duplicate delivery, six-effect counts, derived result identities, original receipts/origins and cross-schedule semantic equality. No retries or accepted failure outcomes added. |
| M31-S15 generated authority/baseline changes, seed 101 | Capture alone uses the broken fresh pool; revoke/revise use the working shared pool. Connection failure becomes SITE_EXTRA_UNAVAILABLE through `site-extra-repository.ts:193–195`, outside the intended authority/race outcomes. Also the second old helper call repeated urgent priority and the same assignments, so it did not actually revise the baseline. | Repair fresh-pool credentials and ensure both helper calls change content. Add an assertion that revisionAfter differs from revisionBefore. **Do not add SITE_EXTRA_UNAVAILABLE to the outcome list**: retain exactly NOT_FOUND, EXTRA_FORBIDDEN, STALE_REVISION, no partial receipt/origin on refusal, current-access refusal on both new work and replay, and valid audit chain. |

Merged replay path inspected: `ExtraRepository.claim` (`extra-repository.ts:45–50`) reads the succeeded command receipt and returns its stored result; `raiseExtra` returns that replay before inserting new scope/origin/event rows (`:84–85`). `SiteExtraRepository` performs current authority checks first (`site-extra-repository.ts:157–163`). These behaviors match the tests' intended properties and are unchanged. The merged command does not accept an expected baseline revision for a new note-only capture; the test must actually change the work order before checking later provenance.

Local environment: Node v24.17.0, installed cached pnpm 10.28.1 through the existing `/private/tmp/jg-m3-1-bin/pnpm` shim, Vitest 4.1.11. No clean install or pinned-Node claim. Every check below ran serially through `~/.local/bin/heavy-slot`. Its resource probes emitted sandbox-denied sysctl/sysmond/pgrep diagnostics; the wrapper continued and executed the checks. No wrapper or resource-check workaround was made. Turbo emitted cache IO permission warnings and all completed forced checks had zero cache hits.

Commands actually run (prefix `PATH=/private/tmp/jg-m3-1-bin:$PATH`; lane commands also set `LANE_BASE_REF=origin/main`):

| Command after environment prefix | Result |
| --- | --- |
| `~/.local/bin/heavy-slot m31-r1-typecheck pnpm typecheck --force --concurrency=2` | PASS, 7/7 package tasks, exit 0. |
| `~/.local/bin/heavy-slot m31-r1-lint pnpm lint --force --concurrency=2` | PASS, root boundary checks and 7/7 package tasks, exit 0. |
| `~/.local/bin/heavy-slot m31-r1-lanes pnpm lint:lanes` | PASS, m3-1 lane, exit 0. Unlike the historical receipt, the registered starting head can now be checked against origin/main (merge base `2a230bb522c2c1146c0d0741ed374237176ff02c`). This checks the committed range; the final working-tree diff is separately inspected. |
| `~/.local/bin/heavy-slot m31-r1-db-static pnpm --filter @jobguard/db exec tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext test/offline-risk-test-utils.ts test/offline-risk.integration.test.ts test/offline-risk.properties.integration.test.ts` | PASS, exit 0. Explicitly compiles test files excluded by package tsconfig; no DB execution. |
| `~/.local/bin/heavy-slot m31-r1-fixture-probe node /private/tmp/jg-m31-r1-fixture-probe.mjs` | PASS, exit 0. Scratch socket-free probe using installed pg Pool constructors and built demoRow/workOrderContentFields: reproduces password loss and unchanged initial content, confirms explicit copy preserves the runtime user/password and alternating priority changes content for revisions 1–3. Pools have zero clients; no credential values are printed. This is constructor/pure-data evidence, not a PostgreSQL test. |
| `~/.local/bin/heavy-slot m31-r1-core pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/offline-contract.test.ts src/offline-contract.properties.test.ts` | PASS, 2 files / 9 tests, exit 0. |
| `~/.local/bin/heavy-slot m31-r1-api pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/offline-risk.application.test.ts` | PASS, 1 file / 3 tests, exit 0; session/repository doubles only. |
| `~/.local/bin/heavy-slot m31-r1-build pnpm build --force --concurrency=2` | PASS, 7/7 package tasks, 32 static pages, exit 0. Existing workspace-root, CSS compatibility, file-type export and dynamic dependency warnings remain; no adjacent fixes. |
| `~/.local/bin/heavy-slot m31-r1-openapi pnpm openapi:check` | BLOCKED, exit 1 before generation: tsx IPC `listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/26775.pipe`. No alternate execution route attempted; CI must run the real check. |

`git diff --check` passed. Read-only `git diff --quiet origin/main -- packages/db/src/site-extra-repository.ts packages/db/src/extra-repository.ts packages/db/src/work-order-repository.ts packages/db/test/extra-fixtures.ts packages/db/test/site-extra-fixtures.ts pnpm-lock.yaml package.json` exited 0, confirming those merged implementations/fixtures/pins are unchanged. Final working-tree scope is the three own DB helper/test files plus this receipt. Intended conventional commit message is overwritten at `/private/tmp/jg-msg-m3-1.txt`; no staging or commit was performed.

PostgreSQL suites, migrations, browser/device suites and aggregate M3-1 acceptance remain unverified/held; the real DB tests and OpenAPI check must pass in GitHub CI on the dispatcher's repaired commit. No failing property or merged acceptance test was weakened to obtain a local pass.

## Scope and acceptance limits

This is the authorized synthetic server-contract and automated-test slice only. Aggregate M3-1 remains INCOMPLETE. There is no independent verdict or separate technical acceptance. Source inspection, executed unit tests and unexecuted database assertions are distinguished below.

The pure module validates a strict offline-intent.v1 envelope, UUIDv7 identity, client-labelled capture/HLC metadata and the unchanged note-only body. Conversion revalidates and returns only jobId/body. It forwards no client time, actor or authority. The three-class profile enables no field merging and supplies no commercial executor. No new production caller or upload route is wired. Existing command hashing, result schemas, origin and receipt writers remain unchanged.

New files: three core module/test files; one application test; one DB helper and two DB test files; the contract, per-piece ledger and this receipt. Existing file: packages/core/src/index.ts, one additive export only. config/lanes/m3-1.json is intentionally NOT CREATED: its required merged schema/loader is absent, so registration remains STOP. No invented fragment, scanner change or shared-registry edit was made.

| IDs | Evidence / remaining requirement |
| --- | --- |
| M31-S01–S06, S14, S17 (pure), S19 executable-profile checks | 9 passing pure tests; source review of classification and docs still required |
| M31-S07, S08; S16 service refusal | 3 passing service tests with session/repository doubles; no persisted/mobile authentication claim |
| M31-S09–S13, S15–S17 database assertions | 15 tests written before the module, sources statically compiled; PostgreSQL execution NOT RUN |
| Six exact contractor replay/refusal names | All six present in offline-risk.integration.test.ts; PostgreSQL execution NOT RUN |
| M31-S18 | Tracked diff/additive export and protected hashes inspected; actual catalog/grant/fingerprint regressions NOT RUN |
| M31-S20 | Receipt and ledger explicitly partial; independent review outstanding |

Pure generator: seeds 1–64, 9 independent intents per seed, at least three labelled crews, generated duplicates/reordering/delayed and concurrent-batch schedules; backwards/far-ahead/equal clocks, malformed counters, changed input and unsupported versions. Failure context includes seed/history. These are pure metadata/content assertions only.

Database generator (NOT RUN): seeds 17, 73, 251, 991, each with ordered, reordered/delayed and concurrent histories: 12 histories, 6 unique commands, 9 deliveries and three actors per history. The concurrent first batch always repeats one command three times through separate pools. Semantic sets are normalized across fresh tenant/job namespaces and each returned extra ID is checked against the existing derivation in that namespace. Seeds 101, 202, 303, 404 also launch capture, grant revocation and baseline revision together, requiring a committed result with an actual baseline or a closed existing refusal, then refusing both new work and replay after revocation. No sleeps select correctness.

Persistence tests close the first owned pool and replay through another, independently query receipt/origin/event/audit facts and compare named columns as canonical text. Lost-response simulation throws after a real commit in the test source; precommit failure is injected after the existing seam and must roll back all captured facts. The application lost-response test models failure only, not a live network or commit.

## STOP / BLOCKING prerequisites and refusals

1. **Lane infrastructure (Q2):** tools/agent-lane-boundary-lint.mjs:216 reads the shared registry alone. Before: `const policy = config ?? JSON.parse(readFileSync(resolve(cwd, "config/agent-lane-assignments.json"), "utf8"));`. After in this diff: identical, no edit. Required after: coordinator-supplied fragment-aware loader and exact fragment schema; the order supplies neither. The adjacent lines are 215 `if (args[0] === "--lane=") throw new Error("An explicit lane cannot be empty.");` and 217 `const requested = args[0]?.slice(7) || env.AGENT_LANE;`. No tooling repair or fallback is authorized.
2. **Uncommitted lane check:** tools/agent-lane-boundary-lint.mjs:212 is `if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");`. Before/after are identical. HEAD equals required LANE_BASE_REF=origin/main and this order prohibits committing, so pnpm lint and lint:lanes stop here before registration. Adjacent lines: 211 `} else throw new Error(\`Unsupported CI event \$\{eventName\}; no permissive fallback.\`);`; 213 `const args = argv.filter((value) => value.startsWith("--lane="));`. No older comparison base, registry workaround or scanner edit was attempted. Dispatcher must resolve its own committed-check/fragment prerequisites.
3. **OpenAPI command refusal:** `pnpm openapi:check` exited 1 before generation. Exact refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/57017.pipe`. Stopped this item; no alternative execution route attempted.
4. **Process inspection refusal:** `ps -axo pid,ppid,etime,command | rg '(pnpm|vitest|4200)' && ls node_modules/.bin && ls packages/core/node_modules/.bin && ls /Users/benharwood/Library/pnpm/.tools/pnpm && cat .npmrc && cat tsconfig.json` exited 1 with `zsh:1: operation not permitted: ps`. Process inspection was stopped; no alternative process-enumeration method was used. The later ls/cat operands were ordinary dependency-file inspection, not a substitute process query.

Q1's complete founder-answer records remain unavailable and no additional offline/security policy is inferred. Q3 physical-device evidence and Q4 D08/hosting are HELD. Q5–Q7 follow the issued leans: assigned-job read plus note capture; empty merge allowlist; advisory metadata not persisted. Q8 is resolved by source inspection: `git ls-tree origin/main packages/db/test/extra-origin.integration.test.ts` returns blob `bf5971234f5b7466295fdbdbc9c32e50dc7f3d72`.

## Environment and changes from draft assumptions

Dependencies were already installed; no install, download, dependency or pin change was attempted. .nvmrc is 24.15.0 but installed Node is v24.17.0, so this is not a clean pinned-runtime receipt. Vitest is 4.1.11. The default pnpm launcher targets a newer global installation and stalled before testing; three launcher attempts were interrupted, each exit 130. A scratch shim at /private/tmp/jg-m3-1-bin/pnpm executes the already-cached pnpm 10.28.1 via Node. It was verified to print 10.28.1. No package manager was downloaded and no repository script was changed. Commands below put the requested Library/pnpm path first, then prepend that pinned scratch shim.

Heavy commands were serial, with at most two workers/concurrent build tasks; no test ran during build. Observed memory before heavy commands stayed at least 43% free (threshold 35%); available disk stayed at least 58 GB (threshold 45 GB). No sockets, PostgreSQL instance or browser was started. All forced package checks show cache bypass and zero cache hits. Turbo emitted `WARNING IO error: Operation not permitted (os error 1)` during cache handling; no cache workaround was attempted. Next build also emitted workspace-root, existing CSS compatibility and dependency export/dynamic-load warnings; build still exited 0. These warnings were not repaired outside the lane.

The only failed typecheck was run once at the end with --force. It caught the initial static node:fs import in the new core documentation test. The fix follows existing recovery-allocation/site-extra-pricing test practice: typed dynamic file-module import. Subsequent forced package lint compiled all packages and forced build passed. This is not labelled a rerun/pass of root typecheck; CI/dispatcher must run it on the final committed head. A later core test addition explicitly refuses money/approval/origin/evidence-state/permission merging; final pure tests passed after it. DB source compilation was repeated only because a same-tenant different-actor conflict assertion was added during the first static compile.

## Check command ledger

Commands use installed dependencies only. Exit codes below are actual; counts describe checks rather than acceptance. Scripted environment/disk/memory prefixes are included verbatim. Polling only retrieved the same running command's output.

### Run 1 — exit 130

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/offline-contract.test.ts src/offline-contract.properties.test.ts
```

Interrupted before Vitest started; exit 130, no test result.

### Run 2 — exit 1

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-m3-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/offline-contract.test.ts src/offline-contract.properties.test.ts
```

RED: 2 suites failed on missing offline-contract.js; 0 tests collected.

### Run 3 — exit 1

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-m3-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/offline-risk.application.test.ts
```

Initial application attempt: missing @jobguard/core build output; 0 tests collected, not an assertion failure.

### Run 4 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-m3-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/offline-contract.test.ts src/offline-contract.properties.test.ts
```

GREEN: 2 files, 9 tests.

### Run 5 — exit 2

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-m3-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm exec turbo run typecheck --force --concurrency=2
```

FAILED: core documentation test imported node:fs without Node types. Corrected subsequently with the existing dynamic-import convention. 2 package tasks passed before failure; not rerun as root typecheck.

### Run 6 — exit 1

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-m3-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; LANE_BASE_REF=origin/main pnpm lint
```

FAILED: core purity passed (170 files), then lane self-comparison refusal.

### Run 7 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-m3-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm exec turbo run lint --force --concurrency=2
```

GREEN: 7 package lint tasks, 0 cache hits. This is package lint, not a root lane pass.

### Run 8 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-m3-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm build --concurrency=2 --force
```

GREEN: 7 package build tasks, 0 cache hits; 32 static pages generated.

### Run 9 — exit 1

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-m3-1-bin:$PATH"; LANE_BASE_REF=origin/main pnpm lint:lanes
```

FAILED: lane self-comparison refusal.

### Run 10 — exit 0

```sh
node tools/money-arithmetic-lint.mjs && node tools/commercial-boundary-lint.mjs
```

GREEN: money and commercial boundary scripts; no tests.

### Run 11 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-m3-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/offline-risk.application.test.ts
```

GREEN: 1 application file, 3 tests (session/repository doubles).

### Run 12 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-m3-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/offline-contract.test.ts src/offline-contract.properties.test.ts
```

GREEN final pure source: 2 files, 9 tests, including 64 seeded histories.

### Run 13 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-m3-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/db exec tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext test/offline-risk-test-utils.ts test/offline-risk.integration.test.ts test/offline-risk.properties.integration.test.ts
```

GREEN: static compilation of the 3 own database test/helper files; not PostgreSQL execution.

### Run 14 — exit 1

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-m3-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm openapi:check
```

BLOCKED: tsx IPC listen EPERM; generator did not execute. No alternative attempted.

### Run 15 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-m3-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/db exec tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext test/offline-risk-test-utils.ts test/offline-risk.integration.test.ts test/offline-risk.properties.integration.test.ts
```

GREEN final database-test sources: 3 files statically compiled; no PostgreSQL execution.

## NOT RUN — exact suites and why

- packages/db/test/offline-risk.integration.test.ts (13 tests): NOT RUN (cannot start PostgreSQL here); no red or green DB execution claimed.
- packages/db/test/offline-risk.properties.integration.test.ts (2 tests): NOT RUN (cannot start PostgreSQL here); no generated DB history executed.
- packages/db/test/site-extra.integration.test.ts, site-visit.integration.test.ts, command-replay-contract.integration.test.ts: NOT RUN (PostgreSQL; dispatcher/CI).
- packages/db/test/lp-0-grant-freeze.integration.test.ts, lp-0-authority-paths.integration.test.ts, fingerprinted-row-shape.integration.test.ts: NOT RUN (PostgreSQL; dispatcher/CI).
- packages/db/test/tenancy.integration.test.ts, contractor-session-context.integration.test.ts, extra-origin.integration.test.ts: NOT RUN (PostgreSQL; dispatcher/CI). Origin filename verified, not guessed.
- apps/api/src/contractor/site-extra.application.test.ts, site-visit.application.test.ts and apps/api/src/auth/context-boundary.test.ts: NOT RUN locally, because the binding addendum restricts this builder to its own test files. They remain mandatory dispatcher/CI regressions, unchanged.
- pnpm test, pnpm test:db, pnpm test:migrations and browser/e2e suites: NOT RUN (full suites are dispatcher-owned; PostgreSQL/browser unavailable; browser expressly CI-only).
- pnpm install --frozen-lockfile: NOT RUN (dispatcher says dependencies already installed; no downloads).
- pnpm eval/live model evaluation: NOT RUN; no prompt, model, extraction or AI-gateway behavior changes.
- Device/Expo/EAS/encrypted SQLite/PowerSync build suites and real provider route verification: NOT RUN and HELD; no issued native slice, physical device, approval or provider connection.

No mandatory suite was made optional and no check/script/test assertion was weakened.

## Migration, grants, compatibility and operations

Migration count: **0**. New tables/columns/routines/triggers/policies/backfills: **0**. New GRANT statements: **0** (no lines to enumerate). Standard F: no new direct INSERT/UPDATE/DELETE grant to jobguard_runtime on any money, membership, authorization, receipt or audit table; no equivalent routine bypass and no new runtime write power. Existing LP exceptions are neither expanded nor accepted. Catalog proofs await CI. No SQL own-step upgrade proof applies because there is no migration; existing migration/fresh-install regressions remain mandatory CI evidence.

Existing direct requests gain no required field. The new envelope imposes UUIDv7 only on its own command identity. Existing successful result/audit versions and request hashing stay unchanged. UUID/HLC do not override current permission/revision/approval checks. The note command deliberately captures the current order provenance for a new capture; it does not gain an invented expected-revision field. Unsupported transports cannot rewrite history. Reversion removes only the module/export and new test/docs files, with no stored-data deletion or compensation. No new operational alerts or external actions are introduced.

No screens, wording polish, native dependencies, sync credentials, upload endpoint, persistence metadata, financial policy, retention period, access lease or release gate was added. Physical supported iOS/Android development-build proof, exact native versions/flags/OS matrix, encryption/adapter compatibility, native authorized read/queued command/restart recovery, mobile session exchange/refresh, download isolation/revocation, approved hosting route, D08, G3 and applicable LP real-data gates remain HELD. No global/unencrypted fallback exists in this change.

## Source self-review (builder inspection only)

Checked strict objects at every envelope level; closed version/operation errors; unchanged text/identity conversion; exclusion of advisory metadata; empty executable merge list; no alternate context maker or production cast/bridge; no route, network, executor or additional hash; actual live/authority logic remains in merged repositories. The new DB tests use owner-connected fixture updates and product operations, not new runtime write privileges or app.transition_job. They never claim synthetic setup is persisted mobile authentication. Convergence compares semantic sets and unique effects, not cross-run audit order. Fault tests preserve prior facts and existing permitted refusal audit. Test docs inspect only this piece's document tokens, not whole-file hashes or shared files.

Protected source, pins, existing tests and shared registry are unchanged, established by byte comparison with origin/main and SHA-256 below. No permanent pin/hash test was added. No other tracked file changed. The shared core index was inspected clean at start and is exactly the base bytes plus one export at the end; no concurrent local changes were observed. Dispatcher still owns external shared-export serialization and final registration before integration. No independent review is claimed by this self-review.

## Diff and hash evidence

Actual `git diff --stat` (untracked new files are listed separately below):

```text
packages/core/src/index.ts | 1 +
 1 file changed, 1 insertion(+)
```

Changed/new file snapshots before writing this receipt (the receipt itself is excluded from self-hashing):

| Path | Lines | SHA-256 |
| --- | ---: | --- |
| packages/core/src/index.ts | 73 | 1af7ab6714b1c156ce340d9d448197d67c541840da3254f31df3842c8ea0ac0e |
| apps/api/src/contractor/offline-risk.application.test.ts | 67 | d38ff49ae02248d0f2d5aa833f2fd722fd70996df2138e3adae0645443db74fd |
| docs/contracts/offline-contract-v1.md | 91 | 1d6739abda06a110773b3b50062ca7c4bfbac018189e199456905519d913d770 |
| docs/ledger/M3-1.md | 11 | 830c5bfa917e0678500fbcf409b97abf7b6259fa969a067b8382eec21748bb98 |
| packages/core/src/offline-contract.properties.test.ts | 30 | c3fa12c93c2fb0767f1591ad7ce1cd652a097440dec08129b24b90fdfd04c437 |
| packages/core/src/offline-contract.test.ts | 78 | e8d17aa03643f7c4bedd239f403ed09b898939a5ed7a66cdf5d721bf64921b6c |
| packages/core/src/offline-contract.ts | 52 | 4509632b152ac84d74c7128880450b4ff5a0109a617599b47723cc7fe8d2b55c |
| packages/db/test/offline-risk-test-utils.ts | 69 | 9b10d8e836754d5742061c871e2d924664336448795ef94b3eceb404cc5ecc6a |
| packages/db/test/offline-risk.integration.test.ts | 155 | bc37488c6ee49461fedf7ab6b3b858728a86f0d98219d34d5a01fd3b6bf4cbe8 |
| packages/db/test/offline-risk.properties.integration.test.ts | 87 | 1359f34473c2ec37f578ad99db76671e2e5f479b89bd9b10fac0dc3b46eeb75b |

Each protected file below matched origin/main byte for byte:

| Path | SHA-256 |
| --- | --- |
| apps/api/src/auth/context-boundary.test.ts | a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 |
| packages/db/src/practice-session.ts | 9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14 |
| packages/db/src/contractor-repository.ts | 56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c |
| packages/db/src/contractor-party-repository.ts | e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0 |
| packages/db/src/work-order-repository.ts | 4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3 |
| packages/db/src/sor-repository.ts | 45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5 |
| packages/db/src/job-scheduling-repository.ts | ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d |
| packages/db/src/work-order-fixtures.ts | cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386 |
| packages/db/src/contractor-session-context.ts | a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c |
| packages/db/src/tenant-context.ts | 9237013c368deeec3d14098b030264dbd6cc3e57534e4cbc237cad06aa2b4b0f |
| packages/core/src/watchdog.ts | a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca |
| packages/db/test/watchdog-command-harness.ts | 3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 |
| packages/db/test/command-replay-contract.integration.test.ts | db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f |
| packages/db/test/lp-0-grant-freeze.integration.test.ts | a73ac807718653f39e5a541762a08f64eebf3fcf0fe27a840180f31a985e83fa |
| packages/db/test/lp-0-authority-paths.integration.test.ts | 5bee8dc97b439ea261105a1a8bcf9e6301968e2e88c8f92dd6f60d090217cb56 |
| packages/db/test/fingerprinted-row-shape.integration.test.ts | be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8 |
| config/agent-lane-assignments.json | fe0806c43026c193b755cb9f6ca0d66c7517de4a26709abdda6358cd610c3c04 |
| pnpm-lock.yaml | 06b501e413424d77fc5c3a1ac0f481b7230c271e36bfbde2cb953385ccccd349 |
| .nvmrc | b911698dc3cf3227d34d0ad6727f1c4408791203c9665de99ab959331a1fb07d |
| package.json | fa4702713c4e2401017a7b4edde569ccaaccb086f5c65bb38c88daa171745da0 |

The exact source-evidence command was a read-only Python script using git diff --name-only, git show origin/main:<path>, git ls-files --others --exclude-standard and hashlib.sha256; exit 0. It asserted only packages/core/src/index.ts is a modified tracked path and checked the additive export against the base. This is receipt evidence, not a permanent test.

Final head SHA (no builder commit): `6671538c8d69936c162368c760dd6ce0f7f10493`.

## Inspection and environment command ledger

## Final scope verification — exit 0

Read-only receipt verification; no permanent test or lane-tool replacement:

```sh
python3 - <<'PY'
import pathlib, subprocess, hashlib, re
root=pathlib.Path.cwd()
def git(*args): return subprocess.check_output(['git',*args],text=True).strip()
allowed={'packages/core/src/index.ts','packages/core/src/offline-contract.ts','packages/core/src/offline-contract.test.ts','packages/core/src/offline-contract.properties.test.ts','apps/api/src/contractor/offline-risk.application.test.ts','packages/db/test/offline-risk-test-utils.ts','packages/db/test/offline-risk.integration.test.ts','packages/db/test/offline-risk.properties.integration.test.ts','docs/contracts/offline-contract-v1.md','docs/ledger/M3-1.md','docs/verdicts/M3-1/BUILDER_RECEIPT.md'}
changed=set(git('diff','--name-only').splitlines())|set(git('ls-files','--others','--exclude-standard').splitlines())
assert changed==allowed,changed^allowed
receipt=(root/'docs/verdicts/M3-1/BUILDER_RECEIPT.md').read_text()
for name, digest in re.findall(r'^\| ([^|]+?) \| ([0-9a-f]{64}) \|$',receipt,re.M):
 assert hashlib.sha256((root/name.strip()).read_bytes()).hexdigest()==digest,name
prior=subprocess.check_output(['git','show','origin/main:packages/core/src/index.ts'])
assert (root/'packages/core/src/index.ts').read_bytes()==prior+b'export * from "./offline-contract.js";\n'
assert git('rev-parse','HEAD')=='6671538c8d69936c162368c760dd6ce0f7f10493'
assert pathlib.Path('/private/tmp/jg-msg-m3-1.txt').read_text().startswith('feat(offline):')
subprocess.run(['git','diff','--check'],check=True)
print('Final scope: 11 allowed paths; 1 additive tracked edit, 10 new files; protected hashes match; no commit.')
print(git('diff','--stat'))
print('HEAD '+git('rev-parse','HEAD'))
PY
```

Expected/result: 11 allowed paths, one additive tracked edit and ten new files; protected hashes match; no commit. The receipt is excluded from self-hashing. No additional test/build run occurred after the checks above.


These are read-only source/environment probes except the explicitly shown scratch shim creation. Nonzero missing-path probes stopped their remaining && operands; they are not acceptance checks. No tests ran in these batches. The denied ps command is listed exactly and was not retried. File edits used apply_patch; all patch calls completed without error and performed no Git write.

### Inspection 1 — exit 0

```sh
pwd && git status --short && git rev-parse HEAD && git rev-parse origin/main && cat AGENTS.md && cat package.json
```

### Inspection 2 — exit 0

```sh
rg -n 'M3-1|11.4|11.7|11.8|PLAN-LPL|R1:|R3:|R4:|R5:|C[1-8]|Ready rule' BUILD_PLAN.md && rg --files config docs/contracts packages/db/test apps/api/src/contractor | rg '(lane|offline|site-extra|site-visit|extra-origin|lp-command|grant|privacy|session|command|extra-fixtures|pool-test|tenant-context)' && cat tools/agent-lane-boundary-lint.mjs
```

### Inspection 3 — exit 0

```sh
cat packages/core/src/site-extra.ts apps/api/src/contractor/site-extra.application.ts apps/api/src/contractor/site-extra.application.test.ts apps/api/src/contractor/site-visit.application.test.ts
```

### Inspection 4 — exit 0

```sh
cat packages/db/test/site-extra.integration.test.ts packages/db/test/site-extra-fixtures.ts packages/db/test/extra-fixtures.ts
```

### Inspection 5 — exit 0

```sh
cat packages/core/src/site-extra.ts apps/api/src/contractor/site-extra.application.ts apps/api/src/contractor/site-extra.application.test.ts
```

### Inspection 6 — exit 2

```sh
rg -n 'fragment|lanes/|assignment|registry' tools/agent-lane-boundary-lint.mjs && rg --files config docs/ledger migration-notes 2>/dev/null && cat packages/core/package.json packages/db/vitest.config.ts apps/api/vitest.config.ts && cat .nvmrc && node --version && memory_pressure | tail -1 && df -g /System/Volumes/Data
```

### Inspection 7 — exit 0

```sh
sed -n '2830,2846p' BUILD_PLAN.md && cat docs/contracts/lp-command-binding-design-v1.md docs/contracts/site-extra-v1.md docs/contracts/site-visit-v1.md docs/decisions/d08-offline-security-conflicts.md && rg --files docs/contracts | rg '(command|auth|privacy|grant|lp-0)'
```

### Inspection 8 — exit 0

```sh
cat packages/db/src/site-extra-repository.ts && sed -n '1,250p' packages/db/test/site-extra.integration.test.ts && cat packages/db/test/site-visit.integration.test.ts
```

### Inspection 9 — exit 1

```sh
cat packages/core/package.json packages/db/vitest.config.ts apps/api/vitest.config.ts && cat .nvmrc && node --version && memory_pressure | tail -1 && df -g /System/Volumes/Data && rg -n 'pinned|sha256|src/|index.ts' apps/api/src/auth/context-boundary.test.ts && cat /Users/benharwood/.local/share/full-steam/handoffs/jobguard-task.md
```

### Inspection 10 — exit 0

```sh
cat .nvmrc && node --version && memory_pressure | tail -1 && df -g /System/Volumes/Data
```

### Inspection 11 — exit 0

```sh
cat packages/db/src/site-extra-repository.ts
```

### Inspection 12 — exit 0

```sh
rg -n 'replaying a command|changed payload|another job|successful no-op|not-live contractor|unauthorised caller|precheck|race' packages/db/test/site-extra.integration.test.ts && sed -n '1,65p' packages/db/test/site-extra.integration.test.ts
```

### Inspection 13 — exit 0

```sh
rg -n 'hash|pin|src/|index.ts' apps/api/src/auth/context-boundary.test.ts && cat apps/api/package.json && cat packages/db/test/tenant-context-test-utils.ts && rg --files packages/db/test | rg 'origin.*integration'
```

### Inspection 14 — exit 0

```sh
cat /Users/benharwood/.local/share/full-steam/handoffs/jobguard-task.md
```

### Inspection 15 — exit 0

```sh
sed -n '130,190p' packages/db/src/site-extra-repository.ts
```

### Inspection 16 — exit 0

```sh
sed -n '1,45p' packages/db/test/site-extra.integration.test.ts && sed -n '180,290p' packages/db/test/site-extra.integration.test.ts
```

### Inspection 17 — exit 0

```sh
sed -n '1,105p' packages/db/test/site-visit-fixtures.ts && sed -n '15,80p' packages/core/src/site-visit.ts
```

### Inspection 18 — exit 1

```sh
sed -n '1,120p' docs/contracts/command-v1.md && rg --files docs/contracts | rg '(privacy|auth|grant|lp-0)' && sed -n '200,255p' tools/agent-lane-boundary-lint.mjs
```

### Inspection 19 — exit 1

```sh
rg --files docs/contracts | rg '(command|auth|privacy|grant|lp-0)' && sed -n '1,70p' packages/db/test/site-extra.integration.test.ts && sed -n '150,185p' packages/db/test/site-extra.integration.test.ts && sed -n '208,248p' tools/agent-lane-boundary-lint.mjs && cat vitest.config.ts && cat packages/db/tsconfig.json
```

### Inspection 20 — exit 0

```sh
sed -n '1,100p' docs/contracts/authentication-v1.md && sed -n '1,65p' docs/contracts/lp-0-effective-privileges-v1.md && rg --files docs | rg '(command|privacy|data-flow)' && sed -n '1,100p' packages/db/src/commands.ts && cat packages/db/tsconfig.json && ls -l /Users/benharwood/Library/pnpm/bin/pnpm
```

### Inspection 21 — exit 1

```sh
cat /Users/benharwood/Library/pnpm/bin/pnpm && command -v pnpm && ls node_modules/.bin/vitest && ls /Users/benharwood/Library/pnpm && cat .npmrc && cat tsconfig.json
```

### Inspection 22 — exit 1

```sh
ps -axo pid,ppid,etime,command | rg '(pnpm|vitest|4200)' && ls node_modules/.bin && ls packages/core/node_modules/.bin && ls /Users/benharwood/Library/pnpm/.tools/pnpm && cat .npmrc && cat tsconfig.json
```

### Inspection 23 — exit 1

```sh
ls node_modules/.bin && ls packages/core/node_modules/.bin && ls /Users/benharwood/Library/pnpm/.tools/pnpm && cat .npmrc && cat tsconfig.json
```

### Inspection 24 — exit 130

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export npm_config_manage_package_manager_versions=false; pnpm --version
```

### Inspection 25 — exit 0

```sh
cat tsconfig.json && sed -n '1,55p' docs/contracts/provider-data-flow-v1.md && sed -n '1,110p' packages/db/src/tenant-context.ts && sed -n '1,80p' packages/db/src/extra-repository.ts
```

### Inspection 26 — exit 130

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --manage-package-manager-versions=false --version
```

### Inspection 27 — exit 1

```sh
ls /Users/benharwood/.local/share/pnpm && ls /Users/benharwood/Library/pnpm/global/v11 && cat packages/core/node_modules/.bin/vitest && cat node_modules/.bin/turbo
```

### Inspection 28 — exit 2

```sh
which -a pnpm && ls /Users/benharwood/Library/pnpm/global/v11 && cat packages/core/node_modules/.bin/vitest && cat node_modules/.bin/turbo && rg --files --hidden /Users/benharwood/.cache/node/corepack /opt/homebrew/lib/node_modules /Users/benharwood/Library/Caches/node/corepack -g pnpm.cjs -g package.json
```

### Inspection 29 — exit 0

```sh
mkdir -p /private/tmp/jg-m3-1-bin
cat > /private/tmp/jg-m3-1-bin/pnpm <<'EOF'
#!/bin/sh
exec node "$HOME/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs" "$@"
EOF
chmod +x /private/tmp/jg-m3-1-bin/pnpm
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/jg-m3-1-bin:$PATH"
pnpm --version
```

### Inspection 30 — exit 0

```sh
rg -n 'async assignedJobs|new Pool|testTenantContext|type' packages/db/src/site-visit-repository.ts && cat packages/core/tsconfig.json && rg -n 'contractor_session|operative|role' packages/db/src/contractor-session-context.ts && rg --files -g '*vitest*' -g '*tsconfig*' apps/api
```

### Inspection 31 — exit 0

```sh
tail -8 packages/core/src/index.ts && sed -n '192,218p' packages/db/src/site-visit-repository.ts && sed -n '185,202p' packages/db/src/site-extra-repository.ts && cat tools/lint.mjs
```

### Inspection 32 — exit 0

```sh
cat apps/api/tsconfig.json && cat turbo.json && git diff --stat && git status --short && rg -n 'pin|Hash|hash' apps/api/src/auth/context-boundary.test.ts | head -25
```

### Inspection 33 — exit 0

```sh
git ls-tree origin/main packages/db/test/extra-origin.integration.test.ts && sed -n '82,99p' apps/api/src/auth/context-boundary.test.ts && sed -n '1,65p' tools/core-purity-lint.mjs && sed -n '1,75p' packages/db/src/contractor-session-context.ts && sed -n '1,50p' tools/agent-lane-boundary-lint.mjs
```

### Inspection 34 — exit 0

```sh
git branch --show-current && git diff --check && rg -n '^###|Status|approver' docs/decisions/d08-offline-security-conflicts.md && rg -n 'Keep history|stop future' docs/contracts/extra-approval-v1.md && git ls-tree --name-only origin/main config/lanes docs/ledger migration-notes tools/migration-renumber.mjs && rg -n 'site_extra|site-extras|LogSiteExtra|pre_live_allowed' packages/core/src/watchdog.ts | tail -12
```

### Inspection 35 — exit 1

```sh
rg -n 'readFile|node:|readFileSync|import.meta' packages/core/src/*.test.ts | head -35 && ls packages/core/node_modules/@types && cat packages/core/src/offline-contract.test.ts | tail -10
```

### Inspection 36 — exit 0

```sh
sed -n '169,218p' tools/agent-lane-boundary-lint.mjs && cat packages/db/test/pool-test-utils.ts | head -35 && git diff --numstat
```

### Inspection 37 — exit 0

```sh
memory_pressure | tail -1 && df -g /System/Volumes/Data && git diff --check && git diff -- packages/core/src/index.ts && nl -ba tools/agent-lane-boundary-lint.mjs | sed -n '208,220p' && git rev-parse HEAD
```

### Inspection 38 — exit 0

```sh
git status --short && git diff --check && memory_pressure | tail -1 && df -g /System/Volumes/Data
```

### Inspection 39 — exit 0

```sh
memory_pressure | tail -1 && df -g /System/Volumes/Data
```

### Inspection 40 — exit 0

```sh
git diff --check && git ls-tree -r --name-only origin/main packages/db/migrations | tail -3 && git diff --stat && git status --short
```

### Inspection 41 — exit 0

```sh
python3 - <<'PY'
import subprocess, pathlib, hashlib, json
root=pathlib.Path.cwd()
def git(*args): return subprocess.check_output(['git',*args],text=True).strip()
protected=['apps/api/src/auth/context-boundary.test.ts','packages/db/src/practice-session.ts','packages/db/src/contractor-repository.ts','packages/db/src/contractor-party-repository.ts','packages/db/src/work-order-repository.ts','packages/db/src/sor-repository.ts','packages/db/src/job-scheduling-repository.ts','packages/db/src/work-order-fixtures.ts','packages/db/src/contractor-session-context.ts','packages/db/src/tenant-context.ts','packages/core/src/watchdog.ts','packages/db/test/watchdog-command-harness.ts','packages/db/test/command-replay-contract.integration.test.ts','packages/db/test/lp-0-grant-freeze.integration.test.ts','packages/db/test/lp-0-authority-paths.integration.test.ts','packages/db/test/fingerprinted-row-shape.integration.test.ts','config/agent-lane-assignments.json','pnpm-lock.yaml','.nvmrc','package.json']
rows=[]
for name in protected:
 current=(root/name).read_bytes(); prior=subprocess.check_output(['git','show','origin/main:'+name]); assert current==prior,name
 rows.append({'path':name,'sha256':hashlib.sha256(current).hexdigest(),'matches_base':True})
changed=git('diff','--name-only').splitlines(); assert changed==['packages/core/src/index.ts'],changed
index=(root/changed[0]).read_bytes(); prior=subprocess.check_output(['git','show','origin/main:'+changed[0]]); assert index==prior+b'export * from "./offline-contract.js";\n'
new=git('ls-files','--others','--exclude-standard').splitlines()
print(json.dumps({'head':git('rev-parse','HEAD'),'base':git('rev-parse','origin/main'),'diff_stat':git('diff','--stat'),'protected':rows,'files':[{'path':p,'lines':len((root/p).read_text().splitlines()),'sha256':hashlib.sha256((root/p).read_bytes()).hexdigest()} for p in changed+new]},indent=2))
PY
```

### Inspection 42 — exit 0

```sh
git diff --check && git status --short && rg -c '^it\(' packages/db/test/offline-risk.integration.test.ts packages/db/test/offline-risk.properties.integration.test.ts && sed -n '1,16p' docs/verdicts/M3-1/BUILDER_RECEIPT.md && sed -n '36,48p' docs/verdicts/M3-1/BUILDER_RECEIPT.md && cat /private/tmp/jg-msg-m3-1.txt
```




## Repair r2 — 15 October 2026, dispatcher 11

PR #224, inspected head `619e05373c9fc4bbcf02c627ce62fedd79eb3423`, branch `codex/sandbox/m3-1`. **STOP: no expectation repair justified by the inspected merged behavior.** Only this receipt is changed in r2. All own and merged tests, implementation, migrations, dependencies and pins remain unchanged. No Git write, package download, browser, PostgreSQL instance, provider action or release was performed. Dispatcher owns commit/push and CI. This is source inspection and local check evidence, not an independent verdict or technical acceptance.

### What the failing assertion actually checks

`offline-risk.properties.integration.test.ts:65–70` launches capture, grant revocation and **work-order baseline revision concurrently** through `Promise.allSettled`. The generated operation list is launch order, not committed execution order. Line 70 requires the revoke and revise promises to be fulfilled; capture already has its own success/refusal branch at lines 74–82. Thus the supplied `expected 'rejected' to be 'fulfilled'` is an administration/baseline operation failure, not the assertion that capture succeeded. The abbreviated failure does not identify which operation rejected or expose its reason.

`offline-risk-test-utils.ts:57–63` revises the work order as the owner via `WorkOrderRepository.importCsv`; it does not call `reviseExtra` or revise a captured extra. No inspected merged rule refuses this owner baseline revision merely because a site user's raising grant was revoked. `0054_contractor_organisation.sql:83–88` keeps membership activity distinct from grant revocation, and `0110_work_orders.sql:413–417` validates assignment membership/team activity. The merged authority rule for a revoked **site capture** is instead `NOT_FOUND`: `0135_site_extra_authority.sql:48–64,82–84`, translated by `site-extra-repository.ts:177–181` after a transaction-time authority refusal. `SITE_EXTRA_UNAVAILABLE` at `site-extra-repository.ts:193–195` is the fallback for other errors; its existence does not document a baseline-revision business refusal. The r1 table must not be amended to claim such a rule.

### Merged lock-order defect found by source inspection

There is a concrete lock-order inversion in these unchanged merged paths:

1. Capture inserts `extra_origin` at `packages/db/src/extra-repository.ts:99–100`, then calls the authority seam at line 102. The immediate foreign key `extra_origin_order_fk` (`packages/db/migrations/0122_extra_origin_persistence.sql:17`) references the work-order row, acquiring PostgreSQL's referenced-row key-share lock until transaction end. The seam (`site-extra-repository.ts:31–35`) then requests the **shared tenant administration lock** in `packages/db/migrations/0135_site_extra_authority.sql:77`.
2. Baseline revision takes that tenant lock **exclusively first** at `packages/db/src/work-order-repository.ts:120`, then calls `app.work_order_commit`, whose revision branch locks the referenced work-order row `FOR UPDATE` at `packages/db/migrations/0110_work_orders.sql:378`.
3. If capture has inserted its origin before revision takes the tenant lock, revision can wait for capture's work-order key-share lock while capture waits for revision's tenant lock. This cycle can deadlock. It requires no policy refusal caused by grant revocation.
4. PostgreSQL deadlock SQLSTATE `40P01` maps to `STALE_REVISION` on the capture path (`extra-repository.ts:35`), but `workOrderFailure` handles only `40001` as stale (`work-order-repository.ts:42`) and falls back to `DATABASE_UNAVAILABLE` at line 44 for `40P01`. A revision chosen as victim therefore rejects its promise instead of reporting a documented domain refusal. Changing the property to accept arbitrary rejection or `SITE_EXTRA_UNAVAILABLE` would hide this distinction.

**Before / after, as required by the stop instruction:**

| Merged file / line | Before | After this repair |
| --- | --- | --- |
| `packages/db/src/extra-repository.ts:99–102` | Insert origin (referenced work-order lock), then call authority seam (tenant lock). | Identical; not edited. |
| `packages/db/src/work-order-repository.ts:120` and `packages/db/migrations/0110_work_orders.sql:378` | Exclusive tenant lock, then work-order `FOR UPDATE`. | Identical; not edited. |
| `packages/db/src/work-order-repository.ts:42–44` | Only `40001` maps to `STALE_REVISION`; `40P01` falls through to `DATABASE_UNAVAILABLE`. | Identical; not edited. |
| `packages/db/test/offline-risk.properties.integration.test.ts:70,73,80` | Revoke/revise must fulfill; baseline must change; capture refusal set is `NOT_FOUND`, `EXTRA_FORBIDDEN`, `STALE_REVISION`. | Identical; no expectation broadened and all baseline/authority/rollback/audit assertions retained. |

A separately authorized merged fix needs consistent tenant/work-order lock acquisition before foreign-key writes, deliberate conflict translation and a barrier-controlled real-PostgreSQL regression. No such fix is attempted in this lane. **The lock inversion is source-inspected; its responsibility for this particular CI failure is not established without the rejected promise's operation/reason or a real database reproduction.** The exact r2 stack/reason was requested. A read-only `gh run list --repo ben2harwood-lgtm/jobguard --branch codex/sandbox/m3-1 --limit 4 --json databaseId,headSha,status,conclusion` failed to connect to `api.github.com` (exit 1); the existing local `m31-ci-fail.txt` contains r1 failures only. No browser or alternate network route was used.

### Local validation

Node v24.17.0; existing cached pnpm 10.28.1 via `/private/tmp/jg-m3-1-bin/pnpm`; Vitest 4.1.11. Dependencies were already installed; this is not a clean install or pinned-Node execution. Commands ran serially with `PATH=/private/tmp/jg-m3-1-bin:$PATH`, through `~/.local/bin/heavy-slot`; lane commands also set `LANE_BASE_REF=origin/main`. The wrapper emitted sandbox-denied sysctl/sysmond/pgrep diagnostics, then executed the checks without modification. Turbo cache IO permission warnings were present; forced completed checks had zero cache hits.

| Command (after environment prefix) | Actual result |
| --- | --- |
| `~/.local/bin/heavy-slot m31-r2-typecheck pnpm typecheck --force --concurrency=2` | PASS, 7/7 package tasks, exit 0. |
| `~/.local/bin/heavy-slot m31-r2-lint pnpm lint --force --concurrency=2` | PASS, root boundary checks and 7/7 package tasks, exit 0. |
| `~/.local/bin/heavy-slot m31-r2-lanes pnpm lint:lanes` | PASS, m3-1 lane, exit 0. Checks the committed range; receipt working-tree diff inspected separately. |
| `~/.local/bin/heavy-slot m31-r2-unit pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage --workspace-concurrency=1 test --maxWorkers=2` | FAIL, exit 1 in core: 176 files / 5,012 tests passed, 2 compiled `dist` tests failed with ENOENT for `dist/recovery-allocation.ts` and `dist/site-extra-pricing.ts`. Source-reading tests are duplicated by existing emitted build artifacts. The command aborted; no passing aggregate result is claimed for the other packages. No artifact deletion or merged test/config edit was attempted. |
| `~/.local/bin/heavy-slot m31-r2-core pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | PASS, all 90 source files / 2,517 tests, exit 0. This explicit source run excludes emitted duplicates; it does not replace the failed aggregate command result. |
| `~/.local/bin/heavy-slot m31-r2-api pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/offline-risk.application.test.ts` | PASS, 1 file / 3 tests, exit 0; session/repository doubles, no live database/network claim. |

Root `pnpm test` is not run: it includes forbidden PostgreSQL/socket work and tools lane tests that themselves execute Git writes in temporary repositories. Database/migration/browser/device suites remain unexecuted in this sandbox. No model/prompt/parser change requires a new evaluation run. Aggregate M3-1 and the reported failing database property remain held; r2 does not claim to repair or pass that property.

| Additional command | Actual result |
| --- | --- |
| `~/.local/bin/heavy-slot m31-r2-build pnpm build --force --concurrency=2` | PASS, 7/7 package tasks, exit 0. Existing workspace-root, CSS compatibility, file-type export and dynamic dependency warnings; no adjacent fixes. |
| `~/.local/bin/heavy-slot m31-r2-openapi pnpm openapi:check` | BLOCKED, exit 1 before generation: tsx IPC `listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/78161.pipe`. No alternate execution route attempted. |
| `node --input-type=module` importing built `workOrderFailure`, with `node:assert/strict` assertions for synthetic errors with SQLSTATE `40P01` and `40001` | PASS, exit 0: respectively `DATABASE_UNAVAILABLE` and `STALE_REVISION`. Pure error-mapping execution only; does not reproduce a PostgreSQL deadlock or identify the rejected CI promise. |

Read-only `git diff --quiet origin/main --` the three merged repositories and migrations `0110`, `0122`, `0135` exited 0. `git diff --check` passed; final working-tree scope is this receipt alone. Intended conventional commit message (documentation-only STOP report) is overwritten at `/private/tmp/jg-msg-m3-1.txt`. No acceptance, migration, backwards-compatibility change or new operational alert is introduced. The failed aggregate unit command, blocked OpenAPI check and unresolved database property are explicitly not passes.

## Repair r3 — 15 October 2026, dispatcher 11

PR #224, inspected starting head `b59ad5d727f5f84741a52cf5d8a1067b1ec8b9ad`, branch `codex/sandbox/m3-1`. Coordinator ruling **option A** authorizes changing only the launch of this PR's own `M31-S15 generated authority and baseline changes have explicit outcomes` property. Capture and grant revocation still launch concurrently in generated order. After **both settle**, launch the owner work-order baseline revision, then insert its settled result at the original operation index so every existing assertion uses the same operation/result association.

Reason: r2 source-inspected a **merged lock-order inversion**: capture inserts its origin and acquires a referenced work-order lock before taking the tenant administration lock (`extra-repository.ts:99–102`); work-order revision takes the tenant lock first (`work-order-repository.ts:120`) then requests the work-order row `FOR UPDATE` (`0110_work_orders.sql:378`). Revision does not translate deadlock `40P01` to a documented conflict (`work-order-repository.ts:42–44`). **FIX-LATER: piece LOCK-ORDER-1** owns fixing that merged defect and restoring the same-instant variant. This repair avoids that overlap; it neither repairs nor reproduces the merged deadlock. The r2 finding's responsibility for the abbreviated CI failure remains source-inspection evidence, not a proven database reproduction.

All assertions remain byte-for-byte unchanged: revoke and revise must fulfill; the baseline must actually change; successful capture must retain valid immutable provenance; capture refusal remains exactly `NOT_FOUND`, `EXTRA_FORBIDDEN`, `STALE_REVISION` with no partial receipt/origin; both new work and replay after revocation must refuse with `NOT_FOUND` without changing facts; the audit chain must validate. Seeds, generated operation lists, capture/revocation concurrency, other property and all other tests remain unchanged. A short ledger note records this authorized limitation. No merged implementation/test, fixture, migration, grant, dependency, pin, contract or runtime behavior is changed. No new operational alert or backwards-compatibility impact.

### Actual local checks

Node v24.17.0; cached pnpm 10.28.1 via existing `/private/tmp/jg-m3-1-bin/pnpm`; Vitest 4.1.11. Existing dependencies used without installation; not a clean pinned-runtime execution. The commands below use `PATH=/private/tmp/jg-m3-1-bin:$PATH`; lint and lane commands also use `LANE_BASE_REF=origin/main`. Heavy checks use the unmodified `~/.local/bin/heavy-slot`. Its resource probes emit sandbox-denied sysctl/sysmond/pgrep diagnostics, but the wrapper executes the checks. Turbo reports cache IO permission warnings; forced completed checks have zero cache hits. Logs are `/private/tmp/jg-m31-r3-<check>.log`.

| Command after environment prefix | Actual result |
| --- | --- |
| `~/.local/bin/heavy-slot m31-r3-typecheck pnpm typecheck --force --concurrency=2` | PASS, 7/7 package tasks, exit 0. |
| `~/.local/bin/heavy-slot m31-r3-lint pnpm lint --force --concurrency=2` | PASS, root boundary checks and 7/7 package tasks, exit 0. |
| `~/.local/bin/heavy-slot m31-r3-lanes pnpm lint:lanes` | PASS, m3-1 lane, exit 0. Checks committed range against origin/main; final working-tree scope inspected separately. |
| `~/.local/bin/heavy-slot m31-r3-db-static pnpm --filter @jobguard/db exec tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext test/offline-risk-test-utils.ts test/offline-risk.integration.test.ts test/offline-risk.properties.integration.test.ts` | Initial FAIL, exit 1: inferred capture/revoke result array excluded the revision result type. Added an explicit heterogeneous `PromiseSettledResult<unknown>[]` annotation to the launch result array; no assertion changed. |
| Same DB static command with label `m31-r3-db-static-final` | PASS, exit 0 after annotation. This compiles test sources excluded by the package tsconfig; no PostgreSQL execution. |
| `~/.local/bin/heavy-slot m31-r3-core pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | PASS, 90 source files / 2,517 tests, exit 0. Explicit source suite avoids the emitted duplicate-test issue documented in r2. |
| `~/.local/bin/heavy-slot m31-r3-unit pnpm --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage --workspace-concurrency=1 exec vitest run src --maxWorkers=2` | PASS, config 1 file / 1 test; AI 6 files / 85 tests; storage 1 file / 2 tests; exit 0. Synthetic adapter/rule tests only. |
| `~/.local/bin/heavy-slot m31-r3-api pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/offline-risk.application.test.ts` | PASS, 1 file / 3 tests, exit 0; session/repository doubles. |
| `node /private/tmp/jg-m31-r3-launch-probe.mjs` | PASS, exit 0: executes the actual launch block with deferred promise doubles, covering all six launch permutations, both capture/revoke settlement orders and eight success/refusal combinations (96 schedules). Proves revision starts only after both settle and result indexes remain aligned. Also compares the test prefix and entire post-launch suffix against HEAD byte-for-byte. Socket-free scheduling/source evidence only, not a PostgreSQL integration test. |
| `~/.local/bin/heavy-slot m31-r3-build pnpm build --force --concurrency=2` | PASS, 7/7 package tasks, exit 0. Existing workspace-root, CSS compatibility, file-type export and dynamic dependency warnings remain; no adjacent fixes. |
| `~/.local/bin/heavy-slot m31-r3-openapi pnpm openapi:check` | BLOCKED, exit 1 before generation: tsx IPC `listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/97448.pipe`. No alternate execution route attempted; CI must run the real check. |

Root `pnpm test` is not run because it includes PostgreSQL/socket suites and tool tests that execute Git writes in scratch repositories. Database/migration/browser/device suites remain for GitHub CI after the dispatcher commits and pushes. No native/device, independent model verdict, technical acceptance, release or aggregate M3-1 completion is claimed. No Git write, provider action, package installation or download was performed.

Final read-only `git diff --quiet origin/main -- packages/db/src/extra-repository.ts packages/db/src/site-extra-repository.ts packages/db/src/work-order-repository.ts packages/db/migrations/0110_work_orders.sql packages/db/migrations/0122_extra_origin_persistence.sql packages/db/migrations/0135_site_extra_authority.sql` passed (exit 0), confirming the identified merged paths remain unchanged. `git diff --check` passed. Final working-tree scope is the own property launch block, this receipt and the short ledger note. Intended conventional commit subject/body is overwritten at `/private/tmp/jg-msg-m3-1.txt`; dispatcher owns commit/push and CI. PostgreSQL verification and the sandbox-blocked OpenAPI check remain unverified, not passes.
