# FEE-PINS-1 builder receipt

13 October 2026 · branch `codex/sandbox/fee-pins-1` · tests only.

Builder implementation and deterministic execution evidence; independent verdict and separate acceptance remain pending. The issued lane is GREEN/AMBER, subject to the dispatcher's `lane-floor.py` result. No lane-floor verdict is claimed here.

## Scope and baseline

Read `AGENTS.md`, `BUILD_PLAN.md` §§2.1–2.4, §9.1 fee/statement contracts, ENT-4a, and the FEE-BOTH-1 ledger amendment. Inspected `fee-both.test.ts`, `fee.test.ts`, `origin.test.ts`, and the underlying source. Initial worktree was clean. HEAD and `origin/main` both resolve to `4db73817ab7b3be4993fe8b01279ac0e1b8cf836`.

First change: added the exact issued compact `fee-pins-1` lane immediately after `fee-both-1`. Only these three repository paths change:

- `config/agent-lane-assignments.json`: one added lane line.
- `packages/core/src/enterprise-domain/fee-pins.test.ts`: one new test file, six tests across FP-1, FP-2, FP-3.
- `docs/verdicts/FEE-PINS-1/BUILDER_RECEIPT.md`: this receipt.

Own local copies of `Role`, `FeeCase`, `feeCase`, `agreement`, `statement`, `section`, `expectRefusal`, and `prior` come from `fee-both.test.ts`. Shared fictional fixtures import from `./origin.test.js`, as in `fee-both.test.ts:7`. `statementLines` and `exactPence` are production functions, imported from `./index.js` and `../cumulative-fee.js` respectively, following `fee.test.ts`; copying their implementations into a test would stop exercising the real rule. No helper call name/signature adaptation was needed. Only formatting and the enclosing describe were added to the issued test lines. Every issued input, expected value, and assertion remains unchanged.

No merged test, source, pinned list/value, schema, policy or BUILD_PLAN file edited. No acceptance test for a positive prior posting without a derivation/statement id added. No exports added. No package install, git add/commit/checkout/push, migrations, routes, web workflows, external action or real data. C1/C2/C7: expressly pure-core tests, no browser journey introduced. Lane registry is the sole shared registration overlap, reserved by this issued work order; dispatcher owns integration.

## What the groups pin

Source references below are at the baseline commit, not mutated working-tree code.

| Group | Existing behavior and source |
| --- | --- |
| FP-1 (2 tests) | Prior qualifying principal 15p at 10% rounds half-even to 2p and cannot reproduce a posted 0p baseline: typed `INVALID_STATEMENT` (`enterprise-domain/fee.ts:173–175`). A nonzero 2p delta with only zero contribution changes is refused (`fee.ts:68–71`). Cancelling +1p/−1p changes retain signed lines [1, −1] even with zero total (`fee.ts:89`, mixed apportionment `fee.ts:95–112`). |
| FP-2 (1 test) | A 5,000p credit on the prior 15,000p extra plus a new 10,000p extra yields cumulative fee 2,000p against prior 1,500p, so total delta +500p and signed lines [−500, +1,000]. It remains a proposal; the prior id is retained but compensation id is null (`fee.ts:176–184,202–203`; `cumulative-fee.ts:174–180`). Compensation linkage depends on the aggregate negative delta, not an individual falling line. |
| FP-3 (3 tests) | Finalized facts count strictly before the server-recorded cutoff (`enterprise-domain/origin.ts:75–77`); exactly at cutoff the full credit waits, so fee is 1,234p, while one nanosecond before counts and yields 0p. Recorded time decides even when effective time is after cutoff. Bare-date cutoff fails the statement's instant schema with typed `INVALID_STATEMENT` (`enterprise-domain/contracts.ts:117`, `receipt-allocation.ts:16`, `fee.ts:136`). |

Affected invariants: exact rational money/half-even rounding (§5.5), immutable cumulative fees/compensation (§5.6), and contractor fee statement rules (§5.16 / plan §9.1). This adds regression coverage only. There is no behavior, backwards-compatibility, operational alert, data-flow or migration change. Proposed D16 and existing production charging gates remain unchanged.

## Tests-first and scratch mutation proof

The first real working-tree run passed all **6/6** tests, exit **0**, without changing an expected value or implementation. There was no red-before-green claim: these pin existing behavior.

Scratch root: `/private/tmp/jg-fee-pins-1-scratch`. Copied the core source and package manifest there and linked already-installed dependencies. Mutated exactly one scratch source location per run; restored that file in `finally` before the next run. The repository's source was never mutated. Runner: `/private/tmp/jg-fee-pins-1-mutations.py`.

Every scratch run used the same command as the real test run:

```sh
pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/enterprise-domain/fee-pins.test.ts
```

| Mutation | Exact scratch change | Observed assertion failure | Result |
| --- | --- | --- | --- |
| M1 | `fee.ts:175`: replace mismatch refusal with `if (prior) prior.priorNetPostedPence = previous.cumulativeFee.pence;` (silently normalize prior baseline). | FP-1 mismatch refusal expected `EnterpriseDomainError`, actual no error (`undefined`). | Exit 1; 1 failed, 5 passed. |
| M2 | `fee.ts:70`: remove the nonzero-delta refusal inside the all-zero-changes branch. | FP-1 zero-change refusal expected `EnterpriseDomainError`, actual no error. | Exit 1; 1 failed, 5 passed. |
| M3 | `fee.ts:89`: for a mixed-sign zero delta, allocate `money(0)` to each line instead of `apportionMixed`. | FP-1 cancelling lines expected [1, −1], actual [0, 0]. | Exit 1; 1 failed, 5 passed. |
| M4 | `cumulative-fee.ts:180`: return `input.compensatesDerivationId` unconditionally instead of only for negative aggregate delta. | FP-2 expected compensation id null, actual `id(101)`; still proposal/+500p. | Exit 1; 1 failed, 5 passed. |
| M5 | `fee.ts:202`: return `priorDerivationId: null` instead of `prior?.derivationId ?? null`. | FP-2 expected prior id `id(101)`, actual null. | Exit 1; 1 failed, 5 passed. |
| M6 | `origin.ts:77`: change fact cutoff comparator `< 0` to `<= 0`. | FP-3 exact-cutoff fee expected 1234, actual 0. | Exit 1; 1 failed, 5 passed. |
| M7 | `origin.ts:77`: filter on `f.effectiveAt` instead of `f.recordedAt`. | FP-3 exact-cutoff fee expected 1234, actual 0; recorded-before/effective-after expected principal 0/1 and zero_result, actual 12345/1 and proposal. | Exit 1; 2 failed, 4 passed. |
| M8 | `contracts.ts:117`: replace `recordedCutoff: instantV1` with `z.string().transform(v => v.length === 10 ? `${v}T00:00:00Z` : v)` (normalize bare dates). | FP-3 bare-date refusal expected `EnterpriseDomainError`, actual no error. | Exit 1; 1 failed, 5 passed. |

All six test bodies failed under at least one relevant mutation. Across eight mutation runs: **48 test executions, 9 expected failures, 39 passes**. No compile/import failure was counted as mutation proof. After restoration, a ninth scratch run passed **6/6**, exit **0**. A byte comparison verified all **149** copied source files, including this test, exactly match the actual worktree. Source and merged tests also remain equal to HEAD. Temporary mutation logs and machine-readable results remain under `/private/tmp/jg-fee-pins-1-*`; nothing was deleted.

## Commands actually run

Runtime Node **v24.17.0**, pinned pnpm **10.28.1**, Vitest **4.1.11**; existing installed dependencies reused. The default pnpm 11 launcher stalled on version detection. A temporary `/private/tmp/jg-fee-pins-1-bin/pnpm` shell wrapper executes the already-cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`; `PATH=/private/tmp/jg-fee-pins-1-bin:$PATH` was used for every check below, including subprocesses. No downloaded package or repository configuration change.

| Command | Exit and evidence |
| --- | --- |
| `pnpm --version` (cached launcher) | 0; 10.28.1. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/enterprise-domain/fee-pins.test.ts` | 0; 1 file, 6 passed on first working-tree run. No other test file executed. |
| `pnpm typecheck` (once) | 0; 7 tasks successful, 2 cached; 24.501s. |
| `LANE_BASE_REF=origin/main pnpm lint` (once) | 1; core purity passed (149 TypeScript files), then lane lint refused self-comparison; later stages did not execute in this command. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (once) | 1; `Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.` Both origin/main and uncommitted HEAD are the baseline commit. |
| `pnpm build` | 0; 7 tasks successful, 2 cached; 52.996s. Existing CSS autoprefixer warning and Turbo cache-permission warnings; no failed build task. |
| `pnpm openapi:check` | 1; tsx CLI IPC socket listen fails with sandbox `EPERM` before generator runs. |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | 0; same OpenAPI generator and --check path, via the tsx loader without its CLI IPC server. No OpenAPI output written. |
| `node tools/money-arithmetic-lint.mjs` | 0; money arithmetic boundary passed. |
| `node tools/commercial-boundary-lint.mjs` | 0; commercial boundary passed (silent success). |
| `pnpm exec turbo run lint` | 0; 7 package lint tasks successful, 2 cached; 24.955s. Executes the unaffected package stage the root lint could not reach. |
| Inline working-tree lane check using existing `selectLane` / `matches` | 0; branch selects exactly fee-pins-1, changed/untracked files are within its exact allowlist. This is a path/registration check only, **not a full lane-lint pass**. |
| Scratch mutations and restored run | Eight exit-1 assertion proofs, followed by exit 0, 6 passed; counts above. |
| Read-only git status/diff, scratch byte comparison, final source/merged-test verification | 0; only the three authorized paths change; restored scratch sources match worktree and original tracked files match HEAD. |

`pnpm typecheck`, `pnpm lint`, and `pnpm lint:lanes` each invoked once as ordered. Supplemental checks above execute unaffected stages without weakening or modifying checking code. Full root tests were not run: the work order explicitly limits Vitest to the new file with maxWorkers=2. DB/migrations/browser suites were not run: no DB or browser change, and the dispatcher's sandbox cannot bind localhost or start PostgreSQL. Full CI regressions, database and browser checks remain for GitHub CI after dispatcher's commit/push. AI evaluation is inapplicable: no model/prompt/parser/matching/gateway change.

## Handoff and holds

Implementation and local deterministic evidence supplied; not self-accepted. Dispatcher must commit, run lane-floor and the normal lane/root-lint checks against the new commit, push for full CI, obtain an independent exact-commit verdict and separate acceptance. Root lint/lane results remain **held**, not green. OpenAPI's wrapper was sandbox-blocked but its actual generator check passed. No production feature or policy approval is implied.

Intended conventional commit message is written to `/private/tmp/jg-msg-fee-pins-1.txt`. No git-writing command was used.

## Temporary log hashes

SHA-256 hashes for reproducibility (temporary artifacts, not committed attachments):

- `/private/tmp/jg-fee-pins-1-typecheck.log`: `ec1ff467024af0beb31b04e2df92857b572fe276b6c1efbf1b5c00aba49b5662`
- `/private/tmp/jg-fee-pins-1-lint.log`: `6df171d6a6732f9eecb76b22ee6d111410b8f28c32b56fa93bcaa71b420de028`
- `/private/tmp/jg-fee-pins-1-lanes.log`: `5aaeea97bf4c0b65b8bff3e00fe43e9bd118c9baf441908091d3af8f6b7d1b7c`
- `/private/tmp/jg-fee-pins-1-build.log`: `f3a60fb7f58601b3d2ddfd8d16abebbebf8aadcab2c0220bf99feeb8668970ad`
- `/private/tmp/jg-fee-pins-1-openapi.log`: `fd9949c722887d06d37ffc6a3c514c99aed59da587633ffb60c6be3312ea15b4`
- `/private/tmp/jg-fee-pins-1-openapi-direct.log`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `/private/tmp/jg-fee-pins-1-package-lint.log`: `88407b7576c3315f994890f434a31db7734f23c356a5cf70c9fabd5db88383f8`
- `/private/tmp/jg-fee-pins-1-restored.log`: `0ba50c1e20cb5528e5fa59dd1ace5f34948c53457ec4f3a3b3adcbd6da7160d9`
- `/private/tmp/jg-fee-pins-1-mutations.json`: `4a2d96aa3906463d38cde6643151eb2ce7787217d3b092f015a683f861f3737f`
- `/private/tmp/jg-fee-pins-1-M1-prior-normalized.log`: `6540a628e9a0b17c022419665cf6d6437c65b8d67f49b4ba0fad981747313bac`
- `/private/tmp/jg-fee-pins-1-M2-zero-change-accepted.log`: `c9fe09613f114ec725d04498cbfe97a8a2aaaf284be30048f09cc31ece8be050`
- `/private/tmp/jg-fee-pins-1-M3-cancelling-lines-zeroed.log`: `39d4d837f605935c91ef83004e5903015d74103a0682cd749d0d8715a04d9e45`
- `/private/tmp/jg-fee-pins-1-M4-positive-compensation-link.log`: `6804b546d997187f57dee9b1ce829f4f665504e51be5f701e988f68444a7cf64`
- `/private/tmp/jg-fee-pins-1-M5-prior-link-lost.log`: `2e0f659288910a5369b54f021762a6b10ace098ac56ddd53ae06e5210ade4926`
- `/private/tmp/jg-fee-pins-1-M6-inclusive-cutoff.log`: `15979e747b92cf20dee7f8e83b87ba96540b0cb6cfbe43013ec96da2c4863151`
- `/private/tmp/jg-fee-pins-1-M7-effective-cutoff.log`: `531edd3a9048d7740b1adb2261f71595a2447af2459ee0b3ef5349705304232c`
- `/private/tmp/jg-fee-pins-1-M8-bare-date-normalized.log`: `3ffaf00a618601beeddd2930fc65b572f79519095e0b4a0aa5030a85c8839d96`
