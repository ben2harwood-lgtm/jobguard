Built by Codex; dispatched 13 Oct 2026.

# LATER-B27 builder receipt

Status: implementation written, verification partial; RED check then PARK under decision 74. No commit, push, merge, deployment, real data, provider action, spending or deletion. This is a builder run receipt, not an independent verdict or acceptance.

The addendum requests a first line attributing the build to Claude Sonnet and saying Codex was unavailable. That attribution would be false for this session; the first line records the actual builder.

## Base and applicable contracts

- Branch: `codex/sandbox/later-b27`.
- Actual `origin/main` and final HEAD: `31682762c903d716657c573e1b5deae63588aad7`; initial working tree clean. Both the header's `ca435eeb5791638c787c830d6ba717146f694539` and draft's `0bbb5ddb` are superseded by this checkout. Current main wins; no fetch or Git writes performed.
- `AGENTS.md` read in full; BUILD_PLAN C4 remains at line 115. Appendix A starts at line 3823; the exact checked arithmetic/typed overflow row remains at line 3838.
- Current main's cited schemas are still `job-repository.ts:9` (confirmation), `job-repository.ts:10` (transition amounts), `commands.ts:13` (action amount), and `ledger.ts:8` (posting amount). Confirmed with the working source, clean initial status and main's blob IDs below. These citations describe the pre-change main, not the shifted working lines.
- Reused the public `money` / `MoneyError`, `parseQuantity`, and `calculateNetLine` contracts. Inspected `docs/contracts/shared-money-origin-v1.md`; no shared fee/origin policy changes. LP command-binding design inspected for scope; LP implementation untouched.
- Node reports `v24.17.0`; repository pins pnpm `10.28.1`, Turbo `2.10.12`, TypeScript `5.8.3`, db Vitest `4.1.11`. `pnpm --version` printed a configuration warning without a version; the installed pnpm version was not established. No download/install attempted. Core `dist/money.js` was absent during inspection, so clean execution also needs the existing dependency-build sequence.
- The named lane file was absent. Added only `config/lanes/later-b27.json`, as permitted for the task's own branch by `tools/agent-lane-boundary-lint.mjs:35` and the order's named lane. The merged register/pinned lists remain unchanged.

## Changes and acceptance coverage

| ID | Implementation | Added coverage | Executed result |
| --- | --- | --- | --- |
| L016 | Confirmation checks total against exact quantity × unit price using existing half-even kernel. | Unit title `L016 confirmation rejects a total inconsistent with exact quantity times rate`; PostgreSQL title with the same text plus `without state/audit changes`. | NOT RUN |
| L026 | Shared Zod adapter invokes public money validator before dispatcher hashing/DB work. | `L026 command money accepts the maximum and rejects maximum plus one and unsafe integers`; combined before-connection typed-error case. | NOT RUN |
| L102 | Same adapter for posting amounts, unit price/total and nullable job transition amounts. Existing nonnegative/positive semantics retained. | Direct repository boundary matrix; explicit null/pairing case; before-connection case; PostgreSQL valid maximum/overflow case. | NOT RUN |

Five unit tests and two PostgreSQL tests are added. Test files were created before production edits (separate apply-patch calls). First failing run: **NOT RUN**, because the preflight already reported only 44 GB free. The dispatcher requires more than 45 GB before heavy work and prohibits PostgreSQL/browser execution here. No red/green test claim is made.

The unit boundary matrix covers zero where already allowed, maximum, maximum plus one, negative maximum, below negative maximum, unsafe integers of both signs, fractional/non-finite numbers, nullable defaults, explicit nulls, and amount/currency pairing. The proposal tests cover ties in both directions (101 × 1.5 → 152; 103 × 1.5 → 154), fractional quantities, zero, mismatches and computed overflow. The before-connection case uses a pool connection sentinel only to inspect application validation; it does not establish PostgreSQL guarantees. The separate PostgreSQL suite uses the existing embedded PostgreSQL fixture/runtime role, compares proposal/identity state and revision/progress/audit counts on refusal, and checks a subsequent valid confirmation.

Compatibility: invalid/out-of-range amounts and inconsistent totals are newly refused with `ZodError`; custom money issues retain the kernel code in `params.moneyCode` (`invalid_pence`, `magnitude_exceeded`, `overflow`), with `total_mismatch` for inconsistent totals. Proposal quantity now passes through the existing kernel's canonical maximum-six-decimal parser, so excess precision is refused rather than coerced. No money rounding, fee, tax, lifecycle, role, authorization or semantic replay policy is changed. Transition nullable defaults remain null; command amount/currency pairing remains unchanged; posting amounts remain strictly positive.

## Runs and holds

| Command/check | Exit/result | Counts or reason |
| --- | --- | --- |
| `memory_pressure \| tail -1` | 0 | 81% free on both observed runs |
| `df -g /System/Volumes/Data` | 0 | 44 GB available on all observed runs; STOP heavy work |
| `git diff --check` | 0 | No whitespace errors in tracked diff; repeated after edits |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1 | `Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.` |
| TypeScript parser inspection (inline Node script below) | 0 | Five TypeScript files, zero parse diagnostics; syntax only |
| SHA-256 inspection (inline Python below) | 0 | Six source/test/lane hashes; eight protected/shared files identical to main |
| `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/later-money-boundaries.test.ts` | NOT RUN | Disk preflight 44 GB; first failing run also NOT RUN; five tests written, zero executed |
| `~/.local/bin/heavy-slot later-b27 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/later-proposal-totals.integration.test.ts` (with pnpm PATH export) | NOT RUN | Cannot start PostgreSQL in this sandbox; disk preflight also fails; two tests written, zero executed |
| `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm exec turbo run typecheck --force --concurrency=2` | NOT RUN | Disk preflight fails; no cached result substituted |
| `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm exec turbo run lint --force --concurrency=2` | NOT RUN | Disk preflight fails; no cached result substituted |
| `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm build --force --concurrency=2` | NOT RUN | Disk preflight fails; no cached result substituted |
| `export PATH="$HOME/Library/pnpm/bin:$PATH"; LANE_BASE_REF=origin/main pnpm lint:lanes` | NOT RUN | Same lane checker already refused the exact base; no alternate base used |
| `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm openapi:check` | NOT RUN | Disk preflight fails; API/OpenAPI sources unchanged |
| `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e` | NOT RUN (each) | Full suites/DB/socket/browser work prohibited by dispatch; CI/dispatcher only |
| `pnpm eval` | NOT RUN | No model, prompt, extraction or matching changes; existing applicable CI remains required |

The three heavy check commands are recorded with `--force`, as required; they were **not executed**, so there are no successful uncached exit codes to report. No heavy-slot job, PostgreSQL instance, browser or listening service was started. No checks were run concurrently with a build; no whole test suite was run.

STOP at `tools/agent-lane-boundary-lint.mjs:303`. Exact unchanged line before/after:

```js
  if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");
```

HEAD equals the required comparison base and Git writes are excluded here. The dispatcher must commit the authorized diff, then run the unchanged checker against `origin/main`. Do not weaken this line or select a substitute base. No existing test, pinned value or assertion requires editing; no numbered product-policy question was discovered. Disk cleanup is outside this order; none attempted.

## Command inventory

Read-only shell invocations below are grouped exactly as issued. A group's exit is the last shell command's exit; individual missing paths/search misses are identified. Inspections run in parallel only where independent. Each apply-patch call returned success: (1) both new test files, (2) three implementation files, (3) task lane plus edits to the new unit test, (4) this receipt/ledger/intended commit message. No merged test file was changed.

1. Exit 1: `pwd; git status --short; git rev-parse HEAD; git rev-parse origin/main; cat AGENTS.md; cat config/lanes/later-b27.json`. Initial status empty; lane file absent.
2. Exit 0: `cat package.json; cat packages/db/package.json; cat packages/core/src/money.ts; cat packages/db/src/ledger.ts; cat packages/db/src/commands.ts`.
3. Exit 0: `cat packages/db/src/job-repository.ts; rg -n 'C4|1_000_000_000_000|Appendix A|magnitude|half-even|LATER-B27' BUILD_PLAN.md; rg --files packages/db/test config/lanes docs/contracts | head -90; cat ~/.local/share/full-steam/handoffs/jobguard-task.md`.
4. Exit 0: `cat tools/agent-lane-boundary-lint.mjs; cat packages/db/vitest.config.ts; cat vitest.config.ts; memory_pressure | tail -1; df -g /System/Volumes/Data; node --version; export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --version`. Root Vitest config absent; package config exists. Pnpm warning only.
5. Exit 0: `cat packages/db/src/job-repository.ts`.
6. Exit 1: `sed -n '100,125p' BUILD_PLAN.md; sed -n '3825,3860p' BUILD_PLAN.md; cat ~/.local/share/full-steam/handoffs/jobguard-task.md; rg -n 'money|quantity|round' packages/core/src/index.ts; cat packages/core/src/quantity.ts; cat packages/core/src/rational.ts; cat packages/db/test/job-spine.integration.test.ts`. Last guessed test path absent; used actual `job.integration.test.ts` next.
7. Exit 0: `rg --files packages/db/test | rg 'job|quote|proposal|harness|setup'; rg -n 'confirmProposal|createProposal|quantity|amountPence' packages/db/src/*.test.ts | head -90; rg -n 'later-b27|LATER-B27' config; sed -n '1,100p' tools/agent-lane-boundary-lint.mjs; cat packages/db/tsconfig.json; cat packages/core/package.json`. No existing B27 registration.
8. Exit 1: `cat packages/db/test/job.integration.test.ts; cat packages/db/test/ledger.integration.test.ts; cat packages/db/test/helpers.ts; cat packages/db/src/tenant-context.ts; rg -n 'calculateNetLine|MoneyError|money\(' packages/db/src/quote*.ts; rg -n 'magnitude|Appendix A' BUILD_PLAN.md; git branch --show-current; rg -n 'confirmProposal|quantityDecimal' packages/db/test/job*.ts apps/api/src -g '*.ts' | head -70; ls node_modules/.bin/pnpm packages/core/dist/money.js`. Guessed helpers path and final two paths absent.
9. Exit 0: `cat packages/db/test/pool-test-utils.ts; cat packages/db/test/job-parties.integration.test.ts; cat packages/db/test/tenant-context-test-utils.ts; cat packages/db/test/job-sources-fixture.ts; sed -n '1,90p' tools/lint.mjs; cat config/lanes/later-b26.json; ls node_modules/.bin; df -g /System/Volumes/Data`. Example B26 lane absent. Disk 44 GB.
10. Exit 0: `sed -n '1,105p' packages/db/test/job-work-state-fixtures.ts; cat tsconfig.json; cat packages/db/src/audit-fix-dbsrc-08.test.ts | head -30; cat tools/money-arithmetic-lint.mjs; git ls-tree origin/main packages/db/src/job-repository.ts packages/db/src/commands.ts packages/db/src/ledger.ts; nl -ba packages/db/src/job-repository.ts | head -16`.
11. Exit 1: `rg -n 'scope_revision|quantity_decimal|unit_price_pence|total_pence' packages/db/migrations/0007*; nl -ba packages/db/src/commands.ts | head -24; nl -ba packages/db/src/ledger.ts | head -16; test -e docs/verdicts/LATER-B27/BUILDER_RECEIPT.md; test -e docs/ledger/LATER-B27.md; test -e /private/tmp/jg-msg-later-b27.txt`. All three output paths absent before creation.
12. Exit 0: `rg --files config/lanes | head -8; cat config/lanes/later-b12.json; git diff --stat; git diff --check; LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs; df -g /System/Volumes/Data; memory_pressure | tail -1`. Example lane absent; lane subcommand exit 1, diff check exit 0; disk 44 GB, memory 81%.
13. Exit 1: `git diff -- packages/db/src/commands.ts packages/db/src/job-repository.ts packages/db/src/ledger.ts; nl -ba tools/agent-lane-boundary-lint.mjs | tail -65; rg -n 'scope_revision|quantity_decimal.*numeric|total_pence bigint|unit_price_pence bigint' packages/db/migrations/000* | head -35; rg -n 'job-repository|commands.ts|ledger.ts|quantity|Money' docs/contracts/money* docs/contracts/commands* 2>/dev/null`. Final glob absent; located real contract next.
14. Exit 0: `rg -n 'confirmProposalV1|transitionJobV1|planObligationV1|planSettlementV1|nonnegativeMoneyPenceSchema' packages apps --glob '*.ts' --glob '!*.tsbuildinfo'; rg --files docs/contracts | head -30; cat config/lanes/serious-b3.json; sed -n '36,44p' packages/db/migrations/0003_job_spine.sql; cat packages/db/src/review-repository.ts | head -65`.
15. Exit 0: inline `node --input-type=module` imports TypeScript and `readFileSync`, parses the five changed/new TS files using `ts.createSourceFile(..., ts.ScriptTarget.Latest, true)`, prints parse diagnostics/count and exits nonzero if any. Result: five files, zero diagnostics. This only parses syntax.
16. Exit 0: `rg --files docs/contracts | rg 'money|command|round|quantity'; df -g /System/Volumes/Data; git status --short; git diff --check; git diff --stat; git rev-parse HEAD`. Disk 44 GB; diff check clean; HEAD unchanged.
17. Exit 0: `cat docs/contracts/shared-money-origin-v1.md; rg -n 'version|round|limit|money' docs/contracts/lp-command-binding-design-v1.md | head -25`.
18. Exit 0: inline `python3` computes SHA-256/line counts for the six source/test/lane files below, then compares each of the eight protected/shared files byte-for-byte with `git show origin/main:<path>` and prints their SHA-256. All eight identical. No files written.
19. Exit 0: final read-only verification: inline `python3` checks the six hashes against this receipt, enumerates tracked/untracked changes against the eight authorized paths, and prints test declaration counts; followed by `git diff --check`, `git diff --stat`, `git status --short`, `git rev-parse HEAD`, and `rg -n 'Unsafe money integer' BUILD_PLAN.md`. Six hashes match, eight authorized paths, five unit/two integration test declarations, zero executed tests; diff check exit 0, tracked stat unchanged, HEAD unchanged, plan row confirmed at 3838. This is manual scope evidence, not a lane-lint pass. Two final successful apply-patch calls added this inventory entry and then recorded its results; only the receipt changed in those calls.

## Diff and hashes

Main blob IDs before edits:

```text
2349f7b355ed23e1075dbb1024de7b400248e99b packages/db/src/commands.ts
5e240d038d40ca3960913a52df0d10c5afc808f2 packages/db/src/job-repository.ts
ad8a594adcf59c2c45dbde939211c882c195ac09 packages/db/src/ledger.ts
```

`git diff --stat` (tracked files; new files remain untracked until dispatcher stages them):

```text
 packages/db/src/commands.ts       | 11 ++++++++++-
 packages/db/src/job-repository.ts | 16 +++++++++++++---
 packages/db/src/ledger.ts         |  3 ++-
 3 files changed, 25 insertions(+), 5 deletions(-)
```

Working SHA-256 manifest (receipt/ledger excluded to avoid a self-referential hash):

```text
b28518ce2ebfe6c468aa18ee7de062f00434fb67dcc877eaabe4ce444daa0375 config/lanes/later-b27.json
f00ab7fb93419784e0b094c991cb141866d0969f097c416b90aa91a34d9a59ed packages/db/src/commands.ts
6c0d359e92e1222a47040f64b8eeee82af07c98b57c1d77381c1840046c5e846 packages/db/src/job-repository.ts
51e1ad4e1d36cfeee7f68f3f97d2f66c1b40a87a534b3cf2df60b5148f26d3f9 packages/db/src/ledger.ts
3a39323b71f6e157c089019d7fe6fa1f6fd2a1ca437191ecee1a5c51da3cf3a8 packages/db/src/later-money-boundaries.test.ts
a60df3960622780f0938324777804e2f434a2ac382ec8671fb1b8ae84a9411a5 packages/db/test/later-proposal-totals.integration.test.ts
```

Protected/shared working SHA-256, each identical to current main:

```text
8903cfb2ce110bfa8f5d7f0bef33b5c629a32f9a2ca2f613cfaef2a823119e45 tools/agent-lane-boundary-lint.mjs
b87e83d291fd5db09ef776737afa3f759629a44ef8af23bc14e6903ecadcc242 packages/core/src/money.ts
ca4556cc7fa60f4706d3093e34005855fa73ce76ebe986a262c45f65ef9a58d9 packages/core/src/quantity.ts
05ee2bde1350ba00f1d9a33adc6ce6834103e2191fd3aa221071d86ff0f3b6a7 packages/core/src/rational.ts
a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca packages/core/src/watchdog.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f packages/db/test/command-replay-contract.integration.test.ts
ec6d3dd219e42707fe0bd6b0550db7f4f260f36c55ff9fee0d36bde831586ef2 apps/api/src/auth/context-boundary.test.ts
```

New untracked files: the lane, two tests, this receipt, and ledger. No permanent byte/hash pins were added to tests. The intended commit message is outside the repository at `/private/tmp/jg-msg-later-b27.txt`.

## Builder self-inspection (not independent review)

- Inspected schemas and call sites. Validation still precedes DB connection, mutations and audit. The shared validator delegates numerical rules to the existing public kernel. Existing grants, stored routines, fingerprints, protected tests, API routes and command replay logic are untouched.
- No migration: upgrade proof and migration rollback inapplicable. New GRANT list: **none**. Standard F: no direct INSERT/UPDATE/DELETE grants added to `jobguard_runtime` on money, membership, authorization, receipt or audit tables, and no new table/routine introduced.
- No new route: watchdog route registration/live-job guard additions inapplicable. No UI, wording-polish, AI/provider or operations-alert changes.
- Earlier suites were not edited or run. Source inspection cannot establish their results. The existing PostgreSQL fixture is reused without harness changes. No live integration is claimed.
- Release gates: disk prerequisite; first red/green unit run and PostgreSQL execution; forced typecheck/lint/build; lane check on committed diff; CI; ordered Opus plus Sol-high independent RED checks and separate acceptance. All remain outstanding. PARK remains mandatory even after checks; Ben owns any merge/enable/deploy button.
- LATER: none added beyond this scoped correction. L025/L152 and LP authority/lifecycle work remain untouched.

Final head SHA: `31682762c903d716657c573e1b5deae63588aad7` (uncommitted diff; the dispatcher must bind reviews to its eventual commit).

## r1 — verification completion

Verified/completed by Claude Sonnet (Codex stand-in), dispatcher 14

Codex built the implementation (commit 3333f163); this section only records verification, run after decision 82 lowered the disk gate to 33 GB (about 47 GB free). No source or test change was needed; no existing test expectation was touched.

Commands actually run (worktree on `codex/sandbox/later-b27`, clean at start; branch is 79 commits behind origin/main, not merged):

- `pnpm --filter @jobguard/db... build` -> exit 0 (core, storage, db).
- `pnpm --filter @jobguard/db exec vitest run src/later-money-boundaries.test.ts --maxWorkers=2` -> 1 file, 5 tests passed (L016, L026, L102 unit cases).
- `heavy-slot later-b27 pnpm --filter @jobguard/db exec vitest run test/later-proposal-totals.integration.test.ts --maxWorkers=2` -> NOT RUN: embedded PostgreSQL init failed ("Postgres init script exited with code null"), 2 tests skipped. CI must run it.
- `pnpm exec turbo run typecheck --force --concurrency=2` -> 7/7 tasks, 0 cached.
- `pnpm exec turbo run lint --force --concurrency=2` -> 7/7 tasks, 0 cached.
- `pnpm build --force --concurrency=2` -> 7/7 tasks, 0 cached.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` -> passed (8 files, includes config/lanes/later-b27.json from 3333f163).
- `git diff --check` -> clean.

Not run: full `pnpm test`, `test:db`, `test:migrations`, e2e/browser (CI). The first-failing-run (red) record remains unavailable.

AGENTS.md section 5.5 check (source inspection): amounts pass through the public `money()` validator (safe integer, existing 1_000_000_000_000 limit, typed `MoneyError`); the proposal total is derived with the existing `calculateNetLine` half-even kernel, no second arithmetic implementation; no float multiplication added; ledger still requires positive amounts; nullable job-transition fields stay nullable. No fee, tax, VAT or rounding-policy change.
