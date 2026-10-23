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
