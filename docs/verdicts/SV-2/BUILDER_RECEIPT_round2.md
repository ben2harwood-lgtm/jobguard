# SV-2 builder receipt — round 2 — 7 October 2026

Integration supplied for independent review on PR #119; **not technically accepted**.
This receipt distinguishes source inspection, local execution and CI evidence.
No independent model verdict or separate acceptance is asserted.

## Identity and scope

- Branch/worktree: `codex/sandbox/sv-2`, the issued `sv-2` worktree.
- Starting and unchanged Git HEAD: `056ec36a48d8418cf6b590d73e5622aef10ae03f` (integrator's merge of main into round 1).
- Merged main / observed `origin/main`: `3395d343fd50d979c734daf4946ba293ee2ed836`; round-1 implementation: `464350e` from `e77f442`.
- Changes remain in the working tree. The dispatcher assigns the commit; independent review must bind to that exact commit. No workspace Git mutation, commit, push, merge or PR creation was performed by this builder.
- Read AGENTS, BUILD_PLAN §§2.1–2.4, SH-1, §10.2 and SV-2, the shadow contract, 0094, 0100, affected repositories and all round-1 changed files. No sub-agent or substitute review used.
- Installed dependencies only; no install, download or dependency/lockfile change. Node `v24.17.0`, cached pnpm `10.28.1` via `PATH=/private/tmp/sv2-bin:$PATH`. The shim invokes the cached Corepack pnpm directly.
- Synthetic fixtures only. No live providers, real sends, spending, production activation, decision approval, deployment or release.

## Round-1 answers retained

The original `BUILDER_RECEIPT.md` is unchanged. Its recorded Q1–Q8 answers remain
binding; no round-1 feature or assertion was removed. `SV-2-issued.txt` was not
found in this checkout or the checked project paths; its local path was requested
as an optional clarification. This integration preserves the answers recorded in
the round-1 receipt without claiming a fresh direct inspection of that missing file.

| Answer | Retained implementation boundary |
| --- | --- |
| Q1 / DW3 | Ben's `jobguard-sv2-reveal-lock-split-2026-10-07`, 7 October 20:01: **“split the test”**. No lock table. SV-2 retains the empty-before-lock assertions; SV-4 owes the positive own-revealed-only/wrong-state/job/tenant tests and the shared job lock before audit. |
| Q2 | `LogBuilderExtra → builder_logged`, `AddFinalReviewExtra → final_review`, `ConfirmJobGuardCatch → jobguard_catch`. No command aliases or future commands added. |
| Q3/Q7 | Withdrawal remains a fact/repository seam; support disclosure remains a server-only repository function using the exact support route. No new HTTP or web surface. |
| Q4/Q5 | Shadow roles remain isolated NOLOGIN roles, created in 0100/bootstrap with no support holder appointed. Support conversations require separate emergency membership. |
| Q6 | Run/classification/disposition persistence remains append-only with qualified FKs; no worker/command implementation. SV-5 owes exact lock/locked-line bindings. |
| Q8 | Shared origin/routine edits serialize with ENT-4b. No contractor provenance columns/events/links added. |

SV-1's intentional pre-lock coalescing semantics remain unchanged.

## Round-2 changes and SBOX interaction review

1. Restored exactly the round-1 `propose` substitution in
   `apps/api/src/variation/variation.application.ts`: it calls `logBuilderExtra`
   with the full proposal, actor, null device metadata and optional confirmed-price
   provenance, using **`practice.context`**. Removed only the obsolete proposal
   insert import. SBOX authenticates and checks immutable job ownership before
   parsing, reads, writes and retries. Read behavior and revise/approve/reject code
   are unchanged. A deterministic comparison against both recorded commits passed.
2. Added `variation.application.test.ts`: owned priced/unpriced capture,
   exact provenance/digest use, and missing/invented/stranger refusal before
   repository work or parsing. These use database doubles and are unit evidence,
   not proof of PostgreSQL isolation.
3. Fixed the existing SV-2 test **“the existing application propose action issues
   LogBuilderExtra, with price, and replays”** in
   `packages/db/test/small-builder-origin.integration.test.ts`. Its old unbound
   job and sessionless application would be refused by SBOX. It now issues actual
   synthetic practice sessions, uses the issuer-generated live job and supplies
   the creator cookie. Original price/replay/origin assertions remain; added
   missing/stranger read/write and stranger-replay denial with unchanged
   variation/origin/receipt/audit counts. Execution against PostgreSQL awaits CI.
4. Strengthened the existing SH-1-backfill upgrade test in that same file. After
   applying the supported predecessor through 0094, it snapshots SBOX policies,
   ownership columns/defaults, constraints, triggers, routine definitions and
   EXECUTE ACLs, verifies the five restrictive catalogue policies and five
   ownership/session routines exist, then compares the snapshot after 0100.
   Original exact backfill/count assertions remain. Execution awaits CI.
5. Reviewed the remaining SV-2 SQL/repository/catalog/persistence/bootstrap and
   registry/count files. 0100 alters no practice-session binding, SBOX catalogue
   policy or ownership guard. New shadow roles gain no identity/control-plane
   privileges, role membership or builder route. Shadow rows retain tenant/job
   FKs, FORCE RLS and restricted worker/support grants. The unbound fixtures on
   isolated non-practice tenants and the historical upgrade fixture remain
   deliberate SQL/FK/backfill tests; 0094 permits those paths. Tenant RLS is not
   claimed to authenticate a practice session. Future builder reveal composition
   must also retain `PracticeAccess`; no such route is introduced here.
6. Kept the integrator's migration/export merge and all 47-count/range assertions
   through 0100. Corrected only the SV-2 predecessor description in MIGRATIONS.md
   to 0094 and documented the practice authorization seam in the shadow contract.
7. Changed only the compact **sv-2 line** (line 68) of the lane registry, adding
   the exact new application test path. No other lane line changed.

No migration was edited. `0100_shadow_persistence.sql` is byte-identical to
round 1 (`464350e`), SHA-256:
`640bf62454c168c0071c976c37215ef6b39c49145c22e6522cdbf484275f73a1`.
No second origin backfill or new commercial authorization/money effect.

## Commands actually run

Logs: `/private/tmp/sv2-round2-checks/`. All pnpm commands use the cached shim
specified above. No source assertion, mandatory CI suite or timeout was weakened,
removed or extended. Local selections below do not waive the omitted CI suites.

| Command | Exit / observed result |
| --- | --- |
| `pnpm typecheck` initial / after build | **2 / 0**; first run raced Next regeneration of `.next/types` (TS6053), final run passes **all 7 packages**. |
| `LANE_BASE_REF=origin/main pnpm lint` initial / after build | **2 / 0**; same generated-file race on the first run, final repository guards and **all 7 package checks pass**. No self-comparison refusal. |
| `pnpm build` | **0**; **all 7 tasks pass**, including the optimized Next build (11m27.692s). Turbo cache-write IO and existing Next workspace-root warning recorded, not hidden. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **0**; registered sv-2, permitted changes, `origin/main` differs from HEAD. Final receipt-inclusive repetition below. |
| `pnpm openapi:check` | **1**; tsx launcher cannot bind its IPC pipe (`listen EPERM`). |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | **0**; same source generator/comparison via the Node loader. Committed OpenAPI matches; no regeneration or OpenAPI edit. |
| `pnpm --filter @jobguard/api exec vitest run src` before dependency build completed | **1**; stale DB dist lacked SBOX exports (236 failures / 111 passes); health also hit `listen EPERM 0.0.0.0`. This first run is not a final assertion verdict. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` after DB build | **1**; **345 passed**, one existing SBOX Next-transport test exceeded its unchanged 5,000-ms budget. All five new variation tests passed. Health, already attempted above, needs an environment permitting a listener. Serial rerun below. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src test/verify-evidence-pack-cli.test.ts` | **0**; **3 files / 12 unit tests passed**, no PostgreSQL server. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/shadow-catalog.integration.test.ts test/shadow-persistence.integration.test.ts -t 'registers the issued\|rejects malformed versioned'` | **0**; **2 pure assertions passed**, 10 DB assertions not selected. No database guarantee claimed. |
| `node --test tools/*.test.mjs` | **0**; **42 passed**. Lane-tool tests create their own temporary fixture repositories; the task worktree's Git state is unchanged. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src` first run | **1**; **1,416 passed / 5 failed**, all failures exceeded existing 5,000-ms budgets: four allocator cases and the exhaustive origin-offset case, during concurrent checks. Final quiet run below. |
| `pnpm --filter @jobguard/web test` | **0**; **11 files / 100 unit tests passed**. No browser suite. |
| `pnpm --filter @jobguard/ai test` | **0**; **3 files / 72 tests passed**, fixture/fake adapters only. |
| `pnpm --filter @jobguard/storage test` | **0**; **2 files / 4 tests passed**. |
| `pnpm --filter @jobguard/config test` | **0**; **2 files / 2 tests passed**. |
| Direct strict TypeScript check of the three SV-2 database test files | **0**, including the updated practice fixture and upgrade comparison. |
| `git diff --check` | **0**. |
| Deterministic migration/application/registry comparisons | **0**; unchanged 0100, round-1 propose restored with SBOX context, other application actions unchanged, only sv-2 registry line edited. These are deterministic checks, not independent review. |

The direct test-types command is:

```sh
node node_modules/typescript/bin/tsc --noEmit --skipLibCheck --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --target ES2023 --module NodeNext --moduleResolution NodeNext --experimentalDecorators packages/db/test/shadow-catalog.integration.test.ts packages/db/test/shadow-persistence.integration.test.ts packages/db/test/small-builder-origin.integration.test.ts
```

## Remaining evidence and gates

Per the dispatcher, PostgreSQL/migration/bootstrap/restore and browser suites
were not started locally: this sandbox cannot start PostgreSQL or bind localhost.
`pnpm test` / the API package test wrapper cannot be represented as fully passing
locally: they include the unavailable database/health suites and the tsx launcher.
CI must run their original mandatory commands after the dispatcher pushes.
No install/clean-install proof, live-model run, provider integration or release
approval is claimed. No prompt/model/gateway change requires a new live evaluation.

**Existing round-1 SH-1 assertion conflict remains outside the issued sv-2 lane:**
`shared-money-origin.integration.test.ts` test **“maps every raising command to
exactly one allowed origin, including command-backed builder capture”** expects a
runtime `ConfirmJobGuardCatch` insert with no `source_signal_id` to succeed. 0100's
issued source-required/probe-refusal rules reject it. This was already recorded
in the round-1 receipt; it is not a locally executed PostgreSQL failure. That
SH-1-owned file and 0053 remain unchanged; the integrator must resolve its
compatibility assertion within an authorized lane while retaining command-map
coverage and the runtime refusal guarantee. This receipt does not claim CI green.

Final runnable unit totals: **42 repository tool tests**, **1,421 core**, **346 API**,
**12 DB**, **100 web**, **72 AI**, **4 storage**, **2 config**, plus **2 pure shadow
boundary assertions** all passed in their final runs. The HTTP health test remains
unverified locally because its attempted listener was refused. No PostgreSQL
assertion is included in those passing counts.

Runtime/application facts still require PostgreSQL CI confirmation, including the
new creator/stranger fixture and exact SBOX catalog comparison. Existing variation,
final-account, SBOX-session/catalogue and browser regressions remain mandatory.
D12, D13, G1 and G4-S remain gates, as do SV-4's positive reveal/shared-lock work,
SV-5's lock-line bindings, the integrator's ledger/test-split plan work, an
independent Claude verdict on the dispatcher commit and separate acceptance.
No new operational alert or external action was added; existing audit/role and
forward-fix notes remain applicable.

Intended conventional commit subject and body:
`/private/tmp/jg-msg-sv-2.txt`. The dispatcher commits the working tree.

## Final check results

- `pnpm typecheck`: **0**, all 7 packages, after the build finished regenerating Next types.
- `LANE_BASE_REF=origin/main pnpm lint`: **0**, all guards and all 7 packages, with stable generated files.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src --exclude src/health.test.ts`: **0**, **19 files / 346 tests passed**. This includes all five new variation tests, SBOX application/transport denials and the unchanged Next 401/404 assertion. The HTTP health test remains a separately observed environment failure, owed by CI.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src/receipt-allocation.test.ts src/extra-origin.test.ts`: **1**, **39 passed / 1 existing allocator budget failure**; origin-offset and the other allocator cases pass.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src/receipt-allocation.test.ts -t 'the working size is bounded'`: **0**, the last failing assertion passes in isolation (1.58s), with its unchanged 5,000-ms timeout. Other 33 tests were not selected; they were already exercised above.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src` final quiet run: **0**, **52 files / 1,421 tests passed**, including every allocator/origin test and the SV-1 shadow domain suites. No timeout or assertion changes.
- `LANE_BASE_REF=origin/main pnpm lint:lanes` final receipt-inclusive run: **0**, **19 permitted paths** relative to main, including retained round-1 work. Deterministic retention checks and `git diff --check`: **0**; all migrations/OpenAPI untouched in round 2, 0100 byte-identical to round 1, complete round-1 receipt unchanged and only the sv-2 registry line edited.

The temporary generated-file race was caused by this builder running checks
concurrently with Next's build. It was corrected by waiting for the build and
rerunning the checks; no source/config/test limit was changed. The stale-export
and transient unit-budget failures were likewise resolved through the actual
dependency build and quiet reruns, rather than weakening assertions.
