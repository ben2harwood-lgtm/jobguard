# CH6-C builder receipt

23 October 2026. Builder: Codex (this session); source-inspected and test-executed only. No independent verdict or technical acceptance is asserted. The issued order authorises construction under decision 74, not integration, a PR, enablement, providers, real data, spending, push or merge. Ben merges; dispatcher commits after this session.

## Source and scope

- HEAD and `origin/main`: `dc5721230fd8aedbf2d9d0457789074b66b48765`.
- Branch: `codex/sandbox/ch6-c`; worktree: `.worktrees/ch6-c`.
- Read actual AGENTS.md, BUILD_PLAN.md CH-6 and relevant shadow/advisory invariants, planning pack §§1–3.3/common contracts, CH-6 source register/shared contract/holds, and complete CH6-C draft at lines 4031–4065.
- Only four draft-owned new files, issued `config/lanes/ch6-c.json` and this receipt are delivered. No existing tracked source file was changed. Shared barrels, v1 code/tests, catalogues, migrations, routing and integration remain untouched.
- Read-only source/document work was delegated to `source_contract` under the explicit “fan out” instruction. Its same-model source review found duplicate-current-quote and irrelevant-source-key risks; these were corrected and tested. This is builder assistance, not an independent different-model verdict.
- Exact `git diff --exit-code origin/main -- packages/core/src/commercial-integrity.ts packages/core/src/commercial-integrity.test.ts` returned 0. Existing v1 advisory code and regression test remain byte-identical.

## Delivered choices

Strict versioned Zod input/result/review/source-snapshot/family contracts; pre-lock ordinary and post-lock published branches; nine pure advisory rule families; tenant/job/practice-scope source binding; conflict rejection/deduplication; exact bigint comparisons; frozen outputs; stable finding identity; canonical source-snapshot serialization without crypto or I/O. Tests import the module directly, without a shared barrel.

Reused `MAX_MONEY_PENCE` and `workFactTimeV1`. Time is canonical UTC with six fractional digits. Date reads whole seconds only, with microseconds added as bigint; no Date.now/clock read. Money uses safe GBP integer pence and bigint sums; there is no second money kernel or tax inference.

Undecided rule parameters have no defaults. Tests explicitly supply `synthetic_fixture.v3` / `fixture-rules.1`, a Jan 1–Apr 1 2026 anchored window, two payments/two linked cycles, strict seven-day won delay, and net quotes below 200000p within 90 exact days with declared endpoint convention. Missing allocation/won/quote/restart policy returns `policy_absent`. These fixture choices do not approve an adapter or production policy.

One current accepted quote per job is required; ambiguous current revisions are refused. Revised/cancelled records stay explicit. F01 requires server-recorded verified original proof and exact catch linkage. F02 counts deduplicated unreversed receipts and only additional confirmed catches; any actual credit/write-off returns `credit_basis_unavailable` rather than inventing CI-H5 normalisation. F03 requires an actual matching catch line and same known basis. F04 uses distinct explicit user-selected receipt allocations. F08 uses original linked server-ordered finish/cancel-or-resume or close/reopen pairs, once per finish. F09 consumes only minimised opaque same-scope synthetic assertions; family/company sharing is a non-trigger.

Canonical text sorts object keys by UTF-16 ordinal order; JSON-encodes scalars; treats arrays as sorted deduplicated sets. Snapshot facts include complete relevant compared values and lock version/cutoff where applicable. Irrelevant catches do not change a receipt finding key/snapshot. Hashing those exact UTF-8 bytes belongs to the future adapter/SQL implementation. No fake `findingSnapshotHash` is produced in core. SQL canonical equivalence and source reproduction are NOT implemented or verified here.

Public module inventory for dispatcher agreement: `commercialIntegrityV3InputSchema`, `commercialIntegrityV3ResultSchema`, `commercialIntegrityReviewV3Schema`, `commercialIntegrityReviewSourceSnapshotV3Schema`, `commercialIntegrityFamilyV1Schema`, `commercialIntegrityV3Kinds`, `evaluateCommercialIntegrityV3`, `canonicalCommercialIntegritySnapshot`, `CommercialIntegrityV3Error`; types `CommercialIntegrityV3Input`, `CommercialIntegrityV3Result`, `CommercialIntegrityReviewV3`, `CommercialIntegrityReviewSourceSnapshotV3`, `CommercialIntegrityFamilyV1`. DTO literal versions are recorded in the module/contract. No barrel registration or accepted downstream handoff is claimed.

## Actual checks and results

Node: `v24.17.0`. Used the already-installed cached `pnpm@10.28.1`; dependencies were not installed or changed. The initial PATH pnpm was a newer launcher which attempted automatic package-manager selection and failed registry verification/network access. After discovering the installed pinned binary, all completed checks used it directly or `/private/tmp/ch6-c-bin/pnpm`, a temporary shim executing `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs "$@"`. No further package fetch was requested.

Heavy commands ran serially through `/Users/benharwood/.local/bin/heavy-slot` with `HEAVY_SLOTS=1`. The helper printed sandbox `sysctl`/`ps` permission warnings; these are recorded, not evidence that system load/memory/process admission was measured successfully. Disk inspection showed 217 GiB available initially and 214 GiB after build. Unit invocations used at most two Vitest workers; root build used concurrency two.

| Command actually run (temporary pinned pnpm PATH described above) | Real result |
| --- | --- |
| Heavy-slot `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/commercial-integrity-v3.test.ts` before implementation | EXIT 1 from initial PATH pnpm package-manager selection/signature fetch failure; Vitest did not execute. Tests were authored first; no successful red-phase execution is claimed. |
| Heavy-slot initial PATH `pnpm --filter @jobguard/core typecheck` | Interrupted EXIT 130 while launcher remained pending; no typecheck result. |
| Heavy-slot cached pinned `pnpm --filter @jobguard/core typecheck` | EXIT 0; also repeated after implementation/refinements, final EXIT 0. |
| Heavy-slot pinned `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/commercial-integrity-v3.test.ts src/commercial-integrity-v3.boundaries.test.ts src/commercial-integrity.test.ts` | Initial EXIT 0, 31 tests (boundary suite originally imported family test helpers and therefore registered duplicated tests). Removed test-to-test import. Subsequent refinement run EXIT 1, 21 passed/1 failed because a formerly accepted ambiguous-current-quote fixture now correctly refused. Added explicit refusal/revised-state coverage. Next EXIT 0, 22 tests. Final EXIT 0, **23 tests / 3 files**, including unchanged v1 regression; repeated after explicit server-time ordering and strengthened ±1 microsecond test (observation window wider than 90 days), also EXIT 0 / 23 tests. |
| `LANE_BASE_REF=origin/main pnpm lint` (heavy-slot, `TURBO_CONCURRENCY=2`) | EXIT 1: core purity passed (231 TypeScript files; seven existing computed-import diagnostics reported only), then lane guard refused `Missing branch or self-comparison range`. HEAD equals issued base, with all delivery files uncommitted. Remaining root lint stages did not execute in this command. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | EXIT 1, same self-comparison refusal. Dispatcher must rerun after its commit; base was not falsified and checker was not weakened. |
| `pnpm build --concurrency=2` (heavy-slot) | EXIT 0, 7 successful tasks, 2 cache hits. Core/db/ai/API/web compiled. Warnings: shared cache IO permissions, Next workspace-root inference, pre-existing CSS autoprefixer warnings, Nest file-type export/dynamic dependency warnings. No new listener/provider or browser journey started. |
| Heavy-slot `pnpm --filter @jobguard/core build` after final timestamp-order refinement | EXIT 0, final touched package compiled including final tests. Earlier full root build passed; only pure-core refinements followed. |
| `node tools/core-purity-lint.mjs` after final changes | EXIT 0, 231 TypeScript files; same seven existing reported-only computed-import diagnostics. |
| `node tools/money-arithmetic-lint.mjs` | EXIT 0, money arithmetic boundary passed. |
| `node tools/commercial-boundary-lint.mjs` | EXIT 0. This installed guard is not CH6-B's future v3 architectural proof. |
| Inline Node imported `loadLanePolicy/selectLane/lanePathAllowed`, selected actual branch, checked actual untracked file paths from `git ls-files --others --exclude-standard -z` | EXIT 0, working-tree allowlist valid; repeated on all six delivered files with explicit whitespace scan and `git show origin/main:<v1 file>` byte equality, EXIT 0. This deterministic supplemental check does **not** replace the refused exact-commit lane command. |
| `pnpm openapi:check` (heavy-slot) | EXIT 1: tsx CLI's local IPC pipe listen returned EPERM before generator execution. See fallback below. |
| Heavy-slot `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | EXIT 0: same OpenAPI generator/check via the installed tsx loader, avoiding the CLI IPC pipe. No listener or source changes. |
| `git diff --check`; explicit Node whitespace scan over new module/tests/doc/lane | EXIT 0. Git diff alone excludes untracked files; supplemental scan covered those files. |

The local check history above is not CI evidence and does not count as a different-model verdict.

## Acceptance coverage and limits

- CI-C01: strict schemas reject unknown keys, forged external actor/tenant/profile/time fields, production, unsafe money, mixed currencies, invalid calendar/precision, scope mismatches and post-lock-only pre-lock fields.
- CI-C02: all CI-F01–F09 positive and adversarial synthetic families; exact penny and 90-day ±1 microsecond endpoints; explicit exclusive endpoint; duplicate/replayed facts, revisions, activations, invalid/unrelated proof, line/basis holds, ordinary interim flows, user/phone/card sharing/expiry/scope.
- CI-C03: order/replay/unrelated findings and unrelated published catches preserve keys; conflicting source identity refuses.
- CI-C04: frozen inputs unchanged, nested outputs frozen, advisory-only result schema rejects authority/fee fields; no action integrations.
- CI-C05: unchanged v1 source/test diff and executed existing regression.
- CI-C06: explicit absent-policy, absent-identifier, absent-line and unavailable-basis outcomes; no fabricated source/default.
- CI-C07: canonical source text stable under order/read-time and sensitive to source revision/hash, amount, profile, window and public contract revision. **Future SQL same-representation proof and real-source reconstruction remain held.**

Fixture IDs are fixed synthetic-only constants: tenant `10000000-0000-4000-8000-000000000001`, job `20000000-0000-4000-8000-000000000001`, related job `20000000-0000-4000-8000-000000000002`, lock `30000000-0000-4000-8000-000000000001`. No database fixture records were generated.

No database changes/migrations, backwards-compatibility changes, external actions, operational alerts or provider data-flow changes. The pure module is not exported from the package barrel or wired into the app. No persisted source, authorization, RLS, query-log/no-shadow, HTTP, feedback immutability, two-browser or aggregate parent acceptance is claimed.

## STOPs, retained holds and NOT RUN

Missing-existing-symbol STOPs: **none**. Verified CI-S1/S7–S11 and additional named source paths/symbols with git grep/source inspection: v1 evaluator/application/review stores, JobPartiesRepository.view/list, JobWorkStateRepository.read and app.ch4_read_work_facts, MeterRepository supplied-input read/rebuild, PracticeInvoiceRepository list/receiptView/creditView, RecoveryAllocationRepository.view, shadow/final-lock contracts and existing time/money primitives. Proposed v3 symbols were intentionally absent/new. The private allocator time parser was not treated as an exported API or copied money kernel.

Check-level STOPs: exact root/lane lint until dispatcher commit; standard OpenAPI launcher blocked by sandbox IPC; the same generator passed using the Node loader fallback. No source edit is stopped for a missing prerequisite; build-ahead authority permits this pure construction. Technical acceptance remains held.

- **CI-H1 / H-SV5:** accepted public SV-5 disposition/catch/completion contract, integrated source and tenant/session/read proof absent; no private-table adapter.
- **CI-H2 / H-MON1 / H-CH4:** actual accepted ordinary lifecycle/authority source handoff required, distinct from meter fixtures.
- **CI-H3 / H-D11:** adapter demonstration policy approval and exact threshold/time/basis semantics still required; tests use supplied fixture parameters only. D11 production approval remains closed.
- **CI-H4 / H-IDENTITY:** separate authorised minimised identifier assertion source; no real user/phone/card ingestion or tenant/session lookup.
- **CI-H5 / H-SV6 where actually consumed:** accepted immutable line credit/write-off and normalised receipt/account semantics; no guessed attribution. SV-6 is not fabricated as a blanket prerequisite.
- **CI-H6:** CH6-P allocated migration/note, checked writer/immutability/source guard/catalogue and database proof remain unbuilt.
- **CI-H7 / H-IMPORT-BASELINE:** accepted CH-5 imported-v3 discriminator/adoption/final-account bridge; no fallback based on missing cap fields.
- **CI-H8:** coordinator agreement on actual symbol/DTO inventory, integrated head and nonoverlapping CH6-B handoff. Separate CH6-CSG-01 draft remains unissued and is not reproduced here.
- **H-PURE-SPLIT:** formal SV-5/MON-1 parent gates and actual source-design/adoption/split acknowledgement remain requirements for integration/acceptance; issued build permission is not evidence clearing them.
- **H-ISSUE/H-REGISTRATION:** this user order supplies construction and own lane-file authority only. Shared export/catalogue/routing integration and downstream issuance remain coordinator-owned; no self-issued PR.
- **H-17OCT:** existing dated intake authority remains an upstream hold if such source paths are later consumed; no intake behavior changed here.
- **H-REVIEW:** two real independent Claude exact-commit PASSes, green required CI and separate acceptance remain outstanding. Builder/source-agent inspection supplies none of them.
- **H-LIVE:** D11/D12 and all applicable D01–D13/G1/G2/G4-S/G5 data/provider/charging/release gates stay closed. No enablement, real data, provider, spending or release permission follows from this receipt.

**NOT RUN:** root `pnpm test`/full root typecheck/full mandatory CI; PostgreSQL `pnpm test:db`, `pnpm test:migrations`, all integration/catalogue/query-log/upgrade/restore suites; browser `pnpm test:e2e`/both projects; model `pnpm eval`/live model gates (no model/prompt change). Database/browser suites are explicitly CI-only under the issued order and sandbox. No clean reinstall (dependencies supplied; no downloads), remote CI URL/artifacts, review submissions, independent verdicts, acceptance, commit, push, PR or merge.

Intended conventional commit message is written outside the worktree at `/private/tmp/jg-msg-ch6-c.txt` for dispatcher use.
