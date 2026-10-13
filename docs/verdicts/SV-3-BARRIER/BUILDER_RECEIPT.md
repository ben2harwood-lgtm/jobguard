Built by Codex (GPT-6); dispatched 13 Oct 2026.

# SV-3-BARRIER builder receipt — AMBER

This records a build and partial local verification, not acceptance or an independent verdict. The requested Claude/Codex-unavailable attribution would be inaccurate in this session; actual builder attribution is recorded above.

## Base, scope and implementation

Issued base, origin/main and final HEAD: `269874640468a6e1dfdfed63edd4ce187d1d9dbb`. Branch: `codex/sandbox/sv-3-barrier`. No commit, staging, push, checkout or package installation was performed. Intended commit text: `/private/tmp/jg-msg-sv-3-barrier.txt`.

Read AGENTS.md, BUILD_PLAN.md §§2.1–2.5, SV-3 (§10 task card), §§12.1–12.2 and the supplied dispatch header/addendum before implementation. Main wins over the draft inspected at ec6ad4d. Every cited source location was checked in the current checkout, which starts exactly at the issued main SHA:

- watchdog-panel.tsx:12–25, fetch :17 and interval :24: current.
- purchase-order.tsx:42–63, fetches :45–46, empty requirement condition :60, interval :61: current.
- things-to-check.tsx:1 and readiness.tsx:1: both poll every 1500 ms, current.
- materials.tsx:1: initial read; repeating materials request is in PurchaseOrder.
- workspace-shell.tsx:73,75: clients mount together, current.
- materials-command.ts:16 and :19–29: command state and reads do not stop interval scheduling. Main has additional later lines; no change here.
- Original SV-3.spec.ts:37–38, :109–114, :120–134, :139–147, :149–152: current. After additions these locations move; Q installs the registry at :98 and stops/drains at :211 before goto :214.

Only the authorized spec, this receipt and the self-service lane registration changed. No product code or separate helper changed. Shared ownership: the coordinator authorized this exact merged spec; the lane registry addition is one new row and must serialize with other lane additions. No BUILD_PLAN ledger amendment is needed for a migration-free repair.

The init script registers intervals separately in every document. Stopping sets a permanent flag for the departing document, clears its intervals, suppresses callbacks already queued and refuses later registrations there. The wrapper preserves callback arguments, receiver and string handlers. Returning zero for a refused registration schedules no timer. Existing fetches are untouched. Q then awaits its unchanged drain and navigates. A destination gets the init script again with a fresh registry.

All 187 original spec lines remain in their original order. Diff has no deleted or replaced lines. Every original assertion, zero-versus-25 comparison, response/body read and genuine-failure handler remains unchanged. The original URL exception at main :111–113 is retained (now :172–174): the draft conditions removal on browser verification, which is NOT RUN. No new exception was added.

## Tests first and results

Added four Playwright controls in the authorized spec before implementing the barrier: SV-3-BARRIER-1 (await outstanding drain), -2 (stop and refuse late registrations), -3 (fresh destination registry), -4 (preserve original drain error). Browser execution is NOT RUN as ordered.

A temporary Node VM harness extracts the two actual TypeScript function declarations and runs them against fake native timers and a fake Page evaluation boundary. It does not pin source bytes and is not a repository-wide test. Path: `/private/tmp/jg-sv3-barrier-controls.mjs`; SHA-256: `aa817c9e446c0a15d7126655ce027bc371ff6df8b3e3004e79ad4626e224835d`.

- First run, before implementation: exit 1, 4 tests, 0 passed, 4 failed because the interval registry did not exist.
- First run after implementation: exit 1, 4 tests, 3 passed, 1 failed. The temporary harness assumed two microtasks were enough for a cross-VM continuation. Replaced that harness assumption with one event-loop turn; the spec already uses expect.poll.
- Final run: exit 0, 4 tests, 4 passed, 0 failed. Checks await ordering, fetch preservation, clearing every interval, a queued callback after stop, late registrations, repeated stop, callback arguments/receiver, clearing, fresh document state and exact error identity.

These are deterministic fake-window checks, not browser/network verification. The permanent browser controls use blank data documents and do not fulfill JobGuard APIs. Control -4 injects errors at drain, not actual network failures; genuine transport/body failure injection remains follow-up.

`git diff --check`: exit 0. Hash/source preservation checks: exit 0. No package suite was run.

## STOPs and checks NOT RUN

1. Pnpm startup refused the pinned release. Exact initial command: `pnpm --version` (with the mandated PATH prefix on the explicit later probe); exit 1. Refusal:

   `[ERROR] Refusing to run pnpm@10.28.1: its npm registry signature could not be verified (@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed). The bytes selected by this project's lockfile/registry do not match a published, signed pnpm release.`

   Two diagnostic probes had already been started before that refusal arrived; both also exited 1 with the same refusal. No ignore flag, alternate launcher, dependency download or direct compiler/build workaround followed the refusal. Pin: package.json:5, before and after both `"packageManager": "pnpm@10.28.1",`. Coordinator/dispatcher must provide the verified pinned toolchain or run checks in CI.

   NOT RUN: `pnpm exec turbo run typecheck --force`, `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force`, `pnpm build --concurrency=2 --force`, `pnpm lint:lanes`, `pnpm openapi:check`, root lint wrapper. No cache-hit result is claimed. These commands were not launched after the startup refusal. Node observed: v24.17.0; .nvmrc: 24.15.0. A clean pinned install was not performed; dependencies were supplied and downloads forbidden.

2. `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`: exit 1, `Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.` Existing check at tools/agent-lane-boundary-lint.mjs:212, before and after unchanged:

   `if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");`

   HEAD equals origin/main because this builder must not commit. The dispatcher must commit the authorized diff and re-run lane checking against main. No change to this check is proposed or made.

3. Process diagnostic only: `ps -axo pid,etime,command | rg 'pnpm --version|pnpm --manage'`: shell exit 1; exact refusal `zsh:1: operation not permitted: ps`. Stopped this diagnostic; no alternate process-inspection route used. No code change depends on it.

NOT RUN: apps/web/e2e/SV-3.spec.ts in mobile-360 and desktop (browser cannot run in this sandbox; expressly reserved for CI); five real polling-route delay checks; actual transport/body failure injections; 100-run stress verification; full mandatory CI. PostgreSQL, migrations, eval and unrelated package/unit suites were not run: no database, AI or product code changed and only owned tests are allowed locally. No migration, no new GRANT (standard F: no direct write grants to the application login), no new route or watchdog registration. No operational alert, commercial policy, retention, money, authorization or tenant isolation change.

## Reviewer / dispatcher follow-up — NOT EXECUTED

1. On the committed head, use the verified pinned install and run uncached typecheck/lint/build, root lint, lane checking with origin/main, OpenAPI and mandatory CI.
2. Through heavy-slot, delay each actual GET /api/jobs/<id>, /materials, /purchase-orders, /things-to-check and /readiness in turn without substituting success responses. Verify navigation waits for the request and strict captured body.
3. Trigger intervals at departure and attempt registration after stop; verify no new departing poll and normal destination polling. Q's zero-versus-25 comparison stays mandatory.
4. Inject genuine transport failures and body-read failures; require the original route/error to fail Q. Review the retained exact things-to-check exception separately after browser verification.
5. Run the spec 100 times in EACH project, retries disabled, one gated run at a time:

   `~/.local/bin/heavy-slot sv-3-barrier pnpm --filter @jobguard/web test:e2e --project=mobile-360 --workers=1 --retries=0 --repeat-each=100 SV-3.spec.ts`

   Then the same command with `--project=desktop`. Check memory >=35% free and disk >45 GB first; do not combine with builds. This is a follow-up plan, not evidence of a run.

## Self-review (builder only)

Source-inspected: barrier scope is document-local; stopping is synchronous inside evaluate; drain awaits existing live request/body sets; queued callbacks and later registrations cannot restart intervals. No request abort, response suppression or new normalization was introduced. Registry installation precedes the capture helper's first navigation. New controls do not write database state. Q and I remain mandatory, unchanged in assertions.

Test-executed: four temporary deterministic controls and diff/source preservation checks only. Browser timing, real route/body drain and repeated Q equivalence are not verified. Independent model verdict and separate acceptance are pending; this receipt is not either. Technical acceptance remains partial / HELD for checks above. No Ben-level approval was inferred. No unrelated LATER implementation was added.

## Scope evidence

SHA-256 (main -> worktree):

- apps/web/e2e/SV-3.spec.ts: `649c24ad9e2d54090252f0220012d720d7ee4a6e337529df0e25d37c33a6dc11` -> `82fa29cacf47e9a8c906263e9632b7bacbbf10f1768647456f77679da01d7cde`.
- config/agent-lane-assignments.json: `a7dab22e49a8153d856a915c8be41b45a54a323e514438e8a8c846493c15c566` -> `292a8ec6ee596010e98934d179c59c7b940ba6c4db49f7ca70922927913bfb7d`.

Unchanged hashes, verified equal to main:

- capture-journey.ts: `4e079f110fba2f829797c7920458005ccfce055eac91cd88cbf19013c5424199`.
- watchdog-panel.tsx: `f2f5a6e0c2877bc2e39afa932c5782ee0a431118983010f0df6f84a283b6e46b`.
- purchase-order.tsx: `23a6a71c42ecaceb7d5cbb5c8167c3f7d7d807f2302486f70779886c7f500a22`.
- things-to-check.tsx: `69404db69b5e25148d26d5c19be30b625b60c26321ecf8fc06e183fd25c794af`.
- readiness.tsx: `d0e366a0a8f48f23eb2d809815e4af961715ac2050258b574c8af03fcf06988f`.
- materials.tsx: `df3fedc022810a232cba85c2217c7be7fabbe3da0bbbb1fc9ca0dfbf389a4f32`.
- materials-command.ts: `6ec5ec0770f416d5b048dc524220fe5ecec43664d44e52fdc2567e6be9ce8af0`.
- workspace-shell.tsx: `b55ee62263c35475ebb6ac7249847af60bc9a8b31b9a991555490d5e73501dd7`.

Before adding this untracked receipt, git diff --stat:

```text
 apps/web/e2e/SV-3.spec.ts          | 62 ++++++++++++++++++++++++++++++++++++++
 config/agent-lane-assignments.json |  1 +
 2 files changed, 63 insertions(+)
```

Receipt is untracked and therefore excluded by git diff --stat; final git status must include exactly these two modified files and docs/verdicts/SV-3-BARRIER/. Temporary controls and commit-message files are outside the repository.

## Command audit

Shell commands below are inspection, controls or stopped diagnostics; no browser/database command was attempted. Composite-command exits report the shell's last command; earlier missing-path diagnostics are disclosed. apply_patch operations added the lane, controls, and implementation successfully.

- `pwd; git status --short; git rev-parse HEAD origin/main; rg --files -g AGENTS.md -g '*lane*' -g package.json -g BUILD_PLAN.md -g '*SV-3*'`: exit 0, clean initial status and matching SHAs.
- `cat AGENTS.md; rg -n 'SV-3|shadow|side.channel|§2|2\.2|12\.|barrier' BUILD_PLAN.md`: inspection exit 0; output truncated. Targeted plan reads below completed the relevant sections.
- `cat apps/web/e2e/SV-3.spec.ts; cat apps/web/package.json; cat package.json; cat config/agent-lane-assignments.json`: inspection exit 0; output truncated.
- `cat tools/agent-lane-boundary-lint.mjs; cat tools/agent-lane-boundary.test.mjs; cat /Users/benharwood/.local/share/full-steam/handoffs/jobguard-task.md; node --version; pnpm --version; memory_pressure | tail -1; df -g /System/Volumes/Data`: output truncated; final exit not captured in the initial tool output. Node version captured. Explicit later pnpm probes exited 1; resources checked again below.
- `nl -ba apps/web/e2e/SV-3.spec.ts; cat package.json; cat apps/web/package.json; rg -n 'sv-3|SV-3|config/agent-lane' config/agent-lane-assignments.json tools/agent-lane-boundary-lint.mjs; memory_pressure | tail -1; df -g /System/Volumes/Data`: exit 0, memory 65%, disk 80 GB available; output truncated.
- `sed -n '172,210p' apps/web/e2e/SV-3.spec.ts; cat package.json; cat apps/web/package.json; sed -n '115,123p' config/agent-lane-assignments.json; sed -n '1,65p' tools/agent-lane-boundary-lint.mjs; rg -n '^### SV-3|^## 2\.|^### 2\.|^## 12|^### 12|^### 10.2.6|^### 10.2.7' BUILD_PLAN.md`: exit 0.
- `sed -n '63,133p' BUILD_PLAN.md; sed -n '1807,1845p' BUILD_PLAN.md; sed -n '3298,3318p' BUILD_PLAN.md; cat apps/web/playwright.config.ts; cat apps/web/tsconfig.json; cat tools/lint.mjs; nl -ba apps/web/app/ui/watchdog-panel.tsx | head -30; nl -ba apps/web/app/ui/purchase-order.tsx | sed -n '40,65p'; nl -ba apps/web/app/ui/workspace-shell.tsx | sed -n '65,80p'; rg -n 'setInterval|isBusy' apps/web/app/ui/things-to-check.tsx apps/web/app/ui/readiness.tsx apps/web/app/ui/materials.tsx apps/web/app/ui/materials-command.ts`: exit 0.
- `sed -n '1823,1844p' BUILD_PLAN.md; sed -n '3298,3315p' BUILD_PLAN.md; sed -n '258,310p' AGENTS.md; git branch --show-current; export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --version`: exit 1, pinned launcher refusal above.
- `command -v pnpm; ls -l /Users/benharwood/Library/pnpm/bin/pnpm; ls node_modules/.bin/turbo node_modules/.bin/tsc; sed -n '1,80p' .npmrc; cat .nvmrc`: shell exit 0; .npmrc absent, dependencies' compiler/turbo launchers present.
- `cat /Users/benharwood/Library/pnpm/bin/pnpm; cat pnpm-workspace.yaml; ls /Users/benharwood/Library/pnpm/.tools/pnpm; ls /Users/benharwood/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs`: exit 1 (last path absent); launcher points at installed @pnpm/exe. No file altered.
- With mandatory PATH prefix, `npm_config_manage_package_manager_versions=false npm_config_package_manager_strict=false pnpm --version; ls /opt/homebrew/bin/pnpm /usr/local/bin/pnpm; ls /Users/benharwood/Library/Caches/node/corepack/v1/pnpm`: exit 1, same startup refusal, listed alternate paths absent. Started before refusal arrived; no ignore setting used.
- With mandatory PATH prefix, `pnpm --manage-package-manager-versions=false --package-manager-strict=false --version`: exit 1, same refusal. Started before refusal arrived.
- `ls /opt/homebrew/bin/pnpm /usr/local/bin/pnpm; ls /Users/benharwood/Library/Caches/node/corepack/v1/pnpm; ps -axo pid,etime,command | rg 'pnpm --version|pnpm --manage'`: exit 1, paths absent and process inspection refused as above.
- `cat > /private/tmp/jg-sv3-barrier-controls.mjs` with the temporary behavioral harness, then `node --test --test-concurrency=2 /private/tmp/jg-sv3-barrier-controls.mjs`: exit 1, first red run 0/4 passed.
- `node --test --test-concurrency=2 /private/tmp/jg-sv3-barrier-controls.mjs` after implementation: exit 1, 3/4 passed.
- Python update of the builder-created temporary harness (cross-VM continuation wait), then `node --test --test-concurrency=2 /private/tmp/jg-sv3-barrier-controls.mjs; memory_pressure | tail -1; df -g /System/Volumes/Data`: exit 0, tests 4/4; memory 67%, disk 80 GB available.
- `rg -n 'function openLiveWatchdogJob|function startWatchdogJob|goto' apps/web/e2e/helpers/capture-journey.ts; sed -n '1,90p' apps/web/e2e/helpers/capture-journey.ts; git diff --check; git diff --stat; git diff -- apps/web/e2e/SV-3.spec.ts; LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`: exit 1 (lane self-comparison); earlier diff check exit 0.
- `git status --short; git diff --numstat; git rev-parse HEAD origin/main; shasum -a 256` for the spec, registry, eight unchanged cited/helper files and temporary controls; `rg -n 'Missing branch or self-comparison' tools/agent-lane-boundary-lint.mjs`: exit 0, hashes above and two modified files.
- Python inspection using `git show origin/main:<path>` plus SHA-256 and original-line subsequence verification; `nl -ba apps/web/e2e/SV-3.spec.ts | sed -n '1,72p'; nl -ba tools/agent-lane-boundary-lint.mjs | sed -n '207,214p'; git diff --check`: exit 0, all original lines preserved, cited product/helper hashes unchanged.
- Python count via `git show origin/main:apps/web/e2e/SV-3.spec.ts`: exit 0, 187 original lines.
- Python creation of this receipt and intended commit-message file: exit 0.
- Final `rg -n 'addInitScript\(installIntervalBarrier\)|await stopAndDrain\(page,drain\)|const destination=await page.goto' apps/web/e2e/SV-3.spec.ts; git diff --check; git status --short; git diff --stat; git rev-parse HEAD; shasum -a 256 docs/verdicts/SV-3-BARRIER/BUILDER_RECEIPT.md /private/tmp/jg-msg-sv-3-barrier.txt; wc -l docs/verdicts/SV-3-BARRIER/BUILDER_RECEIPT.md`: exit 0. Status showed exactly the two authorized modified files and this receipt directory. Receipt line references corrected after this check.
- Final Python receipt correction and command-audit update, followed by `git diff --check; git status --short; git rev-parse HEAD`: exit 0.

Final head SHA remains `269874640468a6e1dfdfed63edd4ce187d1d9dbb`; dispatcher commit and exact-head CI/verdict are pending.
