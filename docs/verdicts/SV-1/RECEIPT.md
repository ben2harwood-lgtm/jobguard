# SV-1 builder run receipt — 5 October 2026

Builder: Codex GPT-6.1 Sol, high reasoning. Pure-core small-builder leaf only. This is a builder receipt, **not an independent verdict, technical acceptance, policy approval or release**.

Implementation and local executable evidence are delivered in the working tree. Acceptance remains **held for the missing mandatory execution evidence**, dispatcher commit/diff binding, independent Claude review and separate acceptance. No git command was issued by the builder; no commit, push, rebase, merge or PR was made. Existing requested lint/test scripts internally invoke read-only git. Intended commit message: `/private/tmp/jg-msg-sv-1.txt`.

## Base, dependencies and shared editing ownership

- Prepared branch: `codex/sandbox/sv-1`. Read-only HEAD/ref-file inspection found both its branch ref and `origin/main` at `a5ed99a8f7b4e76925c35297dda0d06d6f8834ab`, matching the dispatcher's prepared base. This is not the stale `694e9e1` checkout from the preparation packet.
- Read AGENTS rev 3.0; no root CLAUDE.md exists. Read BUILD_PLAN §§2.3–2.4, SH-1, §§10.2–10.3, SV-1, §§12.2–12.3; D03 and D13; the merged SH-1 contract, kernels/tests, origin/tests, money/rational/quantity and exported SHA-256 helper.
- SH-1 independent PASS and separate acceptance were source-inspected in `docs/verdicts/SH-1/a2ed4ec-{opus,sol,acceptance}.md`. Ben's 5 October merge-ahead ruling is in acceptance §1. Read-only loose commit-object traversal also found ancestor `a2ed4eca3506e33703d4e59168e28af4aa69fbca`.
- Rev 3.0 adoption #93 (`3e0764b`) is merged according to the issuing coordinator, and its adopted contracts are present at the prepared base. Full ancestry/tree comparison could not be independently completed with loose-object-only inspection because some ancestors/trees are packed; the dispatcher retains the final base/diff/ancestry check. No git subprocess was used for this inspection.
- No open PR was used as a prerequisite. No persistence followup was pulled into this task.
- The first write appended only the exact `sv-1` lane entry. Later, one public shadow-domain export was appended to `packages/core/src/index.ts`; existing exports were not reordered. These two files overlap ENT-4a/other active lanes. **Editing/integration owner: dispatcher/coordinator**, which serializes those edits and owns commit/rebase integration. This sandbox's builder performed only the issued SV-1 append operations. Other lane entries were not changed.
- **Migration: none.** No database schema, migration number, ledger reservation or persistence guarantee is introduced. SV-1 remains the §12.3 phase-2, SH-1-dependent pure leaf under Ben's ruling.

## Changed contracts and implementation

Intended diff: 19 new production/test files in `packages/core/src/shadow-domain/`, one append to the core export, the append-only lane entry, and this receipt. No package/dependency/script/CI, application, provider, security/session, enterprise-domain, plan, decision or production-gate edits.

- Strict versioned signal/proposal/evidence/event/ineligibility schemas and typed failures. State transitions return immutable proposals, preserve work identity, enforce revision/job/phase facts and require sourced human-review facts for disputed dispositions. Exact baseline/locked-line selections dismiss; unmatched inclusion claims become disputed. `recovery_case_created` is a marker, not a case-writing operation. No commercial record or authority is created.
- Every disclosure route records its own append-only route and source; disclosure and early surfacing are permanent. Post-lock creation and pre-adoption evidence retain immutable exclusions. Duplicate coalescing preserves source evidence and one work identity, without claiming a persisted uniqueness constraint.
- Capture classification includes every Log an extra state, AI-structured builder captures, baseline and pre-lock final-review lines. Captures bind scope identity, revision, server time and nullable captured value as well as source/state/description. Matching keeps rejected/withdrawn/unpriced entries and returns source references.
- D13 returns fired rule versions, rule/policy source references and permanent ineligibility proposals. It creates no Decision or send. Significant-work policy is an explicit synthetic fixture or already evaluated structured predicate; no production threshold was selected.
- Lock snapshots bind all required identities, declaration/terms, complete caller-supplied capture register, lines, baseline disposition coverage, membership, server time, command and audit references. Canonical JSON sorts object keys lexicographically and set arrays by stable IDs; the digest imports existing `sha256`. This does not persist or prove database lock uniqueness.
- Ten individually source-bound attribution conjuncts, immutable exclusions and a separately sourced human dispute review. Exactly the all-true conjunction qualifies absent exclusions. Human review may resolve an attribution dispute while retaining its history; it cannot remove disclosure, pre-adoption or post-lock exclusions. A changed state or confidence score cannot resolve a dispute.
- Proposed D03 v3 categories reject unverified/pending/disputed facts and incorrect origin/source binding. Credit requires at least 25,000p consumed per case against a fully paid later invoice. Duplicate payment requires cash refund. Withheld payments require builder opening, prior terms, an explicit evaluated overdue-policy fact, the builder's own reminder response and post-opening customer cash. Interest requires a business debtor in that case; compensation/insurer proceeds/retention/prevention do not qualify.
- Success-fee proposals delegate allocation, gross/net conversion, exact rational aggregation and once-rounded cumulative fee to SH-1. The adapter checks original refund snapshots/remaining settled balances/ratios/cutoff and source replay, and prevents double-counting a principal proof via aliases or mixed entry routes. It returns Q, F, J, delta and derivation/source references. Zero means no journal; negative requires the existing compensation link; positive requires later exact proof and statement approval. No cap, subscription offset, credit-used field or fee VAT arithmetic.
- Branded, immutable human/server fact envelopes stay separate from detector output. Brands validate a type boundary and **do not authenticate a human or server**. Runtime schemas reject injected authority/settlement/origin/fee fields. No existing AI adapter, schema, model or prompt was changed.
- The recursive architecture test follows only the new domain's production import graph (including its transitive core dependencies), checks actual SH-1 calls and rejects copied allocation/rounding arithmetic and platform/vendor/network/database imports. It inspects source files when executed from source or compiled output.

## Reversible choices and synthetic fixture assumptions

Matching v1 uses NFKC, lower case, punctuation-to-space and whitespace normalization. Equal normalized scope area plus at least one overlapping complete nonempty word is description overlap; it is deliberately builder-favourable. Dates and values are **explicit versioned compatible/incompatible/unknown facts**, not guessed date windows, value tolerances or numeric similarity cutoffs. Unknown/ambiguous facts favour capture; incompatible facts refuse a match. Fixtures supply these facts for the compared capture set. No production threshold is set or approved. Matching coverage is bounded to the labelled synthetic corpus, not a calibrated semantic accuracy claim.

All IDs, hashes, object versions, documents, policy facts and payments are generated fictional fixtures. D03/D13 fixture bases assert evaluated predicates; they do not select a number of overdue days or a significant-work value threshold. Applied-credit success is reference-policy arithmetic only; its production path remains disabled pending its separate non-cash proof/allocation/reversal contract. Every eligibility/fee result has production disabled. No real data, paid/live model, provider, spending, send or charge was used.

Complete invoice compositions and immutable server/source facts are inputs. This domain cannot discover an omitted invoice line, authenticate its caller, discover missing stored captures or establish database/role/response isolation. Those responsibilities remain with SV-2, CH-7, M4-8-S and later command boundaries.

## Coverage and red → green evidence

- **68 new tests in 10 source files:** signal 9, capture 5, D13 2, lock 2, attribution 4, eligibility 7, fees 33, type contracts 2, architecture 1, deterministic evaluation 3.
- Signal table covers 9 states × 10 event families, each reconciled outcome/dismissal reason, exact/missing references, stale/wrong identities, all 10 disclosure routes, terminal early surfacing, coalescing and immutable outputs.
- All **1,024** attribution assignments are enumerated; **one** qualifies. Malformed/extra/missing/version/source-binding negatives and permanent exclusions are separate assertions.
- All **24 fixture IDs** F1–F23 plus F4b are table-tested, including sequential phases and every half-even tie, with exact rational pence Q, integer-pence F, J and delta assertions. F4 is `2,000,000 / 43` pence and F4b delta is `3,349p`.
- Splitting/combining uses deterministic seed `0x5101`, 100 mixed-ratio compositions with exact remaining balances. All six permutations of three equal-timestamp receipts are checked. Deltas telescope, including a nonzero prior posting; fractional instants/offsets, hierarchy, original refund ratios and stale/excess refunds are covered.
- Compile-time negative `@ts-expect-error` assertions are exercised by typecheck, including fully constructed but unbranded fee envelopes and nested readonly origin/evidence types. No `any` or unsafe authority cast manufactures success. The generic readonly assertion describes recursively frozen cloned data only.
- Initial five suites were written first: the targeted command exited **1**, five missing-module failures (`/private/tmp/sv-1-red-domain.log`). Eligibility and fee suites were also written before those modules: each command exited **1** for its missing module (`sv-1-red-eligibility.log`, `sv-1-red-fee.log`). Their implementations then passed.
- A later boundary test produced a substantive red failure: a valid 300-character disclosure source was rejected when prefixed with its route (**1 failed, 8 passed**, exit **1**, `sv-1-red-monotonic.log`). Route/source separation fixed it (**9 passed**, exit **0**, `sv-1-green-monotonic.log`).
- Interim typechecks exited **2** for test literal typing, undefined-original narrowing, Node test imports and readonly/default-schema inference; these were fixed within the lane, without dependencies or weakened negative assertions.
- First root test attempt exited **1** because the architecture test inspected compiled declarations when run from `dist`. It was fixed to anchor inspection to source; the complete core suite subsequently passed. No test was removed, skipped or given longer retries/timeouts.

## A–R deterministic matching/evaluation receipt

The explicit new matching gate is `src/shadow-domain/evaluation.test.ts`. Expected and actual outcomes below are asserted from domain results. Evidence references are generated inventory-bound IDs/versions/hashes; capture references are `fixture://capture/<kind>/<state>`. Other source-bound facts use `fixture://<predicate>` and generated human/receipt/remittance references.

| Label | Expected / actual | Source / qualification |
| --- | --- | --- |
| A | builder_captured / builder_captured | approved Log an extra; zero fee |
| B | builder_captured / builder_captured | pre-lock final_review; zero fee |
| C | revealed / revealed | pre-lock evidence; sourced human/payment conjunction qualifies; 8,000p fee |
| D | already_in_original_scope / same | baseline source; zero fee |
| E | dismissed / dismissed | human not_completed disposition; zero fee |
| F | fee_free / fee_free | missing settled/allocated conjunct |
| G | 4,000p / 4,000p | partial settled cash |
| H | −2,000p / −2,000p | item-specific original receipt refund and compensation link |
| I | surfaced_early / surfaced_early | D13 disclosure route; permanent exclusion |
| J | duplicate_signal / duplicate_signal | three cited evidence links, one coalesced work identity; persistence uniqueness deferred |
| K | dismissed / dismissed | exact locked line; unmatched claim disputed |
| L | evidence_after_lock / evidence_after_lock | timing fact; permanently excluded |
| M | 4,651p / 4,651p | blended-invoice pro-rata allocation |
| N | 8,000p / 8,000p | separately paid catch invoice |
| O | unmatched / unmatched | diary evidence; remains an omitted-work proposal until human facts |
| P | builder_captured / builder_captured | draft unpriced Log an extra; rejected/withdrawn also exercised |
| Q | **not evaluated here** | real role denial and response indistinguishability require SV-2; excluded from success metrics |
| R | permanently_ineligible / same | support, export and data-subject disclosure sources feed attribution exclusions |

Across **17 applicable labels**: zero omitted expected A/B/D/P capture/baseline matches, zero unsupported outcome additions and zero false matches in the explicit wrong-area/description/job fixtures. Fabricated evidence ID, object version/hash, tenant/job sources are rejected. Ambiguous date/value facts favour builder capture. These are deterministic fixture assertions, **not live-model evaluation, hidden-table isolation proof or production approval**.

## Environment and executed commands

Used preinstalled dependencies as instructed; **did not run `pnpm install --frozen-lockfile`** or install/download dependencies. A clean pinned install still needs dispatcher/CI evidence. Observed Node **24.17.0**; `.nvmrc` pins **24.15.0**. Used the already cached **pnpm 10.28.1** through a temporary `/private/tmp/sv-1-bin/pnpm` shim (PATH prefix for commands below); no repository scripts or security settings were changed. The global pnpm launcher initially attempted automatic registry version verification during `--version` and failed offline; the local cached pinned runner succeeded. TypeScript 5.8.3, Vitest 4.1.11, core Zod 3.25.67 are installed.

| Exact command (temporary pinned-pnpm PATH prefix omitted) | Exit / observed result |
| --- | --- |
| `pnpm --filter @jobguard/core exec vitest run src/shadow-domain/signal.test.ts src/shadow-domain/capture.test.ts src/shadow-domain/must-surface.test.ts src/shadow-domain/lock.test.ts src/shadow-domain/attribution.test.ts src/shadow-domain/eligibility.test.ts src/shadow-domain/success-fee.test.ts src/shadow-domain/type-contracts.test.ts src/shadow-domain/architecture.test.ts src/shadow-domain/evaluation.test.ts` | **0**, 10 files / 68 tests; later capture-snapshot additions also passed `vitest run src/shadow-domain` with the same count |
| `pnpm --filter @jobguard/core exec vitest run src/shadow-domain/evaluation.test.ts` | **0**, 3 tests, final matching gate |
| `pnpm --filter @jobguard/core exec vitest run src/cumulative-fee.test.ts src/receipt-allocation.test.ts src/extra-origin.test.ts src/fee.test.ts src/activation.test.ts` | **0**, 5 files / 109 tests |
| `node --test tools/shared-money-origin.test.mjs` | **0**, 3 tests |
| `pnpm typecheck` | **0**, all 7 workspace tasks, final implementation |
| `LANE_BASE_REF=origin/main pnpm lint` | **1**: lane checker rejects HEAD == origin/main self-comparison before package lint |
| `pnpm test` | **1**, final attempted root run: API health test cannot bind, `listen EPERM 0.0.0.0`; 42 tooling tests passed, core and AI passed; DB task did not complete before Turbo stopped |
| `pnpm build` | **0**, all 7 workspace tasks, final implementation; existing Next CSS warnings and denied Turbo cache IO warnings did not change the exit |
| `pnpm openapi:check` | **1**, tsx CLI IPC `listen EPERM` on its temporary pipe |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **1**, `Missing branch or self-comparison range; refusing a misleading pass.` |
| `pnpm eval` | Initially **1** before core had been built (unresolved package entry); after build **0**, 3 files / 72 existing AI tests; target is unchanged and is distinct from the new matching gate |
| `pnpm --filter @jobguard/core build` | **0** |
| `pnpm --filter @jobguard/core test` | **0**, 94 files / 762 executions after build: source plus emitted test duplicates, **not 762 distinct coverage cases** |
| `pnpm --filter @jobguard/core exec vitest run src` | **0**, 47 source files / **381 distinct source tests**, final implementation |
| `node tools/core-purity-lint.mjs` | **0** |
| `node tools/money-arithmetic-lint.mjs` | **0** |
| `node tools/commercial-boundary-lint.mjs` | **0** |
| `pnpm turbo run lint` | **0**, all 7 package lint tasks; supplements but does not replace root lane evidence |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | **0**, same real OpenAPI generator/check through Node loader without tsx CLI IPC |

Logs are retained at `/private/tmp/sv-1-*.log` in this sandbox. Command receipts above distinguish the actual command's exit from the enclosing shell's exit. No GitHub CI run was observed or claimed.

Not run: frozen install (dispatcher said preinstalled/no downloads); separate `pnpm test:db`, `pnpm test:migrations`, restore and Playwright suites (sandbox cannot start PostgreSQL/bind localhost; dispatcher assigns them to CI). No SV-1 browser or migration test was invented. Existing database/migration/browser regressions and root script checks are mandatory and **not waived**. No paid/live evaluation is applicable because no model/prompt/provider changed.

Static validation using the existing lane selector confirmed the unique branch-to-lane mapping and all 19 domain/test paths plus the shared append paths/receipt are allowed (exit **0**). This **does not substitute for a commit/diff lane check**; dispatcher must rerun root lint/lint:lanes after committing.

## Protected files — before and after SHA-256

These ten files were hashed before implementation and compared again after the final changes; **all are byte-for-byte unchanged**. SHA-256 paths are relative to `packages/core/src/`.

| File | SHA-256 before = after |
| --- | --- |
| `fee.ts` | `2cc034d0388837e9ec4611e350ba37f61af375f374ae27840593b021111b5542` |
| `fee.test.ts` | `116796a0bb8684b52e2afe11d6a356f1ea525a1f6bf71752aea8ef6542eb35df` |
| `activation.ts` | `b45400b1b076ddcece5252236610c9acd47f685190639ceff74b736806866fab` |
| `activation.test.ts` | `42fba84be3af6b0abe46b6f2b3be3a3fab537bcf3e8ea4163c36c89168877bec` |
| `cumulative-fee.ts` | `120171992a63d75758cbd22c0bf0226288f23306cadfac8afc044a67a4a061c6` |
| `cumulative-fee.test.ts` | `0abed1a7fb4edd2c14e4cc1ec216944c673c569eebc00898d6b9587eff52de04` |
| `receipt-allocation.ts` | `3daef564c6a929efb992368724c1b52c9627487bf7721df98d0aef63e0551140` |
| `receipt-allocation.test.ts` | `7b7676a00a5b5c2dc7d0ab2a938147e37f006989f28d39ddb23770bbd1aaf630` |
| `extra-origin.ts` | `abab327d1da9c66aac1ae62fef0a41f74cf51ce518c88c52f58d237326931d1c` |
| `extra-origin.test.ts` | `a6a49975e1332cc9732a89c9e69cf053546ffc313e4ac8e45b38d9a64dc876a9` |

The 19 domain/test files have aggregate SHA-256 `6a0faef2c349d9902baec0520115b73167669583dabf05b46619b5b356fe465e`, computed over sorted paths with NUL separators and their final bytes. The dispatcher supplies the exact final commit/base/diff; this receipt cannot pre-bind an uncreated commit.

## Remaining execution evidence, gates and adjacent discoveries

- Dispatcher: commit the working tree, supply exact base/head/diff, reconcile the two shared append files, run the clean pinned install and real root lint/lane/OpenAPI wrappers, and obtain fully green root/API/database/migration/browser CI. Current local root failures are holds, not passes.
- Independent Claude must inspect that exact final commit, run the requested negative checks and record PASS/HOLD/FAIL. A separate actor records acceptance. Neither is written by this builder.
- D03 v3, D13, D02, D01/D12 as applicable, **G1** real-data processing and **G4-S** fee issuance/collection remain unapproved release gates. The non-cash consumed-credit contract and M4-20 retention path remain unavailable. No gate/decision record was changed.
- SV-2 owns actual hidden persistence, role denial, response isolation, disclosure persistence, locks and coalesced uniqueness. CH-7/M4-8-S own real proof/category admission and persisted allocation/refund/reversal invariants. Later command boundaries own exact commercial authorization, audit, idempotent posting and execution. This leaf proves none of those database guarantees.
- For the coordinator's later plan entry: default core Vitest discovery also runs emitted `dist` test copies after build; final source-only regression metrics above avoid inflated coverage claims. Fixing shared test discovery is outside this lane. Lane lint's self-comparison refusal means uncommitted fresh worktrees need dispatcher commit evidence. The tsx CLI IPC restriction has a usable direct-loader check, without altering the official script. These adjacent issues were not fixed outside SV-1.
