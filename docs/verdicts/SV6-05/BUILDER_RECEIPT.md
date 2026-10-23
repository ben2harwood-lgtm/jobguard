# SV6-05 builder receipt — 23 October 2026

Built ahead only; no commit, push, merge, acceptance or release. RED money lane. Builder: Codex gpt-6.1-sol, medium reasoning. Independent model verdicts and separate acceptance: NOT OBTAINED; dispatcher/Ben owns the next steps.

## Source and authority

- Branch `codex/sandbox/sv6-05`; exact base and unchanged HEAD `106cd0a3fddb7222cb1c9fbac309f1b6c0f75abd` (SV6-01). Target `main`; no git write commands used. Initial working tree was clean. Final work is uncommitted; this HEAD is the parent, not an invented reviewed implementation commit.
- Issued SV6-05 order / decision 74 explicitly permits build before parent merge; all parent acceptance/merge conditions remain.
- Read repository AGENTS.md, BUILD_PLAN §2.4 and SV-6 card, the full SV6-05 draft starting at planning-pack line 3073, its applicable common contract (§2 at 2130 onward), SV-6 source/handoff section and the 23 October Ben answers file.
- `git grep` verified the draft's existing named functions `sumExactPence`, `calculateCumulativeFee`, `allocateReceiptToLines`, `mapRecoveryReceiptToLines`, `deriveShadowSuccessFee`; also verified the actual SV6-01 schemas `recoveryAttributionRevisionV1`, `qualifyingRecoverySourceV1`, `currentAttributionQualificationV1`. Their real implementations were read. The last three arithmetic adapters are deliberately not imported/called by this leaf. Proposed `deriveRecoveryFeeIllustration` and `RecoveryFeeIllustrationInputV1` were absent on the base, as expected for new symbols, and are now implemented.
- No missing required predecessor symbol STOP. No source API was fabricated or parent file edited.

## Result and safeguards

A strict versioned pure-core projection consumes current reviewed source/assessment pairs and separate capture facts. It validates tenant/job/lock/case/work/line and source/revision/hash/amount agreement, checks the existing ten-conjunct predicate, refuses duplicate work/assessment/review/allocation consumption and missing allocation-manifest links, then uses the existing exact summation and cumulative fee kernel once. Current values already include owner-computed signed refunds/reversals; this leaf does not allocate raw receipts, replay historical assessments, or interpret negative rows as new recovery. Captured work always has zero fee. Deep-frozen output retains exact Q and Q−F and source references, with no posting or tax authority. Production remains disabled.

Pure parsing cannot authenticate records, discover omitted sources, identify a different UUID for the same economic movement, or prove approval/evidence freshness. SV6-03/06 must reconstruct the complete source inventory and reauthorize under their accepted transaction locks. Unavailable/held data must not be passed as a successful empty inventory. No successful DB/browser journey is claimed here.

Invariants affected: AGENTS §§5.5, 5.6, 5.9, 5.10, 5.14; preserve §§5.1–5.4 and 5.7–5.8 through caller-boundary restrictions. No migration, data backfill, schema/grant/catalogue change, operational alert, network adapter, authentication change, external action or backwards-incompatible v1 edit. Rollback is removal of this unused leaf before integration; no persisted state exists.

## Safest choices applied (Ben, 23 October)

Authority: `~/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261023.md`, “Use safest choice”, as explicitly applied by this issued order. Reference synthetic choices only, changeable before real customers:

1. Q4: withhold fractional principal/capture/remainder displays (null, not zero); preserve exact rational values. No fractional display rounding is chosen. Omit ambiguous `found`/unpaid-findings values rather than imply that qualifying recovered principal represents all findings.
2. Q5: omit prior-illustration comparison, hypothetical delta and actual posted J. F3 recomputes £60 after £80; there is no −£20 journal claim.
3. Q9: require one exact explicit synthetic bundle `recovery-fee-illustration.synthetic-policy.v1` on envelope, assessment and qualified source. It composes the existing attribution/eligibility v3 versions, fixed reference fee v3 at 10%, existing commercial half-even rule and these withheld-display/comparison rules. Unknown/mismatched bundles refuse, with no fallback. No D01/D02/D03/D13 or production approval is asserted.
4. Refuse every supplied held/unreviewed/excluded/not_assessed qualification and every inconsistent source; do not invent permission, settlement, signed-source semantics or a positive principal.

## Tests first and acceptance evidence

The unit and type tests were written before the implementation. Initial RED run with installed Vitest: exit 1, both new suites failed because the implementation module did not exist (no tests executed). A subsequent implementation run exposed the split-history fixture's missing allocation-manifest reference; the fixture was completed with its required source, retaining the positive assertion. No existing test was weakened or edited.

| Acceptance | Automated evidence |
|---|---|
| S6-05-A | Named A test: F1 £800/£80; F2 £400→£800/£40→£80; F3 remaining £600/£60; exact F4 2000000/43 pence and F4651p; F4b/F7 £800/£80; F5 £400/£40; F6/F8 zero. Original input and prior output remain intact. No postingDelta. |
| S6-05-B | Named B test: split/combined final facts and order-independent multi-work sum; round only after summing 5p+10p; half-even 5/15/25/35p ties; malformed/negative/overflow rationals and negative/overflow captured totals refuse. |
| S6-05-C | Named C test: F12 £3600 captured with zero fee; F13 Q £800/F £80/remainder £720; F23 subscription £69 rejected as an offset. |
| S6-05-D | Both named D tests: duplicates across independently re-keyed sources for allocation/work/assessment/review, repeated capture and allocation, missing line manifest; foreign tenant/job/lock/case/work/line and mismatched hash/revision/amount/policy/stale qualification refuse. |
| S6-05-E | Named E test: every false predicate, unresolved dispute, invalidated evidence assessment, permanent exclusions, unqualified states and production mode refuse. Empty authoritative qualification produces disabled zero; typed runtime failure. Type test has real @ts-expect-error negative API cases, verified by package tsc, not transpilation alone. |
| S6-05-F | Named F test: exact fraction separated from withheld displays; labels and sandbox watermark; no base/cap/credit/subscription/tax/prior illustration/posting fields; strict policy binding; unchanged v1 regressions. |

I checked that each acceptance ID detects removal of its rule using six temporary mutations. Each targeted test run exited 1, and the source was restored by a finally block: A replace returned fee with zero; B sum only the first work; C erase captured total; D remove duplicate rejection; E remove qualifying-predicate/outcome check; F expose fractional integer truncation. The D run had one failing D case and one passing D case; the other mutations each failed their named case. Vitest's other unselected tests are reported as skipped because of `-t`, not because skip statements were added. Logs: `/private/tmp/jg-sv6-05-mutant-A.log` through `-F.log`. Final unmutated acceptance run: 8 tests passed.

## Commands actually run

Node v24.17.0, installed Vitest 4.1.11, TypeScript 5.8.3. The host pnpm launcher reported itself through a newer wrapper and stalled in initial version probes; interrupted (exit 130). No dependency install or download command was issued. All final package commands invoke the already-installed pinned pnpm explicitly as:

`node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs` (abbreviated PINNED_PNPM below).

The host scheduler was attempted inside sandbox; sysctl/process inspection were denied, and the initial waiting run was interrupted (130). Authorized checks then used approved escalated tool execution through `HEAVY_SLOTS=2 /Users/benharwood/.local/bin/heavy-slot <label> ...`. No scheduler was replaced. Checks ran sequentially, focused Vitest batches used at most two workers and three named files; the mutation script ran one filtered batch at a time. Root Turbo concurrency was explicitly 2. Free disk before checks 202 GiB, later 201 GiB; observed free memory 70–72%. Resource waits were allowed to finish; another queued regression invocation was cancelled before execution (130), then run once in the sequential check batch.

| Command (after scheduler/pinned prefix) | Actual result |
|---|---|
| `--dir packages/core exec vitest run --maxWorkers=2 src/recovery-fee-illustration.test.ts src/recovery-fee-illustration.type.test.ts` | PASS, exit 0: 2 files, 8 tests; repeated after mutations. |
| `--dir packages/core exec vitest run --maxWorkers=2 src/cumulative-fee.test.ts src/shadow-domain/success-fee.test.ts src/receipt-allocation.test.ts` | PASS, exit 0: 3 files, 147 tests. |
| `--dir packages/core exec vitest run --maxWorkers=2 src/fee.test.ts src/fee-what-if.test.ts src/fee-statement.test.ts` | PASS, exit 0: 3 files, 25 tests. |
| `--dir packages/core exec vitest run --maxWorkers=2 src/recovery-attribution-persistence.test.ts src/recovery-attribution-persistence.type.test.ts src/recovery-allocation.test.ts` | PASS, exit 0: 3 files, 55 tests. |
| `--dir packages/core typecheck` | PASS, exit 0; explicit TypeScript negative gate included. |
| `--dir packages/core lint` | PASS, exit 0. |
| `--dir packages/core build` | PASS, exit 0. |
| `typecheck --concurrency=2` | PASS, exit 0; 7 package tasks (2 cache hits), 49.313s. |
| `LANE_BASE_REF=origin/main ... lint --concurrency=2` | HOLD/exit 1: inherited SV6-01 six-file delta outside SV6-05 lane; core purity ran before this failure. |
| `LANE_BASE_REF=origin/main ... lint:lanes` | HOLD/exit 1: same inherited SV6-01 files. |
| `openapi:check` (first run) | Exit 1: missing pre-build packages/db/dist/index.js. Recheck after root build recorded below. |
| `git diff --check` | PASS, exit 0 (tracked diff); final untracked-file whitespace and scope inspected separately. |

Full outputs of the sequential checks are in `/private/tmp/jg-sv6-05-{regression-v1,final-unit,parent-regression,package-typecheck,package-lint,package-build,root-typecheck,root-lint,lanes,openapi}.log`. The 147-test regression and earlier RED runs are in this session's tool output; no persistent CI log is claimed.

Final checks after adding the explicit invalidation/immutability assertions:

| Command | Actual result |
|---|---|
| `CIRCLE_NODE_TOTAL=2 HEAVY_SLOTS=2 ... PINNED_PNPM build --concurrency=2` | PASS, exit 0: 7 package build tasks, 2 cache hits; 1m56.722s. Next static worker count is 1 with this environment; existing autoprefixer support warnings only. Log `/private/tmp/jg-sv6-05-root-build.log`. |
| `PINNED_PNPM --dir packages/core exec vitest run --maxWorkers=2 src/recovery-fee-illustration.test.ts src/recovery-fee-illustration.type.test.ts` | PASS, exit 0: final 8 tests, 18:07:21. Log `/private/tmp/jg-sv6-05-final-unit-confirmed.log`. |
| `PINNED_PNPM --dir packages/core typecheck` | PASS, exit 0: final test additions compile, including @ts-expect-error checks. Log `/private/tmp/jg-sv6-05-final-typecheck.log`. |
| `PINNED_PNPM openapi:check` after root build | PASS, exit 0. The first failure was resolved by compiling dependencies; no OpenAPI snapshot was edited. Log `/private/tmp/jg-sv6-05-openapi-after-build.log`. |
| `LANE_BASE_REF=106cd0a3fddb7222cb1c9fbac309f1b6c0f75abd PINNED_PNPM lint:lanes` (additional diagnostic only) | Exit 1: linter refuses self-comparison because HEAD still equals the pinned parent and no commit is permitted. This is not claimed as a lane PASS. Log `/private/tmp/jg-sv6-05-lanes-parent-diagnostic.log`. |
| `node tools/core-purity-lint.mjs` | PASS, exit 0; existing computed-import unverifiable-site reports remain, no purity exception added. Log `/private/tmp/jg-sv6-05-purity.log`. |
| `node tools/money-arithmetic-lint.mjs` | PASS, exit 0. Log `/private/tmp/jg-sv6-05-money-lint.log`. |
| `node tools/commercial-boundary-lint.mjs` | PASS, exit 0. Log `/private/tmp/jg-sv6-05-commercial-lint.log`. |

Final scope inspection (Python comparing git's untracked-file list with the exact lane allowlist plus its own JSON): PASS, six new permitted files, no tracked-file modifications; each file has a terminal newline and no trailing whitespace. `git diff --check` also passed. This manual content/scope check does not substitute for the held formal lane check. Final unique unit coverage across the four named batches is 235 tests; no database/browser test counts are included.

## Holds, STOPs and integration handoff

- Build authority does not waive merge prerequisites: accepted SV6-01, SV-5, complete CH-7, neutral M4-8 source/proofs, current approval/reassessment and downstream SV6-03/06 contracts still gate integration. No claimed saved receipt/approval or real settled money exists in this leaf.
- STOP at shared barrel boundary (explicit allowlist). Coordinator should add exports for `deriveRecoveryFeeIllustration`, `recoveryFeeIllustrationInputV1`, `recoveryFeeIllustrationOutputV1`, `recoveryFeeIllustrationPolicyBundleV1`, `RecoveryFeeIllustrationError`, and types `RecoveryFeeIllustrationInputV1`/`RecoveryFeeIllustrationOutputV1` in packages/core/src/index.ts after agreeing the synthetic policy reference and source contract. No shared file is changed here.
- Catalogue rows needed later: NONE for this pure leaf. No table, controlled routine, permission, grant, migration, API route, OpenAPI path or watchdog command is introduced. Lane registration is the specifically authorized new disjoint file only.
- STOP at origin/main lane-range integration: the six inherited parent files are config/lanes/sv6-01.json, docs/contracts/recovery-attribution-v1.md, docs/verdicts/SV6-01/BUILDER_RECEIPT.md and the three packages/core/src/recovery-attribution-persistence{,.test,.type.test}.ts files. Do not broaden this lane to own them. Dispatcher must integrate the parent first and rebind the comparison/reviews.
- Database/migration/browser tests: NOT RUN locally; no DB/browser files written because this expressly C1 pure-core allowlist contains no such paths or guarantees. This is the applicable exception to the generic “write them” instruction; SV6-06 owns those tests and both browser projects. No PG/localhost service started. Root test/eval, complete CI, security/dependency scans and real persisted journeys remain CI evidence holds, not inferred passes.
- No CI run, artifact URL, browser screenshot, professional sign-off or independent verdict is available. Two actual independent exact-head Claude PASSes and separate actor acceptance are still required on the dispatcher-created commit. Ben alone merges/releases. All applicable production/pilot gates and decisions remain closed.
- Intended conventional commit subject/body written to `/private/tmp/jg-msg-sv6-05.txt`; dispatcher commits after exit.

## Changed-file content binding

All files below were newly created; no tracked parent file changed. The receipt itself is the sixth new file and is not self-hashed.

- `config/lanes/sv6-05.json` — SHA-256 `4e04e0c7a0509f3b757db6380d1d05536b93d98ce531c0cc8072498aa60c3fc3`
- `docs/contracts/recovery-fee-illustration-v3.md` — SHA-256 `0d67564a3c4111ce925b64bf27bdcbdbdff5bf7fdbba319ba29d3b19eeba539b`
- `packages/core/src/recovery-fee-illustration.ts` — SHA-256 `f5fa951cd82958f2ed20c2286e5d4381c4e659b8290058a9b3c5bcedba5b979e`
- `packages/core/src/recovery-fee-illustration.test.ts` — SHA-256 `8e641aee05b5e5264b116341447e5217654e5a5222c78e8690da5215600aaae7`
- `packages/core/src/recovery-fee-illustration.type.test.ts` — SHA-256 `26faef2e861440e20846c115ad97ba1117da361ea955715e9defa6548c65ddce`
