Built by Codex (GPT-6); dispatched 13 Oct 2026.

# LATER-B4 builder receipt

Status: local implementation and deterministic checks only; partial handoff.
AMBER independent Opus verdict and separate acceptance are outstanding.
This is builder source inspection, not an independent model review or acceptance.

Attribution correction: the addendum's requested Sonnet / Codex-unavailable
first line would be inaccurate for this run. The actual builder is recorded above.

## Base and scope

- Branch: `codex/sandbox/later-b4`.
- Initial and final HEAD: `7ff452eeec1c523345d34715adfa3f8310062013`.
- Available `origin/main`: the same SHA. Main wins over the issued
  `ca435eeb5791638c787c830d6ba717146f694539` and draft `0bbb5ddb` bases.
- Verified against available main: `BUILD_PLAN.md:373` still records M0-11's
  two-phase verified upload / private versioned storage / scoped URLs;
  §5.6 at line 306 and AGENTS §5.8 require version-specific, byte-verified evidence.
  The cited `index.ts:63` is the download-version guard, and
  `index.test.ts:3` still checks only digest length and construction of an error.
- Only the issued adapter, new contract-test file, receipt and ledger are changed.
  No existing merged test, pinned list/value, fingerprint, harness or evidence service changed.
- No migration; no backfill, existing-object rewrite, bucket change or provider change.
  **New GRANTs: none.** Standard F: no runtime write grant added.
  No route, commercial action, new authorization path or new operational alert.
- Dependencies were preinstalled; Node `v24.17.0`, pnpm `10.28.1`,
  TypeScript `5.8.3`, Vitest `4.1.11`, Turbo `2.10.12`,
  AWS SDK/presigner `3.1131.0`, storage Zod `3.25.76`.
  No install command was issued. A stalled default launcher was interrupted;
  all completed pnpm checks used the already-installed pinned executable.

## Acceptance evidence

| ID | Test evidence in src/later-storage-contract.test.ts | Result |
|---|---|---|
| L044 | Actual download signing refuses undefined, null, empty, literal-null and whitespace-only IDs before SDK use; HEAD and GET version refusals are typed; HEAD mismatch prevents GET; GET mismatch prevents body consumption. | Executed, passing |
| L045 | Empty-input and abc SHA-256 known vectors; changed bytes change hash; actual read bytes/length beat supplied hash/length metadata. | Executed, passing |
| L046 | Actual signing, read and deletion methods refuse invalid versions; valid immutable IDs are preserved in SDK command inputs; upload signing still works. | Executed, passing |

Tests were written before the source edit. First executable run: **10 failed,
20 passed** (exit 1). A second pre-fix run added bytes to the mismatched-version
fixture to show the original method actually returned the wrong version;
again **10 failed, 20 passed** (exit 1). After the source edit: **30 passed**
(exit 0). Existing SHA-256 computation and missing-version refusals already worked;
their passing baseline checks are regression evidence, not newly fixed defects.
A constant 64-character hash cannot satisfy both known vectors and changed bytes.

Only external S3 client transport and the external presigner are mocked.
The adapter, SDK command objects and SHA-256 helper execute normally.
The SDK's synthetic responses include body bytes and metadata. There are no
live credentials, live storage calls or actual object deletions. This does not
prove bucket provisioning, real provider behavior or evidence-service integration.

## Builder self-review — source inspection only

The common internal version check rejects non-string, absent, empty,
whitespace-only and exact literal `null` IDs. It does not trim or otherwise
rewrite valid opaque versions. HEAD and GET must each match the supplied version,
so matching each other alone cannot substitute another version. The existing
`MissingObjectVersionError` / `MISSING_OBJECT_VERSION` remains the refusal type.

The SHA-256 implementation is unchanged. Read results still derive byte length
from retrieved bytes, and metadata cannot replace those bytes or their digest.
Evidence-service repairs remain owned by SERIOUS-B4.

Compatibility: valid-version method signatures and command inputs are unchanged;
invalid/mutable versions and returned mismatches now refuse. Upload signing
creates a new object and therefore requires no existing version.
The independent reviewer must assess this source inspection separately.

## STOPs and exact prerequisites

1. **Coordinator-owned lane registration — `config/lanes/later-b4.json:1`.**
   Before: file absent (also no `later-b4` entry in the legacy registry).
   Proposed after, left entirely unapplied:

   ```json
   {"version":2,"lanes":{"later-b4":{"branches":["codex/sandbox/later-b4"],"receipt":"docs/verdicts/LATER-B4/BUILDER_RECEIPT.md","allow":["packages/storage/src/index.ts","packages/storage/src/later-storage-contract.test.ts","docs/verdicts/LATER-B4/BUILDER_RECEIPT.md","docs/ledger/LATER-B4.md"]}}}
   ```

   The issued allow list omits the lane file; no registration or pinned list was edited.

2. **Lane check self-comparison — `tools/agent-lane-boundary-lint.mjs:303`.**
   Command: `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`.
   Exit 1: `Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.`
   HEAD equals main because this task must remain uncommitted.
   Before and after line 303 are identical:
   `if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");`
   No override, fabricated comparison or alternate lane command was attempted.
   The dispatcher must register the lane and run the check on its eventual commit.

3. **OpenAPI command — `apps/api/package.json:72`.**
   Command: `pnpm openapi:check` with prefix P below. Exit 1.
   Refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/17739.pipe`.
   The tsx runner failed before OpenAPI validation. No alternate invocation or permission
   escalation was attempted. Existing script is unchanged; dispatcher/CI must run it.

4. **Process inspection stopped.**
   Exact command: `ps -axo pid,ppid,etime,command | rg 'pnpm|vitest' | head -25`.
   Refusal: `zsh:1: operation not permitted: ps`.
   No alternate process-inspection method was attempted.

Turbo printed `WARNING IO error: Operation not permitted (os error 1)` around cache
I/O, while each forced task completed successfully. No alternate cache destination
or permission escalation was used. Next build reported workspace-root detection,
CSS autoprefixer/cache serialization, Nest file-type export and load-esm dependency
warnings; build still exited 0. These are recorded observations, not reviewed repairs.

## NOT RUN / unavailable evidence

| Check or files | Status and reason |
|---|---|
| `pnpm test` | NOT RUN — whole suites reserved for dispatcher/CI; only this piece's file authorized locally. |
| `pnpm test:db` | NOT RUN — cannot start PostgreSQL here; no database change or new database test in this lane. |
| `pnpm test:migrations` | NOT RUN — cannot start PostgreSQL here; no migration in this lane. |
| `pnpm test:e2e`, Playwright/browser suites | NOT RUN — explicitly CI only; browsers and socket listeners prohibited here. |
| Live S3/MinIO | NOT RUN — live storage, credentials, provider changes and real data prohibited. |
| `packages/storage/src/index.test.ts` and existing evidence regressions | NOT RUN — merged suites reserved for CI; original file retained byte-for-byte. |
| `pnpm lint:lanes` alias | NOT RUN separately — identical shared lane checker already refused; no alternate route to its effect. |
| OpenAPI document validation | NOT RUN — command attempted, exit 1 at tsx IPC listen before validation. |
| Clean install | NOT RUN — dependencies supplied; downloads prohibited. |
| AI evaluation / native suite | Inapplicable — no AI, schema/extraction policy, mobile or native change. |

No database/browser test or live provider evidence is claimed. No `heavy-slot`
run was required: the sole local test file is a socket-free unit/adapter contract test.
Every heavy command was preceded by memory/disk checks: 78% free memory and
35 GiB reported available disk, above the issued 35% and 33 GiB floors.
Build and tests ran sequentially, never together.

## Check summary

| Command | Exit | Executed results |
|---|---:|---|
| Own Vitest file, before fix | 1 | 10 failed / 20 passed, twice |
| Own Vitest file, after fix | 0 | 30 passed |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0 | 7/7 tasks, 0 cached |
| `pnpm exec turbo run lint --force --concurrency=2` | 0 | 7/7 tasks, 0 cached |
| `pnpm build --force --concurrency=2` | 0 | 7/7 tasks, 0 cached |
| Lane checker | 1 | Refused self-comparison |
| `git diff --check` | 0 | No tracked whitespace errors |
| `pnpm openapi:check` | 1 | Blocked before validation by IPC EPERM |

All three root checks used **--force**, once each; no cache-hit pass is claimed.

## Scope hashes and diff evidence

SHA-256 values:

| File | Before | After |
|---|---|---|
| packages/storage/src/index.ts | `33ae20a754e07772f7035d8aec5356f5e0b63f5fa29e84c74528318edd889c85` | `d66984c2b6e255ac82376aa1f0faf929bdd073094cc45b0f8d3b8b50096f3081` |
| packages/storage/src/index.test.ts | `c0af37a5284330cc205bfe36f2fb4baef6a490726049542b3729688ae847aff6` | Same |
| config/agent-lane-assignments.json | `99fcda4daff974e76a96095f6bfaa0be8745ecfc96fbdacbf67e27052df8eb4e` | Same |
| tools/agent-lane-boundary-lint.mjs | `8903cfb2ce110bfa8f5d7f0bef33b5c629a32f9a2ca2f613cfaef2a823119e45` | Same |
| packages/storage/src/later-storage-contract.test.ts | Absent | `942af79047e7ca9c174088bcd9b2461426a984fd2d91cc50061d34af6429b714` |
| docs/ledger/LATER-B4.md | Absent | `2a5db9dea41c52294098c713925e9ec688c6a0b68aa2f01eaeebe9caacc178f0` |

`git diff --stat` (tracked changes; new files remain untracked):

```text
 packages/storage/src/index.ts | 16 +++++++++++-----
 1 file changed, 11 insertions(+), 5 deletions(-)
```

The final tracked diff and untracked-file listing show exactly these four paths:
`packages/storage/src/index.ts`,
`packages/storage/src/later-storage-contract.test.ts`,
`docs/ledger/LATER-B4.md`,
`docs/verdicts/LATER-B4/BUILDER_RECEIPT.md`.
Receipt self-hashing would be recursive and is not claimed.
Intended commit message is written separately to `/private/tmp/jg-msg-later-b4.txt`.
No Git write, commit or push was performed.

## Complete shell-command inventory

P denotes the exact shell prefix below; it selects the preinstalled pinned
executable after the required pnpm path export. Test/process polling used
`write_stdin` with empty input; those calls only collected the corresponding
command's eventual exit/result. The first stalled run was interrupted with Ctrl-C.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="$HOME/Library/pnpm/store/v11/links/@pnpm/macos-arm64/10.28.1/6adbece7fcd33fcfc0543fbc54147847898d5c988debc7796a9f48f7b526903c/node_modules/@pnpm/macos-arm64:$PATH";
```

### Initial inspection

```sh
pwd && git status --short && git rev-parse HEAD && git rev-parse origin/main && cat AGENTS.md
```

Exit 0. Clean working tree; HEAD and main identical.

### Inspection A1

```sh
rg --files -g AGENTS.md -g '*storage*' -g '*later-b4*' -g '*openapi*' -g '*vitest*' -g '*package.json' -g '*turbo*' -g '!pnpm-lock.yaml'
```

Exit 0. Read-only inspection.

### Inspection A2

```sh
cat packages/storage/src/index.ts packages/storage/src/index.test.ts packages/storage/package.json config/lanes/later-b4.json package.json turbo.json
```

Exit 1. Specified lane file absent.

### Inspection A3

```sh
rg -n 'M0-11|versioned S3|immutable object|SHA-256|two-phase|storage' BUILD_PLAN.md docs/contracts docs/repo-baseline.md && cat /Users/benharwood/.local/share/full-steam/handoffs/jobguard-task.md
```

Exit 0. Read-only inspection.

### Inspection A4

```sh
git branch --show-current && git diff --stat origin/main && git show origin/main:packages/storage/src/index.ts && memory_pressure | tail -1 && df -g /System/Volumes/Data && node --version
```

Exit 0. Read-only inspection.

### Inspection B1

```sh
sed -n '280,310p' BUILD_PLAN.md && sed -n '360,378p' BUILD_PLAN.md && cat docs/operations/evidence-storage.md && cat packages/storage/tsconfig.json && cat apps/api/package.json
```

Exit 0. Read-only inspection.

### Inspection B2

```sh
sed -n '1,220p' tools/agent-lane-boundary-lint.mjs && rg -n 'later-b4|LATER-B4|pkg-storage-84|L044|L045|L046' config docs/ledger docs/verdicts && rg -n 'readExactVersion|sha256\(' apps/api/src/evidence packages/storage && cat /Users/benharwood/.local/share/full-steam/handoffs/COMMON.md
```

Exit 1. No LATER-B4 registration matched; later && clauses did not run.

### Inspection C1

```sh
rg -n 'readExactVersion|sha256\(' apps/api/src/evidence packages/storage
```

Exit 2. apps/api/src/evidence is absent; actual service later located in packages/db/src/evidence.ts.

### Inspection C2

```sh
cat /Users/benharwood/.local/share/full-steam/handoffs/COMMON.md
```

Exit 0. Read-only inspection.

### Inspection C3

```sh
rg -n 'sandbox|later|storage' config/agent-lane-assignments.json && rg --files config/lanes | head -10 && sed -n '1,120p' tools/lint.mjs && cat apps/api/src/generate-openapi.ts && cat tsconfig.json
```

Exit 0. Read-only inspection.

### Inspection C4

```sh
git show origin/main:packages/storage/src/index.test.ts && git show origin/main:BUILD_PLAN.md | sed -n '369,375p' && shasum -a 256 packages/storage/src/index.ts packages/storage/src/index.test.ts config/agent-lane-assignments.json tools/agent-lane-boundary-lint.mjs
```

Exit 0. Read-only inspection.

### Inspection D1

```sh
rg -n 'readExactVersion|sha256\(' apps/api/src/*evidence* packages/db/src/evidence*
```

Exit 0. Read-only source inspection.

### Inspection D2

```sh
rg -n 'LATER-B4|later-b4' config/agent-lane-assignments.json config/lanes; ls -l node_modules/.bin/pnpm /Users/benharwood/Library/pnpm/bin/pnpm; sed -n '1,100p' /Users/benharwood/Library/pnpm/bin/pnpm
```

Exit 0. No lane match; missing local pnpm shim, final sed succeeded.

### Launcher inspection

```sh
ps -axo pid,ppid,etime,command | rg 'pnpm|vitest' | head -25; ls -la /Users/benharwood/Library/pnpm/.tools/pnpm /Users/benharwood/Library/pnpm/.tools/@pnpm+linux-x64 /Users/benharwood/Library/Caches/node/corepack/v1/pnpm node_modules/.bin/vitest packages/storage/node_modules/.bin/vitest; cat .npmrc
```

Exit 1. ps refused (operation not permitted); process inspection stopped. Listed optional package-manager paths and .npmrc were absent.

### Launcher files

```sh
cat packages/storage/node_modules/.bin/vitest; ls -l node_modules/.bin/turbo; rg --files /Users/benharwood/Library/pnpm | rg '/10\.28\.1/|/pnpm\.cjs$' | head -15
```

Exit 0. Located preinstalled pinned pnpm 10.28.1 executable.

### Initial test launcher

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/storage exec vitest run src/later-storage-contract.test.ts --maxWorkers=2
```

Exit 130. Stalled before Vitest; interrupted with Ctrl-C. Zero test results.

### First failing run

```sh
P memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --version; pnpm --filter @jobguard/storage exec vitest run src/later-storage-contract.test.ts --maxWorkers=2
```

Exit 1. 30 tests: 10 failed, 20 passed. pnpm --version printed 10.28.1.

### Strengthened failing fixture

```sh
P memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/storage exec vitest run src/later-storage-contract.test.ts --maxWorkers=2
```

Exit 1. Before the source edit, repeated red run with bytes on the mismatched HEAD/GET fixture: 10 failed, 20 passed. This proves wrong-version bytes were previously accepted.

### After fix

```sh
P memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/storage exec vitest run src/later-storage-contract.test.ts --maxWorkers=2
```

Exit 0. 30 tests passed; 1 test file.

### Forced typecheck

```sh
P memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm exec turbo run typecheck --force --concurrency=2
```

Exit 0. 7/7 tasks successful; 0 cached; 19.312 seconds.

### Forced lint

```sh
P memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm exec turbo run lint --force --concurrency=2
```

Exit 0. 7/7 tasks successful; 0 cached; 18.387 seconds.

### Forced build

```sh
P memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm build --force --concurrency=2
```

Exit 0. 7/7 tasks successful; 0 cached; 53.618 seconds; 41 static pages generated.

### Lane validation

```sh
LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs
```

Exit 1. Refused self-comparison; no lane pass claimed.

### Whitespace

```sh
git diff --check
```

Exit 0. No whitespace errors in tracked diff.

### OpenAPI

```sh
P memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm openapi:check
```

Exit 1. Blocked by tsx IPC listen EPERM before document validation.

### Evidence 1

```sh
rg -n 'Missing branch or self-comparison|selectLane\(' tools/agent-lane-boundary-lint.mjs; git diff -- packages/storage/src/index.ts; git status --short; git diff --stat; git rev-parse HEAD; git rev-parse origin/main
```

Exit 0. One tracked file changed; two new files before receipt creation.

### Evidence 2

```sh
shasum -a 256 packages/storage/src/index.ts packages/storage/src/index.test.ts packages/storage/src/later-storage-contract.test.ts docs/ledger/LATER-B4.md config/agent-lane-assignments.json tools/agent-lane-boundary-lint.mjs; ls -l /private/tmp/jg-msg-later-b4.txt
```

Exit 1. Hashes recorded; intended-message file was absent before creation.

### Final scope verification

```sh
rg -n '"openapi:check"' apps/api/package.json; git diff --check; git status --short; git diff --stat; git ls-files --others --exclude-standard; shasum -a 256 packages/storage/src/index.ts packages/storage/src/index.test.ts packages/storage/src/later-storage-contract.test.ts docs/ledger/LATER-B4.md config/agent-lane-assignments.json tools/agent-lane-boundary-lint.mjs; git rev-parse HEAD; df -g /System/Volumes/Data; cat /private/tmp/jg-msg-later-b4.txt
```

Exit 0. The tracked diff contains one source file
(11 insertions, 5 replaced lines); the untracked-file listing contains exactly
three authorized additions. All six recorded hashes match. Final disk: 35 GiB
available. Final HEAD: `7ff452eeec1c523345d34715adfa3f8310062013`.
The script location is `apps/api/package.json:72`; its before and after remain
`"openapi:check": "tsx src/generate-openapi.ts --check",`.
The receipt was then updated only to record this result and correct that citation.



