# SV6-06-07 builder receipt — 24 October 2026

Build ahead only on accepted SV6-05. No acceptance, independent verdict, commit, push, merge or release is claimed. SV6-06 and SV6-07 remain **DEPENDENCY-BOUND** for full persisted-source acceptance.

## Session record

```yaml
session_record:
  session_id: 01a16bc6-0885-7df1-9fe1-7e4b63a5dd5e
  thread_id: 01a16bc6-0885-7df1-9fe1-7e4b63a5dd5e
  agent: Codex
  model: not exposed by session metadata
  date: 2026-10-24
  task: SV6-06-07
  branch: codex/sandbox/sv6-06-07
  base_head: 68c87b84ec5ede05434d16034079e507aa9f1635
  implementation_commit: not created; dispatcher commits after exit
  independent_verdict: not obtained
  separate_acceptance: not obtained
```

## Authority and scope

Read AGENTS.md, BUILD_PLAN.md §10.2.8, §10.3.1–3 and SV-6; the issued planning pack's SV-6 build steps, acceptance table and ready rule at line 887; SV6-01's contract, schemas and tests; SV6-05's lane and receipt; and actual invoice/allocation implementations and SQL. The current issued order authorizes this build-ahead leaf and supersedes the broad draft lane/commit instructions. It does not satisfy the CH-7 ready rule. SV-5, CH-7 and M4-8 remain unmerged dependencies. No guessed SV-5 repository/API is implemented.

> Separate billed and paid; label estimates; create no bill.

Source: BEN-ANSWERS-20261013.md, card jobguard-twenty-product-decisions-2026-10-13, as quoted in the issued planning pack. Only the billed/paid separation applies in this lane. No new illustration policy, display or history decision is made.

The new pure attribution module validates internal versioned synthetic snapshots and derives only the billing/payment conjuncts. It binds commercial approval, catch/work/scope, lock/account revision, exact issued invoice line, identified settled movement, receipt match and saved allocation, including tenant/job on every source. Missing proof yields false with an explicit explanation; malformed snapshots produce a typed error. Paid principal is zero unless both proofs hold. Success copies the saved allocation ID and numerator/denominator unchanged, including unreduced fractions. No allocator, rounding, rate, model input, fee computation, posting or external action exists here.

These are internal wire contracts, not authoritative source adapters. Schema-valid JSON cannot prove authenticity, current approval, lock ancestry, source completeness or freshness. The future caller must reconstruct these records under accepted authorization and source locks. This helper is not wired to any HTTP path or qualification writer and grants no fee entitlement. The other eight attribution conjuncts and reversal/refund/evidence freshness remain required downstream.

No migration, database schema/grant/catalogue change, backfill, shared barrel, UI, API, production activation or operational alert. Rollback: remove the unused helper and its tests before integration; no state exists to undo. Existing attribution/fee implementations and tests are unchanged. This leaf serializes with other work adding the same attribution module/integration-test file; coordinate those overlaps before merge.

## Acceptance and tests

- **SV6-06 — DEPENDENCY-BOUND.** Exact named pure test covers every commercial/account/invoice identity join, every target identity, non-approved and non-issued states, missing billing and unpaid billing. PostgreSQL file has the exact named regression using an actual legacy baseline invoice and no matching lock-bound catch line. It proves a negative source scenario only, once run. The real confirmed SV-5 catch → approval → lock-linked account revision → issued catch line positive journey remains unbuilt pending source-owner adapters.
- **SV6-07 — DEPENDENCY-BOUND.** Exact named pure test covers tenant/job/case/work/invoice/line/payment/movement/event/hash joins; pending, reversed, unidentified, duplicate-held, missing-match/allocation/movement and manual receipt; inconsistent receipt/matched amounts; zero movement/allocation; exact unreduced saved fractions and input/output immutability. PostgreSQL file has the exact named manual-receipt regression through the existing invoice repository, verifies no receipt match/allocation exists, and projects zero. Pending/duplicate positive-source journeys and real saved catch allocation integration remain dependency-bound.
- Pure malformed-boundary test rejects absent required fields, production mode, model/client authority, invalid tenants, case-variant UUIDs and invalid/overflow rationals.
- No skipped placeholder test is added. Importing the existing final-account-lock integration helper also registers its existing tests, following the invoice suite's established pattern; reviewer must account for this when running the file.

Every explicit proof guard was mutated individually: 57 diagnostic guards, billing→payment gate, and fail-closed parsing (59 mutants). All 59 runs exited 1 with actual failed tests; no syntax/tool failure counted as a kill. Source was restored in `finally`. Detailed guard/exit/log mapping: `/private/tmp/jg-sv6-06-07-mutations.json`; logs `/private/tmp/jg-sv6-06-07-mutant-01.log` through `-59.log`. These are local contract mutation results, **not PostgreSQL mutation execution**. Full persisted-source mutations remain reviewer/dependency evidence.

## Checks

Actual serial results follow. No install/download command used. Already-installed pnpm 10.28.1 is invoked through `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`; Node v24.17.0, Vitest 4.1.11. Checks run one at a time; Vitest maxWorkers=2, Turbo concurrency=1. Load checked before each heavy command; wait if above 20.

## Outstanding gates

Database/migration/browser suites **NOT RUN**: dispatcher's sandbox cannot bind localhost/start PostgreSQL; CI/reviewer must run them after dispatcher push. Full positive persisted proof, authorization, RLS and current-source locking are dependency-bound, not inferred from unit tests. No clean install was performed because installed dependencies were mandated.

Literal card browser assertions: **NOT BUILT / NOT RUN — UI parked**. SV6-10, SV6-16 and SV6-29: **INCOMPLETE — HELD**, outside this exact two-ID order. Q3 allocator prerequisites, remaining Q4/Q5/Q9 decisions, CH-7 ready rule and aggregate SV-6 acceptance are not waived. No SV6-BEN-Q4/Q5 acceptance claimed by this leaf. Independent recorded exact-commit model verdict and separate actor acceptance remain outstanding; builder cannot accept its own work.

## Mutation run receipt

Each removal below exited 1 with failed Vitest assertions. The focused pure suite was the executed test command; no database run is implied.

| Guard removed | Exit | Result |
| --- | --- | --- |
| `missing_billing_proof` | 1 | KILLED by tests |
| `commercial.tenantId` | 1 | KILLED by tests |
| `commercial.jobId` | 1 | KILLED by tests |
| `commercial.caseId` | 1 | KILLED by tests |
| `commercial.workId` | 1 | KILLED by tests |
| `commercial.scopeItemId` | 1 | KILLED by tests |
| `commercial.commercialRevisionId` | 1 | KILLED by tests |
| `commercial.approvalId` | 1 | KILLED by tests |
| `accountLine.tenantId` | 1 | KILLED by tests |
| `accountLine.jobId` | 1 | KILLED by tests |
| `accountLine.lockId` | 1 | KILLED by tests |
| `accountLine.accountRevisionId` | 1 | KILLED by tests |
| `accountLine.accountLineId` | 1 | KILLED by tests |
| `accountLine.scopeItemId` | 1 | KILLED by tests |
| `accountLine.commercialRevisionId` | 1 | KILLED by tests |
| `accountLine.approvalId` | 1 | KILLED by tests |
| `invoiceLine.tenantId` | 1 | KILLED by tests |
| `invoiceLine.jobId` | 1 | KILLED by tests |
| `invoiceLine.invoiceId` | 1 | KILLED by tests |
| `invoiceLine.invoiceLineId` | 1 | KILLED by tests |
| `invoiceLine.accountRevisionId` | 1 | KILLED by tests |
| `invoiceLine.accountLineId` | 1 | KILLED by tests |
| `invoiceLine.scopeItemId` | 1 | KILLED by tests |
| `invoiceLine.commercialRevisionId` | 1 | KILLED by tests |
| `invoiceLine.approvalId` | 1 | KILLED by tests |
| `commercial.status` | 1 | KILLED by tests |
| `invoiceLine.status` | 1 | KILLED by tests |
| `missing_payment_proof` | 1 | KILLED by tests |
| `missing_movement_proof` | 1 | KILLED by tests |
| `movement.tenantId` | 1 | KILLED by tests |
| `movement.jobId` | 1 | KILLED by tests |
| `movement.zero` | 1 | KILLED by tests |
| `movement.state` | 1 | KILLED by tests |
| `movement.identity` | 1 | KILLED by tests |
| `movement.duplicateHeld` | 1 | KILLED by tests |
| `receipt.tenantId` | 1 | KILLED by tests |
| `receipt.jobId` | 1 | KILLED by tests |
| `receipt.invoiceId` | 1 | KILLED by tests |
| `receipt.amountPence` | 1 | KILLED by tests |
| `missing_match_proof` | 1 | KILLED by tests |
| `match.tenantId` | 1 | KILLED by tests |
| `match.jobId` | 1 | KILLED by tests |
| `match.paymentId` | 1 | KILLED by tests |
| `match.accountId` | 1 | KILLED by tests |
| `match.settledEventId` | 1 | KILLED by tests |
| `match.matchedPence` | 1 | KILLED by tests |
| `missing_allocation_proof` | 1 | KILLED by tests |
| `allocation.zero` | 1 | KILLED by tests |
| `allocation.tenantId` | 1 | KILLED by tests |
| `allocation.jobId` | 1 | KILLED by tests |
| `allocation.caseId` | 1 | KILLED by tests |
| `allocation.workId` | 1 | KILLED by tests |
| `allocation.invoiceId` | 1 | KILLED by tests |
| `allocation.invoiceLineId` | 1 | KILLED by tests |
| `allocation.paymentId` | 1 | KILLED by tests |
| `allocation.movementId` | 1 | KILLED by tests |
| `allocation.movementHash` | 1 | KILLED by tests |
| `billing_payment_gate` | 1 | KILLED by tests |
| `missing_proof_schema` | 1 | KILLED by tests |

## Final command results

`PINNED_PNPM` below means `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. Turbo subprocesses used a temporary PATH shim invoking that same installed pin. Initial typecheck used the host child launcher, stalled and was interrupted; although the shell returned 0 after shutdown, only two cached tasks had completed, so that attempt is **not a pass**. The final pinned rerun completed all seven tasks. No package was downloaded or installed.

| Command | Actual result |
| --- | --- |
| `PINNED_PNPM typecheck --concurrency=1` with pinned child PATH | PASS, exit 0, 7 successful tasks, 2 cache hits. Log `jg-sv6-06-07-typecheck-pinned.log`. |
| `LANE_BASE_REF=origin/main PINNED_PNPM lint --concurrency=1` | HOLD, exit 1: core purity passed, lane checker rejected the 12 inherited SV6-01/SV6-05 files. Package checks do not run after this early failure. Log `jg-sv6-06-07-lint-final.log`. |
| `LANE_BASE_REF=origin/main PINNED_PNPM lint:lanes` | HOLD, exit 1: same inherited parent delta. Log `jg-sv6-06-07-lanes-final.log`. |
| `PINNED_PNPM --dir packages/core exec vitest run --maxWorkers=2 <up to three src files>` | PASS, all 43 serial batches, exit 0 each: 127 files / 3,012 tests. Includes the final 3 new tests and unchanged attribution, allocation, v1/v3 money and SV6-05 regressions. Exact commands/results in `jg-sv6-06-07-units.json`; logs `jg-sv6-06-07-unit-01.log` through `-43.log`. |
| `CIRCLE_NODE_TOTAL=2 PINNED_PNPM build --concurrency=1` | PASS, exit 0: 7 tasks, 2 cache hits, 1m1s. Existing Next/autoprefixer/dependency-tracing warnings and sandbox Turbo cache IO warnings; no source/compiler failure. Log `jg-sv6-06-07-build.log`. |
| `PINNED_PNPM openapi:check` | Sandbox launcher failure, exit 1: tsx IPC listen EPERM, no schema comparison. Log `jg-sv6-06-07-openapi.log`. |
| `node apps/api/dist/generate-openapi.js --check` | Diagnostic exit 1: compiled execution reported stale snapshot. This is not the package's source/tsx check; no snapshot edited. Log `jg-sv6-06-07-openapi-compiled.log`. |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | PASS, exit 0: same source generator/check argument and installed tsx transform, without CLI IPC listener. Log `jg-sv6-06-07-openapi-import.log`. |
| `PINNED_PNPM exec turbo run lint --concurrency=1` | PASS, exit 0, all 7 package lint tasks, 2 cache hits. Separate diagnostic completion of package checks does not turn root lane lint green. Log `jg-sv6-06-07-package-lint.log`. |
| `node tools/money-arithmetic-lint.mjs` | PASS, exit 0. Log `jg-sv6-06-07-money-lint.log`. |
| `node tools/commercial-boundary-lint.mjs` | PASS, exit 0. Log `jg-sv6-06-07-commercial-lint.log`. |
| `git diff --check` plus explicit new-file whitespace/scope comparison | PASS, exit 0: exactly five new files, no existing tracked-file modification; terminal newlines and no trailing whitespace. |

All log filenames above are under `/private/tmp/`, local session artifacts, not CI URLs. Load observed below 20 for these commands (roughly 5–16); batch runners also check load before each run. Root test, DB/migration/browser and eval suites were not executed. No AI/prompt/matching policy changed; no eval acceptance is claimed.

The initial lane file incorrectly listed itself in `allow`; formal lint refused this. Corrected to the established SV6-05 convention: the four task files are explicit, and the branch's own lane JSON is implicitly editable by the policy. The final policy grants exactly these five effective files. Subsequent formal lane failures concern inherited parents only. The shared assignment register was never touched, and the lane was not expanded to own the parents.

The twelve inherited files are the two parent lane files, two parent contracts, two parent receipts, three recovery-attribution-persistence files and three recovery-fee-illustration files listed in the lane log. Dispatcher must land/rebind the parent comparison and obtain fresh formal lane evidence; build-ahead authority does not waive this check.

Intended commit subject/body is saved at `/private/tmp/jg-msg-sv6-06-07.txt`. Dispatcher commits after exit. No independent review or technical acceptance has been recorded.

## Changed-file content binding

The receipt is not self-hashed. All other files are new and bound below; final HEAD remains the issued parent.

- `config/lanes/sv6-06-07.json` — SHA-256 `84b4dcc5a6878e7330dea6311cc473b71b547bef57e15fd8adf825b5656a75f7`
- `packages/core/src/recovery-attribution-illustration.ts` — SHA-256 `2e6fa1820cf62d6069333583ca776bca29247811f4a920846f2b24288aff6160`
- `packages/core/src/recovery-attribution-illustration.test.ts` — SHA-256 `1563ccee3c8e21521cc21a38d94742e27bb054f8fc6205cc8004509fbac0fa9f`
- `packages/db/test/recovery-attribution.integration.test.ts` — SHA-256 `a7a9eac2a6ab3c3a15b180263834522a1374e68284f0a292fdbc47f6687c30af`
