# ENT-4a builder receipt

Date: 5 October 2026. Builder: Codex. Task: issued §9.2 ENT-4a pure site-origin and contractor-fee domain. Status: **implementation delivered; technical acceptance HOLD** pending dispatcher commit, exact-commit CI, independent Claude verdict and separate acceptance. This document is a builder run receipt, not an independent review or approval.

## Revision and dispatch evidence

- Repository: `ben2harwood-lgtm/jobguard`; worktree: `.worktrees/ent-4a`; branch: `codex/sandbox/ent-4a`.
- Exact base and unchanged current HEAD: `a5ed99a8f7b4e76925c35297dda0d06d6f8834ab`. New implementation commit: **not yet created; dispatcher owns commit**. No claim below is bound to an invented new SHA.
- Read-only local ref/object inspection and GitHub connector comparisons established the integrated base. GitHub `main` was rechecked after final implementation and remains identical to that base (ahead/behind 0).
- SH-1 #99 is merged at that base. Its verified implementation head `a2ed4eca3506e33703d4e59168e28af4aa69fbca` is an ancestor; #99's later documentation head is not confused with the verified implementation head. Adoption #93, `3e0764b639e5a0cdeb1ada1d17dadb90cc2ba24a`, is also an ancestor. This work did not use the stale `694e9e1` checkout.
- Dispatch checks found #97, #98, #100, #103, #104, #106, #107 and #108 open and unmerged. None is a stack base. Read §12.2/12.3 and SH-1 acceptance §1: Ben's 5 October merge-ahead ruling allows already-merged graph dependencies to govern readiness. ENT-4a depends on SH-1; ENT-1/2/4b are outside this leaf.
- Read AGENTS.md rev 3.0, BUILD_PLAN §§2.3–2.4, §8 SH-1, §§9.1.1–9.1.13, §9.2 ENT-4a, §§12.2/12.3, and `docs/contracts/shared-money-origin-v1.md`. Root CLAUDE.md is absent.
- No direct git commands, commit, add, checkout, push, merge, PR creation or deployment were performed. Existing required verification tools use their own read-only git inspection or disposable fixture repositories; no real-repository git mutation was requested.

## Exact changed files and ownership

The first change appended only the issued `ent-4a` lane. All implementation and test edits are within its exact allow-list:

1. `config/agent-lane-assignments.json`
2. `packages/core/src/index.ts`
3. `packages/core/src/enterprise-domain/index.ts`
4. `packages/core/src/enterprise-domain/contracts.ts`
5. `packages/core/src/enterprise-domain/transitions.ts`
6. `packages/core/src/enterprise-domain/origin.ts`
7. `packages/core/src/enterprise-domain/fee.ts`
8. `packages/core/src/enterprise-domain/transitions.test.ts`
9. `packages/core/src/enterprise-domain/origin.test.ts`
10. `packages/core/src/enterprise-domain/fee.test.ts`
11. `packages/core/src/enterprise-domain/boundaries.test.ts`
12. `docs/verdicts/ENT-4a/BUILDER_RECEIPT.md`

The new directory is disjoint from SV-1's shadow-domain directory. **The core index and lane registry are shared overlaps, not disjoint files.** Codex edited them sequentially in this worktree; no subagent edited them. The index receives only `export * from "./enterprise-domain/index.js";`. Existing registry entries remain unchanged. The dispatcher owns cross-lane exclusive editing/commit integration and must serialize these append-only registrations with SV-1 and other lanes.

Supplementary scope audit: hashed every one of the 685 tracked entries against the read-only git index; inventoried untracked visible files against the exact lane; compared protected sources with exact-base GitHub blobs. Only the listed files differ. Original v1 fee module/tests, activation module/tests, SH-1 implementations/tests and existing generic architecture tests are byte-identical. This audit supplements, and does not replace, committed lane-lint evidence.

SHA-256 of the sorted path/content-hash manifest for the eleven changed source/test/registration files, excluding this receipt: `3be9bb785a951b0ac1d40ff4f6069e3c28f0cdbf79d4ca90a040f9a0ad9ab6d5`. Manifest and audit script remain in `/private/tmp/jg-ent-4a-source-manifest.txt` and `/private/tmp/jg-ent-4a-scope-audit.py`.

## Implementation and deliberately limited authority

Strict versioned Zod boundaries separate `EnterprisePromptProposal` from supplied enterprise facts. The new prompt type has citations and producer versions but no origin, price, approval or fee fields. Existing gateway proposal/suggestion-price contracts are unchanged. Fact parsing checks shape, track, identities and relationships; **it does not prove authentication, grant validity, server provenance, verified evidence, settlement, database isolation or authorization**. Future authenticated server composition must supply those facts. Generated mode/gate values in tests do not open any runtime gate.

Pure transitions project the §9.1.4 lifecycle, including creation, ordered approval assertions, immutable pricing revisions, duplicates, export, billing rejection, partial/full credits and payment reversals. Grant-holder, tenant/job, assignment, raiser, pending-step, role and exact revision/hash/value/rule guards apply without owner/admin bypass. A recorded contract-rule step is a supplied fact, never a human role. Failures preserve input snapshots. Enterprise lifecycle refuses small-builder jobs.

Origin uses SH-1's track/origin schemas and raising-command provenance. Effective origin is earliest server instant, then lowest extra ID, independent of canonical selection and array order. Timezone representations normalize; fractional instants retain exact ordering; labelled device capture metadata never orders entitlement. The origin-time order revision cannot be replaced by later instructions. Site origin requires the allowed contractor kind, new/excess coverage, capture evidence, resident proof where captured, and a properly confirmed earlier prompt when applicable. Duplicate groups count once; candidate ambiguity blocks export; post-export repair requires an exact supplied approved reconciliation fact and performs no repair service.

Qualification is exact `max(0, min(approved, invoiced − credited, settled − reversed))` behind the complete origin/approval/export/matching/payment/mode/gate predicate. Pending facts and excluded states contribute zero or fail typed validation for inconsistent domain input. Statement and receipt assertions reject reuse of one export or billed invoice line by different canonical extras. Invoice identity is retained separately from invoice-line identity.

Receipt allocation delegates directly to SH-1 `allocateReceiptToLines`; the wrapper asserts complete bindings and original reversal balances/ratios. Order and other non-extra lines stay in the gross denominator and have zero enterprise contribution. Statement derivation delegates cumulative half-even calculation to SH-1 `calculateCumulativeFee`, uses its bounded rational helpers and existing `allocateMoney`, and retains the 1,000,000,000,000p magnitude limit. Agreement selection occurs at effective origin; versions never reprice an existing group. Only `on_payment` is accepted; minimum commitments, onboarding fees, volume bands and invoice-with-true-up are refused.

Per-agreement non-posting sections preserve prior net postings, exact contribution changes, stable statement pennies, statement/input hashes, period, recorded cutoff and source/approval references. Signed changes conserve the cumulative delta, including the one-penny carry possible between two half-even rounded cumulative totals. Negative deltas need a linked prior derivation. Zero results remain identifiable without a journal. Later-recorded facts stay out of earlier statements despite earlier effective dates. Every derivation has `postingAuthorized: false`; positive calculation creates no approval. Reference calculation is explicitly non-posting; pilot output says **“Illustration — no charge”**. No journal, statement scheduler, executor or production capability is introduced.

## Acceptance-to-test mapping

| Acceptance | Executed automated coverage |
| --- | --- |
| §9.1.4 all-state/all-command/all-role transitions | `transitions.test.ts`: independent normative rows, 13 states including absent × 14 commands × 10 roles = 1,820 cases; every failure checks unchanged input. Separate 12 states × 5 billing events × 10 roles = 600 cases. |
| Creation/provenance, covering grants, no owner/admin bypass | Transition matrix plus grant-holder, assignment, missing/out-of-scope grants, creation command maps, stale revision/hash and contractor-track refusal. |
| Ordered approval/price guards | Pending holder, ordered/distinct actors, no raiser/self approval, no actor in two steps, wrong revision/hash/value/rule/index, configured alternates, recorded contract-rule step, confirmed/unpriced pricing, server-SoR operative exception, before/after-work server timing. |
| Lifecycle exclusions and immutable revisions | All withdrawal reasons; raiser before any step; new revision voids approvals; export only canonical/current/satisfied; unresolved duplicates and unmatched imports refused; billing rejection; full credits terminal; partial credits preserve amount changes; reversals return to billed/part_paid. |
| Full `fee_bearing` conjunction and §9.1.11 exclusions | `origin.test.ts`: 24,192 generated kind/track/coverage/evidence/resident/approval/billing/payment/mode/gate cases; additional approval/revision/requirement/export/match dimensions. Order/instructed, office/client, zero/omission, withdrawn/rejected/billing_rejected, unexported/unbilled, unpaid/pending, credited/reversed, duplicate, over-invoiced, unconfirmed prompt, small-builder, synthetic/pilot and closed-gate exclusions. |
| Effective origin and duplicate properties | Origin tests: permutations, canonical changes, equal/timezone/fractional instants, lowest-ID ties, ignored device clocks, order-revision immutability, earlier office origin, prompt predates every member, graph/self-link/cross-job refusal, coalescence without new origin or input mutation; exact post-export repair authorization guards. |
| Receipt precedence/composition/reversal | `fee.test.ts`: real shared allocator via enterprise wrapper; explicit/separate/pro-rata precedence, full composition with order denominator, per-line mixed ratios, temporal line cutoff, unknown/incomplete/unmatched/over-allocated refusal, refunds/credit/reversal original source/ratios/remaining balances. |
| Exact Q/cumulative fees and versions | ENT-F1–12 below, plus 108 generated approved/invoiced/paid/credit cap cases; receipt split/combined/permuted sequences update outstanding balances and telescope deltas; 8/100 version, zero rate, version mismatch, unsupported formulas, rational/aggregate overflow and typed refusals. |
| Signed statement conservation | Stable largest remainders, negative compensation, mixed signs, zero, permutations; 256 generated old/new contribution combinations with cumulative half-even carries; exact prior postings after compensation; negative link required. |
| Cutoff and immutable statement references | ENT-F12, approval/revision/export recorded-cutoff guards, immutable output snapshots, exact current/prior/change Q, agreement/input hash/period/cutoff, source/rule/revision/approval references and original compensation IDs. |
| Proposal boundary | `boundaries.test.ts`: compile-time `expectTypeOf`/`@ts-expect-error` checked by core tsc; strict runtime rejection of forged authority/unknown fields; strict fact/proposal separation, currency/version/mode/identity/hash/revision and photo tenant/job/scope refusals. |
| Pure imports and reuse | New-subdirectory AST/source architecture assertions verify direct SH-1 imports, no competing cumulative fee/receipt allocator, only approved pure imports, no network/DB/vendor/platform APIs and no binary-float monetary operators. Existing top-level architecture tools pass but are not claimed alone to inspect this subdirectory. |

### Generated ENT-F arithmetic

All cases run through enterprise qualification/reference derivation and shared receipt allocation, not only hand-supplied Q. VAT 20% and mixed gross/net ratios are fictional fixture ratios, not approved tax policy.

| Fixture | Asserted exact result (pence) |
| --- | --- |
| ENT-F1 | Approved/billed 15,000; gross receipt 18,000: Q 15,000; F/delta +1,500. |
| ENT-F2 | Order 100,000 + extra 24,000, gross 148,800. Receipt 50,000: extra Q 250,000/31; F/delta +806. Remaining 98,800: Q 24,000; F 2,400; delta +1,594. |
| ENT-F3 | F1 plus net credit 5,000: Q 10,000; F 1,000; linked delta −500. |
| ENT-F4 | F1 plus full original payment reversal: Q/F 0; linked delta −1,500. |
| ENT-F5 | Approved 15,000, invoice/paid 20,000: Q 15,000; F 1,500. |
| ENT-F6 | Approved 15,000, invoice/paid 12,000: Q 12,000; F/delta +1,200. |
| ENT-F7 | Two distinct operative records collapse to one 15,000 group; Q 15,000, F 1,500, one statement line. |
| ENT-F8 | Paid office 50,000, client instruction 80,000 and order line: Q/F 0. |
| ENT-F9 | X raised 10 November binds v1 10/100; Y raised 16 November binds v2 8/100 effective 15 November; both receipts 20 November: separate sections 1,500 + 1,200. Later X credit compensates v1. |
| ENT-F10 | Three 5p extras: Q 15p, F 2p; stable IDs get 1p, 1p, 0p. |
| ENT-F11 | Q 5/15/25p yields half-even F 0/2/2p; two cumulative 5p receipts yield F 1p. |
| ENT-F12 | October statement remains unchanged after November-recorded, earlier-effective credit; November derives linked compensation. |

Fixture identity: deterministic UUIDs with prefix `10000000-0000-4000-8000-`, generated tenant/job/scope/command/grant IDs, placeholder SHA-256-shaped hashes and strings such as `fictional-invoice`/`generated-receipt`. Multi-extra fixtures have distinct scope/revision/export/invoice-line/source identities. Dates are synthetic October/November 2026. All fixture code is inside the four allowed `.test.ts` files; there is no real customer PII, binary artifact, live evidence, real settlement, provider call or approved agreement.

## Tests-first evidence

Before implementing domain behavior, the four test files and an unimplemented module shell were written. First exact targeted run at **19:32:07 BST**:

```text
pnpm --filter @jobguard/core exec vitest run src/enterprise-domain/transitions.test.ts src/enterprise-domain/origin.test.ts src/enterprise-domain/fee.test.ts src/enterprise-domain/boundaries.test.ts
Exit 1
Test Files 4 failed (4)
Tests 37 failed | 1 passed (38)
```

The first counts include origin helper tests registered on import in other files; the final testPath guard registers each suite once in both source and compiled runs. This was an executed failing run, not proposed drafting evidence. Log: `/private/tmp/jg-ent-4a-red.log`; SHA-256 `26f483e3c7049193460b633db10be839c4b542f20dc0f2668b33beee3d176306`.

Subsequent failing assertions led to fixes, including a half-even carry (20:08:27, fee test exit 1, one failed/16 passed), duplicate export-line ownership (20:18:50, exit 1, one failed/18 passed), and wrong-track lifecycle (20:25:26, transition test exit 1, one failed/8 passed). Logs: `/private/tmp/jg-ent-4a-half-even-carry-red.log`, `jg-ent-4a-line-matching-red.log`, `jg-ent-4a-track-red.log`. Grant-holder and original-reversal/source assertions also failed before their fixes. Existing earlier tests were not deleted or weakened.

Final exact targeted run at **20:27:44 BST**, exit **0**: **4 files, 39 tests passed**. Log `/private/tmp/jg-ent-4a-targeted-final.log`; SHA-256 `8f9d6865ab4ce069b6c20ed6b78be87a1179c40f19d2c8dd42fb34b0cb14984f`.

## Actual commands and outcomes

Commands ran from repository root using the existing installed dependencies. A temporary PATH shim selects cached **pnpm 10.28.1**. Installed Node is **24.17.0**, while `.nvmrc` and CI pin **24.15.0**: local evidence is not a clean pinned-runtime install. No package download, manifest, lockfile or pin changes were made. An initial default pnpm 11 launcher probe was interrupted (exit 130); its generated empty cache metadata was moved out of the repository to `/private/tmp` after verifying it contained no downloaded packages.

| Command | Actual exit and result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **Not run**: later explicit dispatcher instruction says dependencies are installed and not to download packages. Clean pinned-install evidence remains for CI. |
| Exact four-file targeted command above | First **1**; final **0**, 39 tests. |
| `pnpm --filter @jobguard/core typecheck` | **0**, including compile-time negative proposal assertions. Earlier implementation iterations had real type errors (exit 2), corrected without changing package configuration. |
| `pnpm --filter @jobguard/core test` | **0**, 82 files/704 tests after build; includes source and compiled copies, **not 704 unique source tests**. |
| `pnpm --filter @jobguard/core exec vitest run src` | **0**, 41 files/**352 source tests**, including 39 new tests and earlier core regressions. |
| `node --test tools/shared-money-origin.test.mjs tools/core-purity.test.mjs` | **0**, 4 tests; generic tools unchanged. |
| `pnpm typecheck` | Final **0**, 7/7 tasks. Concurrent run during Next regeneration had exit **2** for missing `.next/types`; rerun after build passed. |
| `LANE_BASE_REF=origin/main pnpm lint` | **1**: core purity passes; lane validator refuses HEAD/base self-comparison before package lint. This is not reported as green lint. |
| `pnpm exec turbo run lint` | Final **0**, 7/7 package tasks. Concurrent attempt during Next regeneration had exit **2**, then passed after build. Supplement only, not a substitute for root lane checks. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **1**: “Missing branch or self-comparison range; refusing a misleading pass.” HEAD still equals integrated main because dispatcher has not committed. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs --lane=ent-4a` | **1**, same legitimate self-comparison refusal. No base/ref/tool weakening. |
| `node tools/core-purity-lint.mjs` | **0**, 84 TypeScript files. |
| `node tools/money-arithmetic-lint.mjs` | **0**. |
| `node tools/commercial-boundary-lint.mjs` | **0**. |
| `pnpm test` | **1**. Root tool tests 42 pass; core 704 pass; AI 72 pass; API 107 pass/1 health-test failure with `listen EPERM 0.0.0.0` and null server address. PostgreSQL integration setup cannot run and related cases are skipped/cancelled; aggregate run is not green. |
| `pnpm build` | **0**, 7/7 tasks including Next production build. No deployment occurred. |
| `pnpm openapi:check` | **1**, existing tsx CLI cannot bind its IPC pipe (`listen EPERM`). |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | **0**, existing generator's actual check via a socket-free loader. API/generated specification unchanged. This supplements the blocked exact launcher. |
| `pnpm eval` | **0**, 3 files/72 deterministic fixture tests. Not a live-model evaluation. |
| `pnpm --filter @jobguard/web test` | **0**, 8 files/63 units; no browser journey claim. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` | **0**, 14 files/107 socket-free units. Supplementary explicit run; required suite and failing health test remain unchanged. |
| `pnpm --filter @jobguard/db exec vitest run src` | **0**, 1 file/3 pure fixture units. Not PostgreSQL integration proof. |
| `python3 /private/tmp/jg-ent-4a-scope-audit.py` | **0**: exact allowed changes, protected source equality, append-only registrations; excludes ignored generated build outputs. Not committed lane acceptance. |

Final logs remain under `/private/tmp/jg-ent-4a-*-final.log`; supplemental unit logs are `jg-ent-4a-web-unit.log`, `jg-ent-4a-api-unit.log`, `jg-ent-4a-db-unit.log`. First-run and intermediate red logs remain separately. Passing build/typecheck contain sandbox telemetry IO warnings but exit 0. Build and final root type/lint were serialized after the transient generated-type race.

No separate `pnpm test:db`, `pnpm test:migrations` or `pnpm test:e2e` run was made: dispatcher states this sandbox cannot start PostgreSQL or bind localhost; root test independently exhibits those limitations. Their existing mandatory CI regressions remain intact. **There is no GitHub CI evidence for the new exact commit yet because it does not exist.** Dispatcher must run/record those suites, full root test/lint/OpenAPI and pinned-runtime/install checks after commit/push. Successful baseline or dependency CI is not claimed as ENT-4a CI.

## Contracts, compatibility and remaining gates

- Migration: **none**, as issued pure-core scope and merge-ahead ruling permit. No reservation taken, schema/backfill/rollback change, DB table, RLS/grant, journal or persistence path. If future persistence is needed, it needs a separately issued leaf/reservation.
- Affected invariants: exact-origin/track history (§5.2/5.16), supplied authorization assertions (§5.3), exact money/qualifying principal (§5.5/5.6), evidence relationships (§5.8), proposal separation (§5.9), fee-free simulation/pilot (§5.10), no new tax/cap/credit/band policy (§5.15). No claim of database locks, RLS, audit-chain durability, idempotent network effects or trusted provider integration follows from these pure tests.
- Backwards compatibility: append-only core exports; v1 fee/activation and shared kernels/tests unchanged; no existing AI gateway price fields altered; no application workflows/persistence modified. New schemas are versioned boundaries for future enterprise callers, not a server implementation.
- C1/C2/C7: no application/UI/persistence slice or browser spec applies to this card. C3/C4/C5: pure simulation, exact-money and supplied-fact guards covered; no live server authorization/durable-effect claim. C6/C8: executable domain/schema/property/architecture checks plus unchanged mandatory CI regressions; missing exact-commit CI evidence is HOLD.
- New DB/migration, native/device/browser and live-model acceptance work is inapplicable to this pure leaf. No existing introduced suite has been made optional. No prompt/gateway/model change or live evaluation is introduced.
- Operational alerts: no new executor, network operation, scheduled job or durable posting; no new operational alert integration applies. Typed refusal paths are available to future server composition.
- ENT-4b persistence, ENT-5 approval execution, ENT-6 import/reconciliation, ENT-7 statement authorization/posting are **not satisfied** by this implementation. D16/D02, G4-C, and all real-data/provider/device gates remain unresolved and closed; synthetic supplied facts are not decision approvals or activation.
- Independent **Claude verdict bound to the dispatcher-created exact commit** remains missing; separate technical acceptance remains missing. Builder does not self-accept. All green results here are deterministic local checks, not model verdicts or professional/commercial sign-off.

Intended commit message is supplied separately at `/private/tmp/jg-msg-ent-4a.txt`. Dispatcher owns commit/push/review coordination; builder has not dispatched this work.
