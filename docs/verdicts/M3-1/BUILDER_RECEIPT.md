Built by Codex; dispatched 13 Oct 2026.

# M3-1 builder receipt — named partial, check lane AMBER

The addendum requested a first line attributing this build to Claude Sonnet 5.5 with Codex unavailable. That attribution would be false in this session; the actual builder is recorded above. No model-review or acceptance evidence is supplied by this receipt.

Issued base, inspected origin/main and final HEAD: `6671538c8d69936c162368c760dd6ce0f7f10493`. Branch: `codex/sandbox/m3-1`. The base has not moved. No commit, staging, push, checkout, merge, migration or release was performed. Intended conventional commit subject/body: `/private/tmp/jg-msg-m3-1.txt`.

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



