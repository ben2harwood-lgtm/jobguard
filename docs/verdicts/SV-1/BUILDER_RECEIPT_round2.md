# SV-1 builder receipt — round 2, 7 October 2026

Builder: Codex. Repair of PR #111 on `codex/sandbox/sv-1`, based on **05117f3e40657165462d1df4ec42f0c4ca5c016f**, against the supplied independent Opus REPAIR verdict. Changes remain uncommitted in the issued worktree. This is execution evidence, **not a new independent verdict or technical acceptance**.

## Finding → fix → test

| Finding | Repair or disposition | Regression evidence |
| --- | --- | --- |
| P1-1 catch principal bypass / double count | The principal-entry boundary rejects `missed_variation_final_account`, including ineligible catches. Catch principal comes only from SH-1 receipt-to-line allocations. An identity `(category, caseId, workId, lineId)` cannot enter through both routes, even with different proof references. The earlier proof-reference guards remain. | `success-fee.test.ts`: P-A2, P-A1 and a non-catch mixed-route alias attack failed on 05117f3; pass on the repair. F4 remains exactly **2,000,000/43p**, fee **4,651p**. |
| F9 | Ties now use allocation events; the split scenario has **two receipts on one line**. | Q **5/15/25p** gives F **0/2/2p**; two 5p receipts give Q **10p**, F **1p**. These allocation fixtures already passed the original SH-1 kernel; the bypass refusal above supplies the defect's red evidence. |
| P2-1 same line on two invoices | Balance continuity uses line ID alone and rejects a changed invoice ID. An exact running net allocation per line must stay between zero and its original net. | P-A3 failed on 05117f3; passes now. Full/partial/split receipt and reversal assertions retain their exact expected values. |
| P2-2 receipt order | Receipt instants cannot decrease. SH-1's comparator is private at `packages/core/src/receipt-allocation.ts`; SV-1 delegates to its exported allocator's exact line-cutoff check using an internal explicit zero-share probe. No timestamp parser, allocation or rounding logic was copied; no SH-1 file changed. Reversals must follow their original, retain its cutoff, and never reset the latest receipt time. | Four backwards-order cases (seconds, submillisecond fractions, offsets and a date boundary), plus reversal chronology, failed on 05117f3; pass now. Equal instants expressed with offsets/trailing fractional zeros, F5 and equal-timestamp permutations pass. **No item was skipped for an unavailable comparator export.** |
| P2-3 duplicate merge | Both expected revisions are mandatory. Both signals must be candidate, held or surfaced early; later dispositions/history are refused without mutation. Reconciled builder-captured/scope/final-account results cannot be overwritten. Early disclosure carries onto the primary permanently. | Eight state/disposition negatives and missing-revision refusal failed before implementation. The final **9×9** state-pair table, stale revision on either signal, disclosure and immutable-input checks pass. |
| P3 dispute review | A review requires an immutable `attribution_disputed` exclusion. A valid dismissed review never qualifies. Permanent exclusions still defeat a confirmed review. | Orphan confirmed/dismissed review test failed on 05117f3; passes now. All **1,024** truth assignments and existing permanent-exclusion assertions remain. |
| P3 D13 | Significance is required only when rule 2's customer-request and prior-agreement conditions both hold. Independent safety/dispute/duty rules do not require it. | Missing-significance safety test failed on 05117f3; passes now. A nine-case confidence/value matrix verifies actual early surfacing with low confidence and zero/unknown value; injected authority fields still refuse. |
| P3 evaluation citations | Removed the fallback `fixture://evidence/6`. Every applicable A–R row supplies references from its actual signal, attribution, match or fee fixture output, checked against a separately declared fixture inventory. Q remains explicitly unevaluated here. | The strengthened inventory assertion failed on the original fixture rows; the repaired gate passes, including fabricated citation and cross-job negatives. |
| P3 F8 | Represents an invoiced 80,000p catch with 96,000p still outstanding, pending proof and **zero settled cash**. The synthetic zero settlement observation carries the invoice snapshot; it is not a customer payment. | Q/F/delta are zero and allocations are empty. This is fixture coverage, not a previously broken arithmetic rule. |

## Reversal dispositions

- **Explicit reversal of a pro-rata receipt is not a defect.** §10.3.2 says item-specific first, then pro-rata across settled lines; binding the refund to the original allocation rule would contradict it. A new test pays the blended invoice pro-rata, then explicitly refunds the catch: Q **20,000p**, F **2,000p**, delta **−2,000p**. Original per-line settled-balance caps remain. Reliable explicit evidence and CH-6's advisory treatment of allocations avoiding catches remain later trust-boundary responsibilities.
- **Partial principal reversal is supported by representation:** fully reverse the original, then add the reduced recovery with new immutable proof/source references. Tests cover **32,000→24,000p** (delta **−800p**), repeated over-reversal refusal, and consumed credit **30,000→20,000p**, below the 25,000p threshold (Q/F **0**, delta **−3,000p**). These tests passed the baseline; no new reversal-amount field or policy was invented.
- **Payment after refund remains fail-closed.** A refund reduces original settled allocations but does not restore the current outstanding balance. The F11→fresh-payment test explicitly asserts refusal. **M4-8-S** must define and persist restored receivable/refund/credit semantics before admitting that sequence. This known limitation was documented rather than silently changing the accounting contract in this leaf.

## Red and green receipts

Tests were added before the production repair. The first run on the unchanged 05117f3 production sources exited **1**: **21 failed, 72 passed** in ten domain files. Each implementation finding above has substantive red evidence in `/private/tmp/sv-1-round2-red.log` (unexpected acceptance, missing safety firing or unsupported fixture citation).

F8/F9/F12 were then expressed through allocation, preserving every expected Q/F/J/delta assertion; the targeted baseline run exited **1** with **9 failed, 8 passed, 30 filtered** (`sv-1-round2-red-fixtures.log`). Disposition-only reversal tests and the corrected tie fixtures passed; they are not claimed as new red defects.

A separate temporary snapshot copied the core source tree, reused installed dependencies, and replaced **all shadow production files** with `git show 05117f3:<path>`, leaving the final regression tests in place. It exited **1**: **25 failed, 80 passed** (`sv-1-round2-red-final.log`). Some additional failures are expected compatibility failures from the newly required merge-revision fields; the first run proves the original state defects without those fields. No Git checkout, commit or reset was used.

The first repaired domain run had **94 passed / one timeout** in the existing 100-case split property test. Its work is now divided into ten batches, preserving the same seed, all 100 cases and every assertion. **No timeout was increased, test removed, assertion weakened or protected test edited.** The subsequent domain run passed **104/104**; the added confidence matrix brings final domain coverage to **105 tests**.

## Commands actually run

Commands use the existing cached pnpm **10.28.1** via `PATH=/private/tmp/sv-1-bin:$PATH`; no install/download occurred. Node is **24.17.0** (`.nvmrc` remains 24.15.0). Logs are `/private/tmp/sv-1-round2-*.log`.

| Command | Exit / observed result |
| --- | --- |
| `pnpm --filter @jobguard/core exec vitest run src/shadow-domain` on original production | **1**, 21 failures / 72 passes; substantive first red run |
| `pnpm --filter @jobguard/core exec vitest run src/shadow-domain/success-fee.test.ts -t 'F8\|F9\|F12\|round2'` on original production | **1**, 9 failures / 8 passes / 30 filtered |
| `pnpm --dir /private/tmp/sv-1-round2-red-05117f3/packages/core exec vitest run src/shadow-domain --maxWorkers=1` | **1**, final-tests/baseline-production snapshot: 25 failures / 80 passes |
| `pnpm --filter @jobguard/core exec vitest run src/shadow-domain` after repair, before batching | **1**, 94 passes / one property-test timeout |
| `pnpm --filter @jobguard/core exec vitest run src/shadow-domain --maxWorkers=1` after batching | **0**, 10 files / 104 tests, before the added confidence matrix |
| `pnpm typecheck` | **0**, 7/7 workspace tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | **0**, purity/lane/money/commercial checks and 7/7 package tasks; no self-comparison refusal |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **0**, existing sv-1 lane, working-tree changes included |
| `pnpm build` | **0**, 7/7 tasks; existing Next workspace/CSS and Turbo cache-permission warnings |
| `pnpm --filter @jobguard/core build` | **0**, final core sources/tests compiled after the last test strengthening |
| `pnpm --filter @jobguard/core test --maxWorkers=1` while building | **1**, 835/836 executions; one protected emitted SH-1 2,000-line stress timeout |
| Same full core command after build | **1**, 834/836 executions; protected SH-1 working-size test timed out in source and emitted copies |
| `pnpm --filter @jobguard/core test --pool=threads --maxWorkers=1` | **0**, 94 files / **836 executions**, all tests including protected SH-1; **19.99s**, no skips or timeout changes |
| `node --test tools/*.test.mjs` | **0**, 42/42 tooling tests |
| `node --test tools/shared-money-origin.test.mjs` | **0**, 3/3 tests |
| `pnpm eval` | **0**, 3 files / 72 deterministic AI fixture tests; not a live-model run |
| `pnpm openapi:check` | **1**, sandbox `tsx` IPC pipe `listen EPERM` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | **0**, same real generator/check without the CLI IPC server |
| `git diff --check` | **0** |
| `git diff origin/main --` the ten protected money/origin files and tests | **0**, empty diff; also unchanged against 05117f3 |

Default core discovery includes source and emitted test copies: **836 executions represent 418 distinct source tests**, not doubled coverage. The protected timeouts match the supplied review's host-load limitation; observed load averages were about **45/59/71**. The failed attempts are reported, not waived. The final thread-pool run passed all tests and retained the original five-second timeout. Final source and emitted domain suites each contain **105 tests**.

## Scope, compatibility and remaining gates

Only nine existing shadow-domain source/test files and this new receipt changed. Earlier work and the original receipt remain. **Migration: none.** No persistence, UI, provider, dependency, export, lane-registry, plan or decision edits; no new external actions or operational alerts. `fee.ts`, `activation.ts`, their tests and all SH-1 kernels/tests remain byte-identical to main. Exact rational/integer pence, tenant/job bindings, pure proposals, allocation hierarchy, cumulative half-even rounding, permanent capture/disclosure exclusions and pending-policy production disablement are preserved.

Boundary tightening: existing merge callers must supply both expected revisions; catch principal-entry callers must use allocation events; review callers must include real dispute history. There are no production callers/migrations added by this leaf. A final-account invoice/receipt snapshot is synthetic fixture evidence, not proof of settlement or authority.

Not run: frozen install (preinstalled dependencies/no downloads instructed); root `pnpm test`, PostgreSQL/migration/restore and browser/device suites (no subsystem changes, sandbox cannot bind localhost/start PostgreSQL; dispatcher must retain mandatory CI checks). No model/prompt/provider changed; no paid/live evaluation, real data, send, spending, production mode, policy approval, push, merge or PR creation occurred.

The original **SV-1.txt** was not found in the accessible project/temporary locations or Spotlight; a path was requested while work continued. This receipt does not claim a fresh read of that unavailable order. Current AGENTS, C1–C8, §§10.2–10.4, the original builder receipt and the supplied verdict were inspected.

Dispatcher still owns the commit and exact-head independent Opus review, separate technical acceptance and required CI evidence. D01/D02/D03/D12/D13 as applicable, G1 and G4-S remain unapproved. SV-2 owns persisted isolation/locks/coalesced uniqueness; CH-7/M4-8-S own live proof/admission/allocation and refund semantics; later command boundaries own authorization, audit and posting. This builder accepts none of its own work.

Intended commit message is written to `/private/tmp/jg-msg-sv-1.txt`.
