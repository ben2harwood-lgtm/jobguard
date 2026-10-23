# SV6-01 builder receipt — 23 October 2026

Status: BUILT IN WORKING TREE; NOT COMMITTED, PUSHED, REVIEWED, ACCEPTED OR MERGE-READY. Ben merges. This is builder evidence, not an independent verdict.

## Order, base and scope

Issued by the Track A+B dispatcher under decision 74, as provided in this session. The explicit BUILD amendment supersedes the draft's do-not-start dependency hold for this leaf only; accepted SV-5, complete CH-7 and M4-8 bridge/F5/F7 remain MERGE gates. Read repository AGENTS.md, applicable BUILD_PLAN.md §10.2.8, §10.3.1–3, SV-6 and dependency rows, the planning pack's common contract, SV-6 common source/ownership/boundary shapes and full SV6-01 order beginning at line 2973. Read `/Users/benharwood/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261023.md`.

- Worktree: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv6-01`.
- Branch: `codex/sandbox/sv6-01`; integration target: `main` / `origin/main`.
- HEAD, initial base and origin/main: `dc5721230fd8aedbf2d9d0457789074b66b48765`. Initial working tree clean. HEAD remains unchanged; there is no new commit to bind a verdict to yet.
- Assigned builder: Codex; order requests gpt-6.1-sol, medium. No subagents launched and no model routing changed.
- Runtime: Node `v24.17.0`; cached pinned pnpm `10.28.1`; installed TypeScript `5.8.3`, Vitest `4.1.11`. Existing dependencies used; no dependency files changed or installation performed. This was not a fresh clean install.

Exactly six new files, all within the issued allowlist:

1. `config/lanes/sv6-01.json` — exact branch and exact files, CH5-C lane shape, no directory/shared-register grant.
2. `packages/core/src/recovery-attribution-persistence.ts`.
3. `packages/core/src/recovery-attribution-persistence.test.ts`.
4. `packages/core/src/recovery-attribution-persistence.type.test.ts`.
5. `docs/contracts/recovery-attribution-v1.md`.
6. This receipt.

No existing source or test changed. No migration, DB, network adapter, provider, catalogue, routing, shared barrel, package pin, fee engine or allocator changed. No user flow, persistence or approval effect is claimed (C1: pure-core foundation). No external commercial action, new alert or runtime rollback is involved. Removing these new files reverses this additive unintegrated leaf; later consumers must use a coordinated contract revision.

## Existing-symbol inspection and item STOPs

Used `git grep`, not the draft inventory alone. Found the existing `attributionPredicates`, `shadowAttributionV1`, `ShadowAttributionFacts`, `createAttributionFacts`, `qualifiesAttribution`, `assertAttributionBinding` in `packages/core/src/shadow-domain/attribution.ts`. Also verified `createEligibilityFacts`, both reference policy literals, `createSuccessFeeInput`, `deriveShadowSuccessFee`, `exactPenceV1`, `MAX_MONEY_PENCE`, `instantV1`, `freezeShadow`, `shadowId`, `shadowRef`, `VerifiedTenantContext`, `TenantTransaction`, `withTenant`, `UserCommandDispatcher`, `RecoveryAllocationRepository`, `FeeIllustrationRepository`, `ShadowRepository.reveal/emergencyRead/supportDisclosure`. All three named regression files exist. Inspected the lane loader and `git show codex/sandbox/ch5-c:config/lanes/ch5-c.json`; no existing sv6-01 registration/branch grant collision was found.

- STOP — M4-8 runtime handoff: `git grep` found no `RecoveryLineAllocationSourcePort`, nor `readCurrent`/`readCurrentInTransaction` in the existing recovery-allocation repository at this base. These are draft-proposed upstream seams, not available runtime integration. No substitute implementation was added. Contract construction continued as explicitly issued.
- STOP — downstream runtime attribution: proposed `RecoveryAttributionRepository`, qualification service, `buildAttributionSourceSnapshot`, `readCurrentQualifyingSourceInTransaction` are absent at the base. They belong to later leaves; no fabricated server reconstruction, approval or positive-use path was added.
- `dispatchInTransaction` is absent, as the draft itself states. The existing dispatcher remains the proposed later approval owner; no nested/new transaction API was invented.
- No required existing pure attribution predicate/import was absent. No reserved worktree was opened or changed. Actual upstream acceptance/source SHA evidence remains unprovided and held, rather than inferred from symbols being present.

## Conservative choices under Ben's 23 October answer

Each choice applies only to synthetic practice and may change before real customers. None approves D01–D16, G1–G5, real data, providers, spending, fee issuance or collection.

- Refuse incomplete/unknown inputs; admit identity-only public commands. Caller facts, money, actor, tenant, policy, expiry and authorization IDs never enter the public command. Each exact review is a separate explicit command; owner-only dispatcher authorization remains the later runtime boundary. No standing authority or expiry duration was invented.
- Require explicit synthetic markers and explicit policy bundle references. There are no production/policy defaults. Schema-valid JSON and branded types confer no authentication or approval.
- Add required `completeManifests` for baseline, capture and locked-bill inventories: exactly one completed, lock-bound, source-linked inventory per kind with unique item IDs and matching count. Successful zero-item inventories are allowed; omitted/pending/failed ones are refused. This is a conservative serialization extension to the draft requiring source-owner acknowledgement before merge, not an invented source of authoritative completeness.
- Bind every fact/exclusion/dispute citation to the source manifest; ten facts remain mandatory even when false. Retain one coalesced work identity. Never multiply principal by citation count.
- Unresolved dispute excludes; confirmed-extra clears only dispute. Permanent disclosure, surfaced-early, post-lock and pre-adoption exclusions remain. Require positive exact principal for a review-ready/current qualifying source; excluded assessments may retain factual money without qualifying it.
- Preserve exact rational wire values and existing bounds. No rounding, money redistribution, fee calculation, tax, cap or credit implementation added. Current source requires explicit saved allocations, approved review identity and watermark; transactional authenticity/current authorization remain later server responsibilities.

## Tests first and rule-removal evidence

Authored both new test files before the implementation. The initial PATH pnpm launcher attempted automatic version resolution and stalled on unavailable registry/signature verification; it was stopped (exit 130 for the stalled test command). No packages were installed. A separate PATH `pnpm --version` attempt reported unavailable registry verification, so it is not treated as an installed-version check. Subsequent commands used the already-installed pinned runner via `PATH=/private/tmp/jg-ch5-c-tools:$PATH`, whose script invokes `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. Explicit cached `--version` returned `10.28.1` (exit 0).

Because the initial launcher stalled, the executable missing-module red check was obtained with the initial implementation temporarily withheld, after it had been written. This is a controlled absence check, not a claim that the stalled initial run executed tests: both new suites failed import, exit 1, then the implementation was restored. An early typecheck caught an inferred `never[]` fixture field; it was corrected to `string[]`, with no weakened assertion.

Every acceptance ID has a named test and was checked with an actual rule-removal mutation; all five representative mutations were killed, then restored:

| ID | Coverage | Removed rule and observed failure |
| --- | --- | --- |
| S6-01-A | Complete ten-fact server fixture, independent false toggles, false assessment retained | Replaced existing qualification call with true; A failed, exit 1 |
| S6-01-B | Missing predicates, duplicate/foreign/wrong-kind sources, missing/incomplete manifests, predecessor/time/hash/unknown keys, malformed/negative/over-limit fractions, exact 1/3 | Disabled duplicate-source guard; B failed, exit 1 |
| S6-01-C | Identity-only command union and typed errors; detector/browser/raw JSON negative compile assignments | Made assess command passthrough; C failed, exit 1 |
| S6-01-D | Unresolved dispute, confirmed-extra resolution and every permanent exclusion | Bypassed existing exclusion-aware qualification with holds-only test; D failed, exit 1 |
| S6-01-E | Required review/source/policy identity, unique saved allocations, positive principal, no fee/default fields, stale current-source refusal | Made reviewAuthorizationId optional; E failed, exit 1 |

Mutation command for each ID: `pnpm --dir packages/core exec vitest run --maxWorkers=2 src/recovery-attribution-persistence.test.ts -t S6-01-X`; logs `/private/tmp/jg-sv6-01-mutation-S6-01-{A,B,C,D,E}.log`. Focused selection left unrelated cases unselected; the final full named suites ran without skips.

Also temporarily removed the qualifying-source brand: explicit `tsc -p tsconfig.json --noEmit` failed with TS2578 (unused `@ts-expect-error`), exit 2; restored the brand and the final gate passed. `tsc --listFilesOnly` confirmed both new `.test.ts` files are in the compilation set, exit 0. This is compile evidence, not Vitest transpilation presented as type rejection.

## Executed checks and results

Compiler/test/build commands ran serially through `HEAVY_SLOTS=1 /Users/benharwood/.local/bin/heavy-slot sv6-01-<label> ...`; Vitest used at most two workers and at most three files per batch. Free disk was 210 GiB, above the 45 GiB floor. Memory observed at 51%, later 46%; one shared heavy slot was retained throughout. The wrapper reported sandbox-denied `sysctl`/`ps` probes; its scheduler ran, but those probe values are not claimed as verified host process/load measurements.

| Actual command | Result |
| --- | --- |
| `pnpm --filter @jobguard/core typecheck` | Final exit 0 |
| `pnpm --dir packages/core exec tsc -p tsconfig.json --noEmit` | Final exit 0, including negative compile cases |
| `pnpm --filter @jobguard/core lint` | Final exit 0 |
| `pnpm --dir packages/core exec vitest run --maxWorkers=2 src/recovery-attribution-persistence.test.ts src/recovery-attribution-persistence.type.test.ts` | Final exit 0; 2 files, 6 tests passed |
| `pnpm --dir packages/core exec vitest run --maxWorkers=2 src/shadow-domain/attribution.test.ts src/shadow-domain/eligibility.test.ts src/shadow-domain/type-contracts.test.ts` | Final exit 0; 3 files, 14 tests passed |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit 1: lane checker refuses base equal to HEAD; core purity passed first. Not a root-lint pass |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1: same self-comparison refusal. Dispatcher must rerun after commit |
| `pnpm build --concurrency=1` | Exit 0; 7 successful tasks (2 cached). Existing Next compile warnings and sandbox IO warning remain. This is not browser/runtime verification |
| `pnpm --filter @jobguard/core build` | Final exit 0 after final test additions |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC pipe listen EPERM in sandbox |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0: same source/check flag via socket-free loader; no generated file changed |
| `node tools/core-purity-lint.mjs` | Exit 0; existing computed-import notices, 231 TS files checked |
| `node tools/money-arithmetic-lint.mjs` | Exit 0 |
| `node tools/commercial-boundary-lint.mjs` | Exit 0 |
| Lane loader + `lanePathAllowed` over `git ls-files --others --exclude-standard -z` | Exit 0; six working-tree paths allowed; supplemental schema/allowlist check only, not committed-range lane acceptance |
| `git diff --check`; unchanged shadow-domain diff inspection | Exit 0; all previous attribution/eligibility/fee code and tests untouched |

Local log files: `/private/tmp/jg-sv6-01-{red,compile-brand-mutation,final-typecheck,final-tsc,final-package-lint,final-tests,final-regression,lint,lanes,build,openapi,openapi-loader,final-core-build,listfiles,purity}.log`. Scripts for sequential execution and mutation reproduction are in `/private/tmp/jg-sv6-01-{checks,final-checks,mutations}.py`. These are local execution artifacts, not CI artifacts or independent reviews.

## Holds and handoff

- Parent dependencies and exact source/schema/authority acknowledgements remain merge holds: accepted SV-5, complete CH-7, M4-8 bridge and saved F5/F7 proofs. The conservative complete-manifest extension must be acknowledged by the source owners; no upstream acceptance is claimed.
- No database, migration, browser, restore, provider, live-model or full-root test suite was run. Pure-core changes add none of those effects; required exact-commit CI and all aggregate parent journey gates remain. DB/browser execution is additionally prohibited by this issued sandbox order. No CI run or artifact identity exists for this uncommitted work.
- Dispatcher must commit, rerun root lint/lint:lanes and required CI, integrate any narrow shared export serially, and bind fresh evidence to that final commit. No shared export change is needed to build this standalone module; consumers require coordinator-owned registration.
- Independent Claude A and B verdicts and separate fresh-context acceptance are absent and held. Builder does not accept its own work. No policy/release approval is inferred from tests. Parent SV-6 remains incomplete.
- Intended conventional commit subject/body saved to `/private/tmp/jg-msg-sv6-01.txt`. No git write commands, commit, push, merge or PR creation performed.


## r1

23 October 2026. Repair order from the Track A+B dispatcher; builder Codex (issued gpt-6.1-sol, medium). Starting HEAD `106cd0a3fddb7222cb1c9fbac309f1b6c0f75abd`, branch `codex/sandbox/sv6-01`, initially clean working tree. This section supersedes earlier missing-review statements only to record receipt of Claude B's review of that starting commit; it does not claim independent review of this repair, technical acceptance or merge readiness.

Read the named verdict in full before changing code: `/Users/benharwood/.local/share/full-steam/jg-runs/v5-sv6-01-claude-B-106cd0a3-20261023.md` (REPAIR, two BLOCKING findings). The repository-relative path was absent; the full dispatcher file was located under full-steam. Re-read AGENTS.md, the lane allowlist, the leaf contract and BUILD_PLAN.md §10.2.8 and §10.3.1–3. Only the two issued blockers are addressed. Claude A and B's LATER findings are outside r1.

Changes: derive a local lowercase-only UUID schema from the existing shared UUID validator and use it consistently for this module's identity fields. Refuse uppercase without silently normalising; existing equality and uniqueness guards then agree with PostgreSQL UUID identity. Shared shadow-domain schemas and all earlier tests are unchanged. Update the leaf contract to state this wire restriction. Add five case-variant regressions, ten false-fact cases with nonempty reasons, four permanent-exclusion cases with nonempty reasons, and the zero-principal case. Each case also has a valid lowercase or correctly excluded control. No database, provider, fee formula, approval or commercial policy changed. The compatibility change intentionally rejects previously accepted uppercase wire IDs.

### Tests and actual guard removals

Before the lowercase fix, the two leaf files executed with **5 failed / 21 passed**, exit 1: all five newly added case-variant regressions reproduced the blocker. With the fix, **26 passed**, exit 0. The compiler then caught an inferred `never[]` in the new inventory-test construction; the construction was corrected without changing assertions or existing fixtures. Initial compiler/lint/build failures are retained in `/private/tmp/jg-sv6-01-r1-initial-*.log`.

For each mutation below, the actual production guard was removed locally, the named Vitest selection executed with `--maxWorkers=2`, failures were recorded, and the exact production source was restored in a `finally` block. No mutation remains. These are builder-executed mutation checks, not an independent model verdict.

| Removed guard | Failing test names observed | Result |
| --- | --- | --- |
| Lowercase UUID refinement (replaced with the original UUID schema) | `S6-01-B r1 refuses case-variant source identities under different kinds`; `S6-01-B r1 refuses an allocation relisted as a case-variant invoice line`; `S6-01-B r1 refuses a case-variant self predecessor`; `S6-01-B r1 refuses case-variant duplicates in frozen inventories`; `S6-01-B r1 refuses case-variant duplicate qualifying allocations` | Exit 1, all 5 failed |
| Entire outcome/ready agreement guard (original line 87) | `S6-01-A r1 refuses eligible outcome with reasons and false absent_from_builder_captures_at_lock`, plus all nine other `attributionPredicates` parameter cases; `S6-01-D r1 refuses eligible outcome with reasons and permanent disclosed_before_lock`, plus `surfaced_early`, `evidence_after_lock`, `pre_adoption_evidence` parameter cases | Exit 1, all 14 failed |
| Positive principal conjunct `&& BigInt(v.remainingPrincipal.numerator) > 0n` (original line 86) | `S6-01-A r1 refuses eligible outcome with zero principal and all facts true` | Exit 1, 1 failed |

Reproducer: `/private/tmp/jg-sv6-01-r1-mutations.py`. Mutation logs: `/private/tmp/jg-sv6-01-r1-mutation-{canonical-ids,outcome-guard,positive-principal}.log`. Focused mutation runs intentionally leave unrelated tests unselected; the final full leaf run selects both files without skips.

### Verification and handoff

Used the existing installed Node `v24.17.0`, cached pnpm `10.28.1` via `PATH=/private/tmp/jg-ch5-c-tools:$PATH`, TypeScript `5.8.3` and Vitest `4.1.11`. No dependency installation or download. Commands ran sequentially through `HEAVY_SLOTS=1 /Users/benharwood/.local/bin/heavy-slot`; repository checks set `LANE_BASE_REF=origin/main`. Free disk observed 202 GiB and free memory 72–73%. The wrapper's `sysctl`/`ps` probes were sandbox-denied; host process/load measurements are not claimed. Final command logs are `/private/tmp/jg-sv6-01-r1-<label>.log`; the sequential driver is `/private/tmp/jg-sv6-01-r1-checks.py`.

| Actual final command | Result |
| --- | --- |
| `pnpm --filter @jobguard/core typecheck` | Exit 0; includes negative compile tests |
| `pnpm --filter @jobguard/core lint` | Exit 0 |
| `pnpm --dir packages/core exec vitest run --maxWorkers=2 src/recovery-attribution-persistence.test.ts src/recovery-attribution-persistence.type.test.ts` | Exit 0; 2 files, 26 tests passed, no skips |
| `pnpm --dir packages/core exec vitest run --maxWorkers=2 src/shadow-domain/attribution.test.ts src/shadow-domain/eligibility.test.ts src/shadow-domain/type-contracts.test.ts` | Exit 0; 3 files, 14 tests passed, no skips |
| `pnpm typecheck --concurrency=1` | Exit 0; 7 tasks successful, 2 cached |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit 0; 7 tasks successful, 2 cached; core purity, lane, money and commercial checks included |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0; sv6-01 lane, base dc572123, head 106cd0a3 |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Both exit 0 |
| `pnpm build --concurrency=1` | Exit 0; 7 tasks successful, 2 cached; existing Next dependency-expression and sandbox IO warnings |
| `pnpm openapi:check` | Exit 1; tsx CLI IPC pipe listen EPERM in sandbox |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same generator/check through the socket-free loader; generated file unchanged |
| `git diff --check`; working-tree path comparison with the leaf allowlist | Exit 0; exactly 4 permitted modified files |

No tests were deleted or weakened. Only the leaf implementation, its runtime test file, its contract and this receipt changed. Existing type tests, shared predicates and earlier regression suites are unchanged. No migration or data backfill; no new external action or operational alert. No AI prompt/model/parser/gateway change, so no model evaluation applies. No clean install, full-root test suite, PostgreSQL, browser, provider or live-model run is claimed. Database/browser suites remain for dispatcher CI under the issued sandbox restriction. The pure leaf supplies no runtime DB/browser integration.

Independent re-review of the repair and separate acceptance remain held, along with the existing source-owner/dependency and production gates. Root lane checks passed on the current starting commit plus working tree; dispatcher must bind CI and fresh verdicts to the eventual commit. This r1 does not resolve later review rounds or grant production fee authority.

Intended conventional commit subject/body written to `/private/tmp/jg-msg-sv6-01.txt`. No git write commands, commit, push or PR creation. HEAD remains `106cd0a3fddb7222cb1c9fbac309f1b6c0f75abd`; dispatcher owns commit/push and CI.
