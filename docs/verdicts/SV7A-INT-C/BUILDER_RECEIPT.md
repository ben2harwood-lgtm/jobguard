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

## LATER items

23 October 2026 follow-up, explicitly issued by the Track A+B dispatcher; no commit/push/PR. Preflight: clean working tree on `codex/sandbox/sv7a-int-c`, accepted starting HEAD `a6c00a3adf3ac1b30056cb020ad50c6e5b1e66ae`; origin/main remains `dc5721230fd8aedbf2d9d0457789074b66b48765`. Read both complete reviews at `/Users/benharwood/.local/share/full-steam/jg-runs/v5-sv7a-int-c-claude-{A,B}-a6c00a3a-20261023.md`, the issued order/spec, current AGENTS/build-plan contracts, and `jg-orders/next-wave/BEN-ANSWERS-20261023.md` under that same full-steam directory. Also read the main checkout's AGENTS.override.md and `docs/workflow/CODEX_SESSION_POLICY.md`. Initial relative review paths were absent; their full-steam copies were found before edits. No policy decision required: the changes below harden validation or clarify existing technical responsibilities. Ben's safest-choice authority opens no release gates.

One line per reviewer item (duplicates retained for traceability):

- A1 — carried: `apps/api/src/job-source.errors.ts` is outside this lane; INT-A must map the new class explicitly. Contract handoff now documents the obligation; no API fix claimed.
- A2 — fixed (`keeps classification vocabulary bound to the observation contract`): observation literals have a generic constraint against `Observation["kind"]`, preserving the exact output union. Evidence vocabulary exists in database SQL, with no shared core type; that part is carried to coordinator/runtime integration outside the lane, explicitly documented.
- A3 — fixed (`maps throwing getters and proxies to a typed input error without leaking their message`): catch inspection exceptions and return only `INVALID_JOB_SOURCE_INPUT`, without cause/raw text.
- A4 — fixed (`keeps the UTF-8 byte ceiling implied by the UTF-16 text cap`): explicit constant relationship assertion.
- A5 — fixed (receipt evidence, no code test applicable): this appendix binds the original reviewer evidence to committed head `a6c00a3adf3ac1b30056cb020ad50c6e5b1e66ae`. Current working-tree changes need a new dispatcher commit and renewed review; eventual PR binding remains dispatcher-owned.
- A6 — carried: invisible-only text and timestamp offset/precision validation are inherited from `job-sources.ts`/`receipt-allocation.ts`, outside this lane. INT-P must address server-side requirements; no accepted v1 behaviour changed here.
- B1 — fixed (receipt evidence, no code test applicable): committed starting head named above; post-commit lane/root-lint results recorded below. These runs include the new uncommitted working tree and do not bind a future commit.
- B2 — fixed (`keeps classification vocabulary bound to the observation contract`), same change as A2.
- B3 — fixed (`keeps legacy and intake errors distinct for the documented transport handoff`): contract names new P orchestration's intake class, preserves legacy class behaviour, and requires A to recognize both trusted classes and explicitly map the new conflict code; runtime mapper work carried under A1.
- B4 — fixed (`keeps the UTF-8 byte ceiling implied by the UTF-16 text cap`), same change as A4.
- B5 — fixed (`maps throwing getters and proxies to a typed input error without leaking their message`), same change as A3.
- B6 — carried: same inherited v1 validation concerns as A6; no out-of-lane changes.

### Follow-up execution evidence

Pinned cached pnpm 10.28.1, Node v24.17.0, installed Vitest 4.1.11; dependencies already installed, no install/download requested. Commands below use `PATH=/private/tmp/jg-sv7a-int-c-bin:$PATH` (existing cached-pnpm shim) unless noted. Only the four allowed leaf files changed. No migration, provider call, commercial action, route/barrel change or new operational alert.

- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-source-intake.test.ts` before the implementation fix: exit 1, 1 failed/8 passed. The new getter/proxy test reproduced the raw TypeError leak.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-source-intake.test.ts src/job-sources.test.ts src/job-work-state.test.ts`: exit 0, 3 files/27 tests pass after all test additions (10 intake, 17 existing regression tests). Prior intermediate run: 26/26 pass.
- `pnpm --filter @jobguard/core typecheck`: exit 0; `pnpm --filter @jobguard/core lint`: exit 0.
- `LANE_BASE_REF=origin/main pnpm lint --concurrency=2`: exit 0, 7/7 package tasks successful (2 cached); core purity, lane, money and commercial boundaries pass. Existing computed-import reports and sandbox cache IO warnings remain. The initial direct cached-pnpm invocation of root lint/build was interrupted after subprocesses selected the host launcher; its graceful exit 0 is not counted as a full pass. Both commands rerun with the pinned shim in PATH.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 0, lane sv7a-int-c, committed comparison dc572123..a6c00a3a. Supplemental working-tree allowlist inspection is recorded below; this committed-range result alone does not prove the uncommitted delta.
- `pnpm openapi:check`: exit 1, sandbox denies tsx's IPC pipe listen (EPERM). Equivalent `node --import tsx src/generate-openapi.ts --check` in apps/api: exit 0, same generator/check mode, no snapshot change.
- `git diff --check`: exit 0.

NOT RUN: PostgreSQL, migrations and browser suites (dispatcher CI; pure leaf changes no DB/web behaviour), root test/typecheck and eval (named core/regression checks used; no AI change). No new independent verdict or acceptance is claimed. The old two PASS verdicts cover a6c00a3a only. Runtime/API mapping, server evidence checks, coordinator exports and all previously documented production/integration holds remain; no new working-tree change is accepted by this builder.

- `pnpm build --concurrency=2`: exit 0, 7/7 tasks successful (2 cached), production Next build complete. Existing workspace-root, CSS/dependency and sandbox cache IO warnings only. Full log: `/private/tmp/jg-sv7a-int-c-later-build.log`; root lint log: `/private/tmp/jg-sv7a-int-c-later-lint.log`.
- Final supplemental working-tree check: Python compared `git diff --name-only` with `config/lanes/sv7a-int-c.json`'s exact allowlist: exit 0, exactly four permitted modified files. Final `git diff --check`: exit 0. No git-writing commands executed.
- Intended conventional commit subject/body written to `/private/tmp/jg-msg-sv7a-int-c.txt`; dispatcher owns committing, rebinding review and eventual PR evidence.

Session continuity supplement (bounded follow-up issued in this conversation; original builder session identifier is not exposed in this tool context):

```yaml
session_record_version: 1
task_id: SV7A-INT-C
project: JobGuard
role: builder
thread_id: unknown
surface: Codex app
host: local macOS
repository: /Users/benharwood/Claude/Projects/my-new-project
worktree: /Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv7a-int-c
branch: codex/sandbox/sv7a-int-c
integration_target: main
integration_target_revision: dc5721230fd8aedbf2d9d0457789074b66b48765
starting_base_revision: a6c00a3adf3ac1b30056cb020ad50c6e5b1e66ae
source_pin: a6c00a3adf3ac1b30056cb020ad50c6e5b1e66ae
candidate_revision: uncommitted working tree
last_validated_revision: uncommitted working tree
allowed_files_ref: config/lanes/sv7a-int-c.json
governing_contract_ref: docs/contracts/job-source-intake-v1.md
authorised_route_ref: dispatcher LATER-ITEMS order in current conversation
model_requested: gpt-6.1-sol
effort_requested: medium
model_runtime_confirmed: unknown
effort_runtime_confirmed: unknown
runtime_confirmation_ref: unknown
resumed_from_thread_id: unknown
successor_reason: unknown; dispatcher owns session mapping
last_completed_turn: 23 October 2026 LATER-items follow-up
last_receipt_ref: docs/verdicts/SV7A-INT-C/BUILDER_RECEIPT.md
state: ready for dispatcher commit and fresh review
preflight_ref: LATER items appendix above
result_id: unknown
acknowledgement_ref: unknown
ci_evidence_ref: unknown
reviewer: Claude A and B for starting head only
review_evidence_ref: full-steam jg-runs paths above
accepting_actor: dispatcher reports starting head ACCEPTED
acceptance_evidence_ref: current issued order; no new acceptance claimed
outstanding_holds: fresh exact-head review, CI, carried work and all retained integration/release gates
builder_finished_at: 2026-10-23
coordinator_acknowledged_at: unknown
integrated_at: unknown
merged_revision: unknown
```

Usage counters and turn identifiers are not exposed here; input/cached/cache-write/output/reasoning token counts are `unknown`, not zero. No cache benefit inferred.
