# M48-C0 builder receipt — 23 October 2026

Build-only working-tree delivery; no commit, push, PR, acceptance, merge or release performed. Builder: Codex. Independent model review is not claimed.

## Authority and inspected base

Issued M48-C0 order (23 October, decision 74) overrides draft build-start holds only. Read repository AGENTS.md, BUILD_PLAN §§10.2.8, 10.3.2, M4-8-S; planning pack common contract §2 and full M48-C0 section plus source bridge shapes/holds; BEN-ANSWERS-20261023.md. HEAD and origin/main both `dc5721230fd8aedbf2d9d0457789074b66b48765`; branch `codex/sandbox/m48-c0`; initial working tree clean. New lane follows ch5-c's version-2 shape, read with `git show`. User-issued lane path supersedes the dated draft path.

Verified existing named symbols with `git grep`: recoveryReceiptFactsV1 and mapRecoveryReceiptToLines (recovery-allocation.ts), exactPenceInputV1/parseExactPence/exactPenceV1 (cumulative-fee.ts), instantV1 (receipt-allocation.ts), MAX_MONEY_PENCE (money.ts), shadowAttributionV1 (shadow-domain/attribution.ts), RecoveryAllocationActor/RecoveryAllocationRepository, PracticeFeedRepository.factsView/factsCommand, FinalAccountLockRepository.issueInvoice, VerifiedTenantContext/TenantTransaction, receipt_line_allocation and app.write_recovery_allocation. Both existing named regression files are present. Proposed C0 schemas were absent and added here; the proposed B1 port is not represented as an existing API. No missing existing-symbol STOP.

Environment: Node v24.17.0; manifest packageManager pnpm@10.28.1; installed dependencies reused, no install/download attempted. pnpm emits an existing warning that package.json overrides are ignored. Disk admission observed 210–211 GiB free; memory observed 52% free at a recheck. Host heavy-slot inspected and used with HEAVY_SLOTS=1 throughout (one owned batch, one Vitest worker). Initial sandbox wrapper could not inspect sysctl/ps; interrupted that waiting process and reran through approved escalated scheduler execution. No scheduler bypass, DB, browser or service launch.

## Scope and safe choices

Only five allowed files delivered: own lane, new pure source module/test, contract document, this receipt. No shared barrel/export, routing, catalogue, package, database, migration or existing-test edits. No new network action, alert, external provider, AI prompt or commercial capability. Existing core arithmetic and tests remain unchanged.

Specific reversible synthetic choices under Ben's 23 October safest-choice instruction:

- Refuse unknown fields at every object boundary, invalid/absent invoice/hash/object-version/approval references, mismatched signed reversals, self-reversal, original-ratio mismatch and money above original line bounds. Parsing never grants approval or settlement authority.
- Require at least one evidence reference for a saved fact; do not count an evidence-free source. Actual verified state and available balance require the server writer, not a client assertion.
- Preserve original exact rational strings using the shared saved-output digit bound (`exactPenceV1`); the smaller `exactPenceInputV1` would wrongly refuse possible complete allocator outputs. Strict decimal spelling rejects negative zero. A test's initial speculative 101-digit invalid bound was corrected to the actual shared output bound + 1 before green execution; no existing test changed.
- Refuse oversized results/proposals above the existing 10,000-line limit, never truncate. Require a ready review's source watermark to match the view, and refuse foreign-job saved rows/results.
- Missing movement ID/hash/time are consistently null; settled projection requires all three. Preserve timestamp precision and reference bytes.
- Current factual holds beat old saved rows; approval expiry/revocation is stale review, never success. No expiry duration, permission grant, standing authorization or binding-creation policy invented. Approvals remain per exact immutable review; enforcement belongs to B1.

## Tests first and acceptance sensitivity

Created tests before implementation. First scheduled `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src/receipt-line-allocation-source.test.ts` failed (exit 1) because the new module did not exist; this was an import failure, not an assertion run. Then implemented and ran the scoped three-file suite.

Each acceptance ID has a rule-removal sensitivity check, actually executed by `/private/tmp/jg-m48-c0-mutations.py` under the shared scheduler. Mutations are temporary, sequential, restored in finally, and never committed. Each uses the new named test file with `-t M48-C0-A#`; nonmatching tests are filtered, not permanently skipped.

| Acceptance | Coverage | Deliberate mutation | Observed |
|---|---|---|---|
| A1 | F4 2000000/43, F5 40000/1, F7 80000/1; exact 5/6 ratios, signed reversals and sub-ms instants survive JSON | Replace parsed net by zero | matching assertion fails |
| A2 | malformed/zero/negative denominators, integer spelling, unsafe/over-limit pence and rationals, direction/sign/link/ratio/source bindings | Remove exact magnitude/negative-zero guard | matching test fails |
| A3 | all four valid variants, nested reversal-source strictness, forbidden client authority and money, bounded positive gross/revision | Strip instead of reject command extras | matching assertion fails |
| A4 | reject fee/posting/offset/cap/credit/eligibility/predicate fields, nested strictness | Strip instead of reject top-level saved-source extras | matching assertion fails |

Additional tests cover result action/outcome/nullable-ID pairing, immutable replay shape, status precedence, proposal vs saved separation, paired nullable movement fields, 10,000 accepted proposals vs 10,001 refused, strict selector/query/snapshot and typed command error, stale source watermark and cross-job projection. These prove pure contracts only, not durable replay or runtime authorization.

## Executed checks

All heavy commands used `/Users/benharwood/.local/bin/heavy-slot` with HEAVY_SLOTS=1. Root lint/lane commands used LANE_BASE_REF=origin/main. Logs retained under `/private/tmp/jg-m48-c0-*.log` for dispatcher diagnosis (not committed).

- Core typecheck: PASS, `pnpm --filter @jobguard/core typecheck`.
- Package lint: PASS, `pnpm --filter @jobguard/core lint`.
- Draft scoped regressions: PASS, `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src/receipt-line-allocation-source.test.ts src/recovery-allocation.test.ts src/receipt-allocation.test.ts` (93 tests / 3 files after added boundary tests; initial implementation run 91).
- Four acceptance mutation runs: all KILLED, restored source.
- Root lint: attempted `pnpm lint -- --concurrency=1`, then corrected `pnpm lint --concurrency=1`; both stop at lane self-comparison because HEAD == origin/main. Existing computed-import source-inspection warnings appear; no scanner relaxation.
- `pnpm lint:lanes`: exit 1, `Missing branch or self-comparison range; refusing a misleading pass.` Dispatcher reruns after commit; no invented alternate base or synthetic commit used.
- First build `pnpm build -- --concurrency=1`: exit 1 because Turbo forwarded the option to tsc. Corrected `pnpm build --concurrency=1`: PASS, 7 successful tasks (2 cached), about 50 seconds.
- First `pnpm openapi:check`: exit 1, dependency dist missing before successful build. After build: PASS.
- `git diff --check`: PASS (read-only); final allowed-path check recorded below.

Final verification after reference-preservation/fixture refinements is appended below. No clean install claimed. Whole-repo unit, database, migration, browser, live eval, security/release and exact-head CI gates remain for the dispatcher; no scoped pass substitutes for them. Database/browser checks are CI-only under the order, and this leaf introduces neither subsystem changes nor a browser flow. AI eval is inapplicable to these factual parsers (no model/prompt/extraction/matching change).

## STOPs and merge/acceptance holds

- STOP (persisted example item only): no accepted neutral bridge saved IDs available on this base. Contract examples/tests are explicitly fabricated parser fixtures. No fabricated persisted lineage or saved F5/F7 claim. Continue C0 pure contracts under build-ahead authority.
- HOLD: H-M48-SOURCE-DESIGN/Q2 and Q6; approved source/action/actor/expiry/revocation/common lock order, current-interpretation/deduplication contract. B1 must implement actual session/tenant authority, available source checks, immutable replay, complete source composition, lineage, atomicity and races.
- HOLD: deposit-source rebind, accepted SV5/predecessor handoff, persisted M48-B1 and saved F5/F7 proofs. No legacy v1 workaround or integer case landing created.
- HOLD: root lint/lane check after dispatcher commit and full required exact-head CI.
- HOLD: two independent exact-final-head Claude verdicts, separate technical acceptance and Ben's merge. This receipt is builder evidence only, never an independent verdict.

No migration or rollback needed for additive unused pure modules. Backwards compatibility: existing exports, kernels, tests and legacy paths unchanged. Integration must rebind these proposed shapes to the accepted source design; safe synthetic choices remain changeable before real customers. No production gate (D01–D16/G1–G5), real data, fee issuance/collection or provider enabled.

## Final verification on delivered source

After preserving reference bytes without trimming and using actual 5/6 original line ratios in F4/F5/F7 round-trip fixtures, reran all four mutation checks (all KILLED), core typecheck (PASS), package lint (PASS), the same three-file Vitest batch (93 PASS / 3 files), full `pnpm build --concurrency=1` (7 successful tasks, 2 cached, 54.48 seconds), and `pnpm openapi:check` (PASS), sequentially under HEAVY_SLOTS=1. Source restored after mutations before these checks. Logs: `/private/tmp/jg-m48-c0-final-*.log`.

Final `git diff --check` exits 0. Because new files are untracked and cannot be staged here, also inspected the complete new source/test/document text; no existing tracked file is modified. A read-only diagnostic using the actual `loadLanePolicy`, `selectLane` and `lanePathAllowed` exports selects only `m48-c0` and confirms all five working-tree additions are allowed. This diagnostic is explicitly **not** the missing actual lane-check PASS; dispatcher must commit then rerun root lint/lint:lanes.

Intended conventional commit subject and body written to `/private/tmp/jg-msg-m48-c0.txt`. No git write command executed. Delivery is ready for dispatcher commit and required review/CI, with the holds above intact.

## r1

23 October 2026; builder Codex gpt-6.1-sol. Repair against inspected HEAD `84b1e1fe1d3d89aa935fb4e7b0ed0afa08e20d04`, branch `codex/sandbox/m48-c0`, initially clean. Read both full Claude verdicts first from `/Users/benharwood/.local/share/full-steam/jg-runs/v5-m48-c0-claude-{A,B}-84b1e1fe-20261023.md` (not present relative to this worktree), then repository instructions, applicable BUILD_PLAN contracts (§§10.2.8, 10.3.2, M4-8-S), lane and source contract. Both verdicts are REPAIR; this receipt does not replace them or claim independent acceptance.

Tests-only repair of the issued missing guard coverage. Added ten test cases in the leaf test file; existing tests were neither removed nor weakened. Added valid controls for each new case. Over-allocation cases preserve the original 5/6 ratio: gross/net 96006/80005 and 96001/(480005/6), plus signed reversals, with exact-equal 96000/80000 accepted. The net-above-gross case uses original and allocated net 96001 against gross 96000, preserving the ratio. Zero-gross cases use zero net and distinct reversal IDs. Review tests use otherwise valid ready views, testing negative receipt proposals, linked receipts, positive reversals and missing reversal links; a separate test rejects `qualified: true` on the review itself.

No defect found. Production source is unchanged. Only the lane-owned test and this receipt are changed; no migration, compatibility, provider, alert, prompt or production-policy change. Separate LATER findings remain outside this issued repair. All existing source-design, B1, CI, independent-final-head review, separate acceptance and release holds remain.

### Guard deletion evidence

Ran `/private/tmp/jg-m48-c0-r1-mutations.py`. Each mutation was applied separately to the actual working-tree source, run with pinned pnpm 10.28.1 against `src/receipt-line-allocation-source.test.ts --maxWorkers=2 --reporter=verbose -t <test prefix>`, then restored in `finally`. Every run exited 1 with an assertion failure (`expected true to be false`), not an import/type/setup failure. Nonmatching tests were filtered only during these sensitivity runs. Final source checked byte-for-byte against the pre-mutation text and with `git diff` (empty source diff).

| Guard deleted locally, then restored | Observed failing test name(s) |
|---|---|
| `Allocation exceeds original line` conditional | `r1 rejects ratio-consistent over-allocation for receipt`; `r1 rejects ratio-consistent over-allocation for reversal` |
| `Net exceeds gross` conditional | `r1 rejects original net above gross with a consistent allocation ratio` |
| `gross > 0n &&` from receipt sign branch | `r1 rejects zero-gross receipt rows` |
| `gross < 0n &&` from reversal sign branch | `r1 rejects zero-gross reversal rows` |
| Review proposal sign/link conditional and issue | `r1 rejects review proposal sign/link mismatch: 'negative receipt'`; `'linked receipt'`; `'positive reversal'`; `'unlinked reversal'` (same full prefix for all four) |
| Review object's `.strict()` | `r1 rejects unknown review keys` |

All six mutants killed, ten new assertion cases fail collectively. Detailed logs: `/private/tmp/jg-m48-c0-r1-mutant-*.log`.

### r1 executed checks and delivery

Dependencies reused without installation. Node v24.17.0; pinned pnpm 10.28.1 executed from `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. The default pnpm launcher stalled attempting its automatic version/signature resolution and failed with registry fetch errors before running the initial test command; its separate version probe was interrupted. No package download/install was requested. Subsequent commands used a temporary `/private/tmp/jg-m48-c0-r1-bin/pnpm` wrapper invoking the already cached pinned executable; check runner additionally set `COREPACK_ENABLE_NETWORK=0`. No repository configuration changed.

Actually run after restoring all source guards (check runner `/private/tmp/jg-m48-c0-r1-checks.py`, logs `/private/tmp/jg-m48-c0-r1-*.log`):

- PASS: `pnpm --filter @jobguard/core typecheck` and `pnpm --filter @jobguard/core lint` (each exit 0).
- PASS: `pnpm typecheck --concurrency=1` (7 successful tasks, exit 0).
- PASS: `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` (7 successful tasks, exit 0).
- PASS: `LANE_BASE_REF=origin/main pnpm lint:lanes` (exit 0; selected m48-c0, branch codex/sandbox/m48-c0, merge-base dc572123 against head 84b1e1fe, five original leaf paths).
- PASS: `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/receipt-line-allocation-source.test.ts src/recovery-allocation.test.ts src/receipt-allocation.test.ts` — 103/103 tests, 3/3 files, exit 0. Ran once before mutations and again after restoration; leaf now has 20 tests including 10 new r1 cases.
- PASS: `pnpm build --concurrency=1` (7 successful tasks, 2 cached, 1m32.454s, exit 0). Existing computed-import / webpack dependency warnings and sandbox cache IO warnings appeared; no checks were disabled.
- `pnpm openapi:check`: exit 1 before generator execution because the tsx CLI's IPC socket bind was denied (`listen EPERM .../tsx-501/41269.pipe`). PASS via equivalent generator invocation from `apps/api`: `node --import tsx src/generate-openapi.ts --check` (exit 0; same source and `--check`, no socket needed). Log: `/private/tmp/jg-m48-c0-r1-openapi-loader.log`. The standard script still needs exact-head CI confirmation.
- PASS: final `git diff --check`; production source diff empty. Final changed paths are only the leaf test and this receipt, both in the lane allowlist.

No PostgreSQL/database/migration/browser suites or services run, per dispatcher sandbox instruction; these remain with GitHub CI after dispatcher push. No clean-install, whole-repository test-suite, exact-final-head CI, independent r1 review, technical acceptance or release claim. No commit, add, checkout, push or PR command executed. Intended conventional commit subject/body written to `/private/tmp/jg-msg-m48-c0.txt` for dispatcher use.

## make PR green

25 October 2026; issued make-PR-green order for PR #332. Inspected clean HEAD `a57467527796fadfbcf11dcb06ec8af04f76f0af` on `codex/sandbox/m48-c0`, with `origin/main` at `5bcd5ede90b84afbb7d1924d91c015dc07d7bd32`. Read repository instructions, lane, source and tests, source contract, and applicable BUILD_PLAN §§10.2.8, 10.3.2 and M4-8-S. GitHub's commit-workflow lookup returned no runs for the supplied SHA; no remote CI-green claim is made.

No compatibility repair was required: this leaf has no Zod 3 `ZodTypeDef` annotations, `._type`/`._def` access or obsolete `z.record` call signatures. Existing source compiles against the installed Zod 4.6.6. Production code, strictness, schema formats, tests, scanners and lane allowlist are unchanged. Only this lane-owned receipt is edited. No new abstraction, migration, interface, alert, provider, policy or behaviour change.

Reused installed dependencies, Node v24.17.0 and cached pinned pnpm 10.28.1 through `/private/tmp/jg-m48-c0-green-bin/pnpm`, with `COREPACK_ENABLE_NETWORK=0`; no install or download. Before the direct core typecheck, moved all five existing `packages/*/dist` directories to `/private/tmp/jg-m48-c0-green-dist/<package>`. The direct core typecheck passed while all package dist directories were absent. The later successful build regenerated package outputs.

Actually executed checks (logs `/private/tmp/jg-m48-c0-green-*.log`):

- PASS: `pnpm --filter @jobguard/core typecheck`, without package dist outputs.
- PASS: `pnpm --filter @jobguard/core lint`.
- PASS: `pnpm typecheck --concurrency=1` — seven successful tasks, two cached.
- PASS: `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` — purity, money boundary, lane checks and seven package tasks; two package tasks cached.
- PASS: `LANE_BASE_REF=origin/main pnpm lint:lanes` — selects m48-c0 and the five original lane paths against the actual main merge-base.
- First whole-core run, `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2`: 3,025 passed, two failed solely at the existing 5,000ms timeout (`receipt-allocation.test.ts:212` stress test and `enterprise-domain/boundaries.test.ts:27` scanner). It overlapped local compiler checks. An isolated scanner diagnostic while compiler work continued also timed out, without a scanner assertion failure. Neither scanner nor test timeout was changed.
- PASS: repeat of the identical whole-core command after the other local checks completed — **3,027 tests / 130 files**, 23.76 seconds. No source, test, config, timeout or worker-limit edits between runs. Log: `/private/tmp/jg-m48-c0-green-core-tests-rerun.log`.
- PASS: `pnpm build --concurrency=1` — seven successful tasks, two cached. Existing computed-import, workspace-root, CSS and sandbox cache-write warnings do not change the outcome.
- `pnpm openapi:check` failed before generator execution because the sandbox denies the tsx CLI IPC socket (`listen EPERM`). PASS through the equivalent invocation from `apps/api`: `node --import tsx src/generate-openapi.ts --check` — same generator and check flag, no socket. Standard-script confirmation remains for CI.
- PASS: `git diff --check` before and after receipt update; only this allowed receipt differs from the supplied head.

No clean install, whole-repository test pass, database/migration/browser execution, live evaluation, exact-final-head CI, independent verdict, technical acceptance or release is claimed. Database/browser suites remain with GitHub CI after the dispatcher pushes, per the environment order. AI evaluation is inapplicable: no prompt, model, extraction, matching or gateway change. All prior source-design/B1 and release holds remain; this receipt does not amend acceptance or policy. No git write command, commit or push performed. Intended conventional commit subject/body written to `/private/tmp/jg-msg-m48-c0.txt`.
