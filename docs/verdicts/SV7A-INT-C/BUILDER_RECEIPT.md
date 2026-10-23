# SV7A-INT-C builder receipt

Build-ahead only, issued 23 October 2026 by the Track A+B dispatcher under decision 74. Builder: Codex. This is a builder's run record, not an independent verdict or technical acceptance. No commit, push, PR, merge, enablement, real data, provider call or spending is authorized or performed.

## Source and scope

- Branch: `codex/sandbox/sv7a-int-c`.
- `HEAD` and `origin/main`: `dc5721230fd8aedbf2d9d0457789074b66b48765`; initial working tree clean. Final changes remain uncommitted for the dispatcher.
- Read repository `AGENTS.md`, applicable `BUILD_PLAN.md` §§2.4–2.5 and SV-7/SV-7A card/dependencies, and the full SV7A-INT-C draft plus its intake/import/integrity pack source/common gates and implementation/handoff contract (the pack has §§2.1–2.2, not §§2.3–2.5).
- Specification: `JobGuard-BUILD-AHEAD-ALL-SIX-CORRECTED-DRAFT-20261020T230116Z.md`, SV7A-INT-C at line 3469, supplied planning-wave directory.
- Verified existing symbols in `packages/core/src/job-sources.ts`: `diaryInputV1`, `customerMessageInputV1`, `diaryEntryV1`, `customerMessageV1`, `jobSourceEvidenceV1`, `JOB_DIARY_NOTICE`, `JOB_DIARY_NOTICE_VERSION`; also inspected existing `job-sources.test.ts`. Verified `linkedJobOfferV1`, `JobWorkStateError` and `LINKED_JOB_COPY` in `job-work-state.ts`. No required existing symbol absent; no missing-symbol STOP.
- Node `v24.17.0`; locally cached pinned pnpm `10.28.1`; installed Vitest `4.1.11`. No dependency install/download command executed. No clean install claimed.

## Changes and choices

Exactly five new permitted files: `packages/core/src/job-source-intake.ts`, its test, `docs/contracts/job-source-intake-v1.md`, `config/lanes/sv7a-int-c.json`, and this receipt. No existing file changed. The explicit issued order permits the new lane file despite the older draft's coordinator-only rule; it follows the inspected per-file lane schema and exact branch/file allowlist. No shared barrel, catalogue, migration, routing or manifest edit.

Simplest proposed forms selected:

- Strict `sourceKind`-discriminated receipt union, readonly, directly composing unchanged readonly v1 records/evidence and exact notice constants. Inferred public receipt type; no new GET or input version.
- Classifier accepts unknown boundary values, validates kind and corresponding unchanged v1 input, throws only stable `INVALID_JOB_SOURCE_INPUT` on failure, and constructs only the three specified output fields. No passthrough/spread from caller data.
- Typed error class with the six proposed codes and message equal to code; no raw-source/error payload. Existing lifecycle/admission errors remain separate and untouched.
- Retain existing 8,000 UTF-16-unit validation. Valid Unicode at that bound has at most 24,000 UTF-8 bytes, below the 32,000 ceiling; no redundant/new text validator. Server byte/hash verification remains mandatory later.
- C1: pure contract; no web journey, persistence, migration, worker, commercial effect, authorization implementation or new operational alert. Additive private module; coordinator still owns public export integration.

## Commands actually run

All successful pnpm checks use a temporary shim at `/private/tmp/jg-sv7a-int-c-bin/pnpm` invoking the existing cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs` with Node. Each heavy check runs sequentially through `HEAVY_SLOTS=1 PATH=/private/tmp/jg-sv7a-int-c-bin:$PATH /Users/benharwood/.local/bin/heavy-slot <label> <command>`. Host resource inspection requires sandbox escalation; the existing scheduler was used, not replaced. Disk had 218 GiB free and memory reading 65% free at inspection. Vitest uses at most two workers.

| Command | Real result |
| --- | --- |
| `pnpm --version` via original host launcher | Exit 1: launcher attempted version selection and failed registry signature/fetch verification; no install requested. Two diagnostic launcher variants were interrupted (130). Resolved by invoking existing cached pinned pnpm, without ignoring signature checks or changing project config. |
| Cached `pnpm --version` | Exit 0, `10.28.1` |
| Scheduler under original sandbox | Interrupted (130): `sysctl`/`ps` inspection denied. Same scheduler subsequently ran with approved escalation. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-source-intake.test.ts` before implementation | Exit 1, expected RED: new module absent; no tests collected. |
| Same own-test command after implementation | Exit 0: 1 file, 6 tests pass. |
| `pnpm --filter @jobguard/core typecheck` | Exit 0. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-sources.test.ts src/job-work-state.test.ts` | Exit 0: 2 files, 17 tests pass. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | Exit 1: core purity passes (230 TS files, seven existing computed-import reports); lane validator refuses `HEAD == origin/main`: `Missing branch or self-comparison range; refusing a misleading pass.` Package lints were not reached by this command. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1: same no-commit/self-comparison guard. Dispatcher must rerun after committing; no false alternative base or validator change. |
| `pnpm build --concurrency=2` | Exit 0: 7/7 tasks successful, 2 cached. Next production build passes. Warnings in unchanged workspace-root inference/CSS autoprefixer/Nest `file-type` exports/computed dependency imports; not repaired outside this allowlist. |
| `pnpm openapi:check` | Exit 0: existing snapshot unchanged. |
| `pnpm turbo run lint --concurrency=2` | Exit 0: supplemental package lints 7/7 successful, 2 cached. Does not replace the blocked root lint/lane check. |
| `node tools/money-arithmetic-lint.mjs` | Exit 0. |
| `node tools/commercial-boundary-lint.mjs` | Exit 0. |
| Supplemental Node ESM call to existing `loadLanePolicy`, `selectLane`, `lanePathAllowed` over `git ls-files --others --exclude-standard -z` | Exit 0: new lane schema/branch select correctly, exactly five permitted new files. This is a working-tree allowlist check, **not** a full lane verdict. |
| `git diff --exit-code -- packages/core/src/job-sources.ts packages/core/src/job-sources.test.ts packages/core/src/job-work-state.ts packages/core/src/job-work-state.test.ts` | Exit 0: existing contracts/regression files unchanged. |
| `git diff --check` | Exit 0 for tracked changes (all five additions are still untracked). |
| Final supplemental Node ESM allowlist/whitespace check over the five untracked additions | Exit 0: all authorized, all end with newline, no trailing whitespace. Full lane verdict remains blocked. |

Final disk inspection: 215 GiB free. Final `git status --short` shows only the five authorized additions; no existing tracked file changed. No migrations or backwards-incompatible schema/GET changes. The no-commit constraint prevents an exact changed head from existing until dispatcher handoff; all test execution above concerns the uncommitted working-tree additions.

## Acceptance evidence and limits

- C01: existing v1 schemas/tests untouched; their regression command passes; receipt composes existing records. Public export remains coordinator-owned.
- C02: new tests reject unknown authority/metadata fields on both inputs, classification and receipts; fictional roles cannot replace actual tester UUIDs. Server authentication is not implemented or proven here.
- C03: exact whitespace/BOM/newlines/multilingual/emoji round-trips, boundary lengths, blank/NUL/unpaired surrogate/oversize rejection; stamp/filename keys rejected.
- C04: both entry modes, on/off-site diary, customer messages and invalid/mismatched kind/version paths; only on-site diary returns `onSiteDiary: true`. No location, capacity or lifecycle authority claimed.
- C05: exact notice/version, frozen nested records/evidence, strict rejection of hidden/commercial fields, non-synthetic mode and bad evidence metadata; no copying of unexpected fields. No runtime hidden-state/query-log proof claimed.
- Invariants preserved: AGENTS §§5.3, 5.8–5.10, 5.12–5.14 (proposal/evidence boundaries, no effects/hidden disclosures), core purity, v1 compatibility. No financial calculation or commercial policy changed.

## STOPs, retained holds and handoff

No source-symbol or permitted-file STOP. **STOP: full root lint/lane verdict until dispatcher commit** because the current validator rejects comparison against an identical base/head before inspecting uncommitted additions. Source checks and supplemental allowlist validation do not waive that guard. Environment limitations above are execution evidence, not acceptance waivers.

H-ISSUE, H-REGISTRATION and H-PURE-SPLIT remain review/acceptance holds: this dated order supplies bounded build permission and lane authorship only; it is not evidence that parent prerequisites, formal split/source-design acceptance or final integration/registration acceptance have been discharged. Parent SV-3/CH-4 gate remains; H-CH4, applicable H-MON1 and H-17OCT block runtime admission/integration. No persistence/CH-4 implementation dependency is claimed satisfied. Coordinator alone integrates additive core exports and confirms C1 registration; this private module cannot enable intake.

H-REVIEW: two actual independent Claude exact-head PASSes, required CI, and a separate fresh-context acceptance actor remain outstanding. No builder self-acceptance. H-LIVE and applicable G1/G2/G4-S/G5, D01–D13 (including D04/D06/D07/D12/D13) remain. H-SV5/H-SV6/H-IMPORT-BASELINE remain on downstream journey work; H-IDENTITY/H-D11 remain on other relevant pack leaves. This leaf clears none of those holds and does not close SV-7A, Test O or DEMO-S.

NOT RUN locally: PostgreSQL, migration/catalogue/upgrade/race/query-log tests and browser suites (sandbox/order CI-only; no DB/web changes); root `pnpm test` and root `pnpm typecheck` (dispatcher CI; only issued named units and touched-package typecheck locally); `pnpm eval` and live-model evaluation (no prompt/model/parser/matching change); dependency audit/secrets scan and independent reviews/acceptance (required CI/review actors). No fabricated CI URL, review verdict, trace or generated persisted fixture ID. Synthetic test UUIDs are in-memory fixtures only.

Intended commit message is supplied separately at `/private/tmp/jg-msg-sv7a-int-c.txt`. Dispatcher commits after exit; Ben merges after predecessor/integration/review gates.
