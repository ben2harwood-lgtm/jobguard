Built by Codex; dispatched 13 Oct 2026; queue header issued 16 Oct 2026.

# LATER-B2 — Compare independent demo seed runs

L088, alias `dbsrc-04#6`; GREEN; test-only; partial verification, no acceptance.
The requested Claude attribution was not used because it would misidentify the builder.

## Base, scope and authority

- Branch: `codex/sandbox/later-b2`; clean initial working tree.
- Initial and final HEAD: `7ff452eeec1c523345d34715adfa3f8310062013`.
  No commit, staging, push, checkout, branch change or remote action performed.
- Local `origin/main` equals HEAD and supersedes the header's
  `ca435eeb5791638c787c830d6ba717146f694539` and draft's `0bbb5ddb`.
  Main wins. BUILD_PLAN.md C6:119 and M1-15:393 still contain the cited requirements;
  inventory heading is at line 360. `demo-seed.test.ts:6` still creates the shared map.
- Only the new test, this receipt and `docs/ledger/LATER-B2.md` are deliverables.
- No migration, schema, route, authorization, money policy, AI, UI or provider change.
  New GRANTs: none. Standard F: no application-login write grant added; no database
  writes or checked routines are introduced. No upgrade proof applies.

## Implementation and acceptance evidence

`packages/db/src/demo-seed.determinism.test.ts` adds two tests, with task/item and
acceptance IDs in the titles:

1. AC1/AC3: `independent seed invocations produce identical command streams`.
   Each invocation gets a fresh boundary and array; every command is cloned at
   receipt. Nonempty, distinct streams compare complete envelopes with strict
   ordered equality: identities, semantic keys, amounts and source references.
   Checkpoint ordering is compared to the existing exported checkpoint list.
2. AC2: `determinism proof detects a changed second-run identity`.
   A controlled generator calls the real seed twice, changing only the second
   invocation's first command ID with `randomUUID()`. It verifies two invocations
   and that all other fields/order match, then requires the same comparison to reject.

Tests were written before the intentional failing run. The initial collection
failure was missing library build output, not a test assertion or seed defect.
After compiling existing prerequisites, the unwrapped negative control failed
on exactly that command ID: one test passed, one failed. The permanent control
then asserted that rejection: two passed. No production seed fix was needed.
No frozen fixture total or existing assertion was rewritten. Preservation is
evidenced below rather than by a permanent test freezing another file.

## Toolchain and execution conditions

- Node `v24.17.0` installed; `.nvmrc` requests `24.15.0` (environment deviation).
- pnpm `10.28.1`, Vitest `4.1.11`, Turbo `2.10.12` from existing local files.
- The default pnpm executable stalled during version selection on three attempts;
  they were interrupted with exit 130. A previously cached pinned CLI was found at
  `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`.
  A task-owned wrapper in `/private/tmp/jg-later-b2-local-bin/pnpm` invokes it.
  No package install/download or lockfile modification occurred. No missing package
  dependency was identified; initial missing `dist` outputs were generated locally.
- Each completed pnpm check below starts with:

  ```sh
  export PATH="$HOME/Library/pnpm/bin:$PATH"
  export PATH="/private/tmp/jg-later-b2-local-bin:$PATH"
  ```

- Before heavy runs: `memory_pressure | tail -1` reported 77% free (78% finally);
  `df -g /System/Volumes/Data` reported 38 GB initially, then 37 GB available.
  Above both required limits. Tests and builds ran separately; at most two workers.
  This unit suite starts neither PostgreSQL nor a browser and needs no heavy-slot.
- Turbo emitted `WARNING  IO error: Operation not permitted (os error 1)` during
  cache I/O; completed checks still executed with `--force`, zero cache hits.
  No permission change or cache-write retry was attempted.

## Executed checks

| Command (after the PATH preamble where applicable) | Exit | Result/counts |
| --- | --- | --- |
| `pnpm --filter @jobguard/db exec vitest run src/demo-seed.determinism.test.ts --maxWorkers=2` — first attempt | 1 | 1 suite failed collection; 0 tests; missing `@jobguard/core` build output |
| `pnpm exec turbo run build --filter=@jobguard/core --filter=@jobguard/storage --filter=@jobguard/config --force --concurrency=2` | 0 | Required existing prerequisites compiled; 3 tasks, 0 cached |
| Same exact Vitest command — intentional negative control | 1 | 1 passed, 1 failed; full comparison rejected changed second-run command ID |
| Same exact Vitest command — final control expects rejection | 0 | 1 file, 2 tests passed |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0 | 7 tasks successful, 0 cached |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force --concurrency=2` | 0 | 7 package tasks successful, 0 cached; root lane wrapper is separate |
| `pnpm build --force --concurrency=2` | 0 | 7 tasks successful, 0 cached; 1m27.696s |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1 | Self-comparison refused; stopped, no alternate base or guard edit |
| `git diff --check` | 0 | No whitespace errors |
| `node tools/core-purity-lint.mjs` | 0 | 192 TypeScript files checked |
| `node tools/money-arithmetic-lint.mjs` | 0 | Boundary check passed |
| `node tools/commercial-boundary-lint.mjs` | 0 | No violations/output |
| `pnpm --filter @jobguard/api exec node dist/generate-openapi.js --check` | 1 | Compiled-generator comparison reports stale OpenAPI; this is not the source-based gate |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Actual source-based OpenAPI comparison passed; loader invocation avoids the tsx CLI IPC listener |

The compiled-generator failure is retained above, not described as a baseline
defect: compiled and source execution differ. The source-based check matches the
repository script's source input and passed. No OpenAPI file was regenerated.
Next's successful build also reported existing workspace-root/lockfile, CSS
autoprefixer, file-type export and dynamic dependency/cache serialization warnings;
none is changed in this lane.

## STOP items and coordinator handoff

1. `config/lanes/later-b2.json:1`: **before:** file absent, branch unregistered.
   **Requested after, coordinator only:** a version-2 `later-b2` lane for exactly
   `codex/sandbox/later-b2`, allowing the new test, this receipt and the ledger,
   with a note that no web workflow changes. No registry edit was made.
2. `tools/agent-lane-boundary-lint.mjs:303`: **before and after, unchanged:**

   ```js
   if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");
   ```

   HEAD equals `origin/main` because the dispatcher owns Git writes. No test/check
   edit is proposed. After the dispatcher creates the task commit and supplies
   registration, rerun against main. Do not weaken the check or substitute a base.
3. Diagnostic `ps -axo pid,ppid,command | rg 'pnpm --version|pnpm.cjs|@pnpm/exe/pnpm'`
   was refused with `zsh:1: operation not permitted: ps`. Process inspection stopped;
   no alternate inspection was attempted. The command block ended 0 because later
   file reads succeeded; the refused subcommand's exit was not separately captured.

## NOT RUN

- `pnpm test`: whole-suite fan-out prohibited by the order; CI owns it.
- `pnpm test:db` and `pnpm test:migrations`: no migration or DB behavior change;
  full suites prohibited, PostgreSQL/socket execution unavailable here. CI owns them.
- `pnpm test:e2e`, Playwright, browser/device journeys: explicitly CI only;
  no web/native workflow change. No browser or listening service was started.
- No database/browser test file was added; the new file is an in-memory command
  generation unit test, not a PostgreSQL or live-provider integration.
- `pnpm eval`: no model, prompt, parser, schema or matching-policy change.
- `pnpm lint:lanes`: aliases the exact node command already refused above; not
  rerun after that refusal. No substitute base was used. Full `pnpm lint` was not
  repeated: mandated forced package lint ran once; independent root static checks
  ran separately and the lane refusal is recorded, so root lint is not claimed green.
- Literal `pnpm openapi:check`: the tsx CLI uses an IPC listener; source generation
  was checked with the same installed tsx loader through Node as recorded above.
- Fresh install: not rerun; dependencies were supplied and downloads prohibited.
- Independent model verdict and separate technical acceptance: not performed by
  this builder; required on the dispatcher-created exact commit before acceptance.

## Preservation evidence and builder source inspection

SHA-256 of unchanged files (also checked against `origin/main`):

```text
6c4672e75c0af70accee37c05fbd95e2922ac00c9dc74bfa156721788b224da0  packages/db/src/demo-seed.ts
37f0a4c09cdd7d7876bb6497ee00f6ed054d1da0289a6e8ec52fb0682a96380a  packages/db/src/demo-seed.test.ts
06b501e413424d77fc5c3a1ac0f481b7230c271e36bfbde2cb953385ccccd349  pnpm-lock.yaml
```

`git diff --stat` produced no output: all three deliverables are new, untracked
files, and no tracked file changed. `git status --short`:

```text
?? docs/ledger/LATER-B2.md
?? docs/verdicts/LATER-B2/
?? packages/db/src/demo-seed.determinism.test.ts
```

Read-only `git diff --no-index --stat /dev/null <path>` confirmed 52 insertions
in the test and 21 in the ledger (each command exits 1 because the file differs
from the empty input). No staging was used to manufacture a tracked diff.
An ephemeral Python comparison read each of the three preserved files and
`git show origin/main:<path>`: all three byte comparisons and hashes matched,
exit 0. This is receipt evidence, not a new permanent test.

New implementation/ledger SHA-256:

```text
cada3ce744e8921092e607d31be3f7c7e792ca17425e5717086d5cb65bea16f4  packages/db/src/demo-seed.determinism.test.ts
7310ae59ada5436296fefebecb05a5efc73702bf27f91a4f3252a7bc1b046054  docs/ledger/LATER-B2.md
```

Builder source inspection: the recorder never deduplicates/replays commands and
snapshots values on receipt, so reused persistence results cannot mask the second
invocation. The negative intervention is confined to the test generator; it
demonstrates comparison sensitivity, not an actual production seed defect.
No shared harness, merged test, pinned list, policy or expected value was changed.
No new runtime effect, migration, operational alert or compatibility impact.
Source inspection and local test execution are recorded separately from independent
verification. Remaining gates: lane registration/check, dispatcher CI, independent
verdict and separate acceptance. No claim of release readiness.

## Inspection and preparation command log

These read-only blocks ran before the checks above; numbers are aggregate shell
exit codes, not test counts. Missing paths are observations, never permission
exceptions. Repeated resource/status inspection and tool-output polling are
recorded above with the commands they accompanied; they executed no extra tests.

| Command/block | Exit and observation |
| --- | --- |
| `pwd; git status --short; git branch --show-current; git rev-parse HEAD origin/main; rg --files -g AGENTS.md -g BUILD_PLAN.md -g package.json -g '*demo-seed*' -g '*later-b2*' -g '*lock*' -g '.nvmrc'` | 0; correct clean worktree/branch, matching refs |
| `cat AGENTS.md` | 0; engineering invariants read |
| `rg -n 'C6\|M1-15\|7\.2\|demo\|L088\|dbsrc-04' BUILD_PLAN.md; cat config/lanes/later-b2.json; cat packages/db/src/demo-seed.test.ts; cat packages/db/src/demo-seed.ts` | 0 aggregate; missing lane reported by cat |
| `cat package.json packages/db/package.json .nvmrc; cat packages/db/src/demo-seed-cli.ts; cat tools/agent-lane-boundary-lint.mjs; cat ~/.local/share/full-steam/handoffs/jobguard-task.md` | 0 |
| `cat packages/db/src/demo-seed.test.ts packages/db/src/demo-seed.ts` | 0; full seed inspected separately after batched output truncation |
| `sed -n '105,125p' BUILD_PLAN.md; sed -n '375,405p' BUILD_PLAN.md; sed -n '215,350p' AGENTS.md; cat config/lanes/later-b2.json` | 1; final cat confirms missing lane |
| `cat package.json packages/db/package.json .nvmrc; rg -n 'openapi\|lint:lanes' package.json apps/api/package.json; rg --files packages/db -g '*vitest*'; node --version; export PATH="$HOME/Library/pnpm/bin:$PATH"` followed by `pnpm --version` | 130 after interruption; subsequent pnpm/resource commands in this block never completed |
| `git show origin/main:packages/db/src/demo-seed.test.ts; git show origin/main:BUILD_PLAN.md \| sed -n '115,121p;389,396p'; rg --files docs/ledger docs/verdicts \| head -20` | 0 |
| `cat packages/db/vitest.config.ts; cat turbo.json; rg -n 'later-b2\|LATER-B2' config; ls -l "$HOME/Library/pnpm/bin" node_modules/.bin/pnpm node_modules/.bin/vitest; sed -n '1,160p' tools/lint.mjs; sed -n '1,70p' docs/ledger/SERIOUS-B4.md` | 0 aggregate; no registration found, root bin paths absent |
| `memory_pressure \| tail -1; df -g /System/Volumes/Data; cat "$HOME/Library/pnpm/bin/pnpm"; ls node_modules/.bin packages/db/node_modules/.bin; rg -n '"later\|later-b' config/agent-lane-assignments.json; sed -n '30,105p' BUILD_PLAN.md` | 0 aggregate; resources sufficient, no legacy lane |
| `ps -axo pid,ppid,command \| rg 'pnpm --version\|pnpm.cjs\|@pnpm/exe/pnpm'; ls "$HOME/Library/pnpm/.tools/pnpm"; cat .npmrc pnpm-workspace.yaml; sed -n '1,100p' tools/agent-lane-boundary-lint.mjs; cat packages/db/tsconfig.json` | 0 aggregate; ps refused (stopped), .npmrc absent |
| `command -v -a pnpm; ls "$HOME/Library/Caches/node/corepack" "$HOME/Library/pnpm/.tools" /private/tmp \| head -60` | 0 aggregate; zsh rejected the command syntax, first cache path absent |
| PATH preamble, then `CI=1 npm_config_offline=true pnpm --version` | 130; stalled executable interrupted |
| `which -a pnpm; ls /opt/homebrew/bin/pnpm /usr/local/bin/pnpm; ls node_modules/.pnpm \| rg '^pnpm@\|^@pnpm\|^vitest@\|^turbo@'` | 0 aggregate; no second launcher or pnpm package |
| First PATH export, then `pnpm --manage-package-manager-versions=false --version` | 130; stalled executable interrupted |
| `file "$HOME/Library/pnpm/global/v11/15f13-19ef2fdabb2/node_modules/@pnpm/exe/pnpm"; ls "$HOME/Library/pnpm/global/v11/15f13-19ef2fdabb2/node_modules/@pnpm/exe"; ls /private/tmp \| rg 'pnpm\|later-b2'; cat node_modules/.modules.yaml \| head -25` | 0 |
| `ls "$HOME/Library/pnpm/global/v11/15f13-19ef2fdabb2/node_modules/@pnpm/exe/dist"; cat /private/tmp/jg-later-b28-bin/pnpm /private/tmp/jg-later-b20-bin/pnpm; rg -n 'pnpm\|launcher\|version\|wrapper' docs/verdicts/LATER-B28/BUILDER_RECEIPT.md docs/verdicts/LATER-B20/BUILDER_RECEIPT.md` | 2; existing temporary wrappers revealed cached pinned CLI, unrelated receipts absent |
| `node "$HOME/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs" --version` | 0; 10.28.1 |
| `mkdir -p /private/tmp/jg-later-b2-local-bin`; heredoc writes a task-owned `pnpm` wrapper invoking the cached CLI; `chmod +x /private/tmp/jg-later-b2-local-bin/pnpm`; resource probes | 0; no repo configuration changed |
| `cat packages/core/package.json packages/storage/package.json packages/config/package.json; memory_pressure \| tail -1; df -g /System/Volumes/Data` | 0; confirmed compile prerequisites |
| `shasum -a 256 packages/db/src/demo-seed.ts packages/db/src/demo-seed.test.ts pnpm-lock.yaml; nl -ba tools/agent-lane-boundary-lint.mjs \| sed -n '322,345p'; rg -n 'self-comparison\|selectLane\|Missing branch\|M1-15 \(technical\|C6 —\|7.2 Inventory' tools/agent-lane-boundary-lint.mjs BUILD_PLAN.md; ls -d docs/verdicts/LATER-B2 docs/ledger/LATER-B2.md` | 1; preserved hashes recorded, new receipt/ledger absent before creation |
| `sed -n '1,180p' apps/api/src/generate-openapi.ts; sed -n '109,130p' tools/agent-lane-boundary-lint.mjs; cat config/lanes/later-b3.json; ls apps/api/node_modules/tsx; ls /private/tmp/jg-msg-later-b2.txt` | 1; optional lane example and intended message did not yet exist |

File mutations used `apply_patch` only for the three allowed new files (successful).
Temporary wrapper/message creation is outside the repository and authorized by
the order. No Git write command was used. The intended conventional commit is
written to `/private/tmp/jg-msg-later-b2.txt`; the dispatcher owns committing.
Final inspection repeated `git diff --check`, `git diff --stat`, `git status --short`
and `git rev-parse HEAD`, then ran `shasum -a 256` on the test and ledger, searched
the deliverables with `rg -n 'Pending|TODO|MIGNUM|AC[123]|STOP|NOT RUN'`, read the
intended message with `cat`, and used Python to check terminal newlines and trailing
whitespace on all three deliverables: block exit 0, no unresolved placeholder,
same HEAD and only the three allowed new files. The final documentation update
was followed by another `git diff --check` and three-file whitespace validation,
exit 0. No code or checks changed after the two-test passing run.
