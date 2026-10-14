# AUDIT-FIX-PKG-LIB-86 — builder receipt

Issued 13 October 2026 by dispatcher 4; built 14 October 2026 in the supplied sandbox. Branch: `codex/sandbox/audit-fix-pkg-lib-86`. Base and unchanged HEAD: `bd959b01e857de0ba7cbd3588bab84add7d0f493` (`origin/main`). No builder commit, push, model verdict or technical acceptance is claimed. The dispatcher must bind review and acceptance to the eventual exact commit.

## Scope and check lane

Read `AGENTS.md`, `BUILD_PLAN.md` §2.4, §§5.5–5.6, §11.5 M4-1/M4-3 and §12.2 repair entries, and the supplied report `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/pkg-lib-86.md`. This is the issued blocking repair to the existing synthetic recovery-source picker, not a new recovery feature or live capability.

Check lane **RED**: the unchanged `lane-floor.py` matching functions with the coordinator's JobGuard map classify the code/test and additive registry entry AMBER and this receipt GREEN. Raise the review to RED because selected sources support a recovery/money claim. The normal script compares commits; the dispatcher must run it against the final committed range. The builder classified the uncommitted paths using those same functions without writing Git objects or changing the lane map.

Exact allow list (one compact new registry line): `config/agent-lane-assignments.json`, `apps/web/app/lib/recovery-case-requests.ts`, `apps/web/app/lib/audit-pkg-lib-86.test.ts`, this receipt. Existing lane entries are unchanged. Registry overlap serializes with the coordinator. No other shared registration file is touched.

## Blocking finding — reproduced, then fixed

**Valid decimal input saves the wrong recovery sources** (`recovery-case-requests.ts:112` in the audited base).

First added only the lane entry and a separate regression file. Ran `pnpm --filter @jobguard/web exec vitest run app/lib/audit-pkg-lib-86.test.ts` against the unchanged picker: **exit 1; 1 passed, 2 failed**. `40` passed; `40.0` and `40.000000` failed at the exact `[RATE, VERSION]` assertion. Received `["Supplier agreement AG-320", "Delivery note DN-320", "Supplier invoice INV-320"]`, exactly the reported defect. The test exercises production `parseSupplierSources` and `merchantSourceRefs` with one recorded rate and invoice `INV-M320-001`. A direct invocation of the installed web Vitest binary independently produced the same 1-pass/2-fail result before the fix (exit 1).

Then changed the picker to remove only an all-zero fractional suffix with one to six digits before comparing the remaining text to `40`. No floating-point conversion; no material row or stored quantity is mutated. The matching price, rate identity, invoice number, uniqueness check and existing fictional fallback labels remain unchanged. Equivalent representations preserve the actual rate and immutable invoice-version IDs.

New coverage checks every supported zero-suffix precision, adjacent unequal quantities, invalid representations (including exponent/whitespace/newline inputs), mixed-representation duplicate rates, wrong price, missing rate and missing/wrong invoice. The existing test file is byte-for-byte unchanged. Post-fix targeted command with both the new regression and `recovery-case-requests.test.ts`: **exit 0; 2 files, 96 tests passed** (20 new, 76 existing).

No blocking finding was dropped: the report's sole BLOCKING finding reproduced with the required failing test. This is source selection/unit coverage; it does not claim a new PostgreSQL persistence or evidence-pack integration run.

## Preservation and invariants

- No existing expected value, refusal, count, pinned name, fingerprint or test body changed. `apps/api/src/auth/context-boundary.test.ts` and all its pinned lists are untouched. No STOP-triggering protected edit was needed.
- Catalogue addition permitted by the standing rule: lane registry **before:** no `audit-fix-pkg-lib-86` entry; **after:** one new exact-allow-list entry for this task. Existing entries unchanged (parsed before/after comparison passed). No premise-establishing setup was inserted before any existing call.
- No migration, grant, role/RLS change, new network action, new dependency, contract/schema/prompt/model change, provider route, real data, spending or production activation. Standard F grant evidence is inapplicable because there is no grant.
- Affected invariants: exact decimal quantities (AGENTS §5.5), preservation of recorded immutable source identities (§5.8; BUILD_PLAN C1), synthetic-only behavior (§5.10; C3), earlier assertions (§1). No commercial-policy decision or fee entitlement is introduced.
- Backwards compatibility: canonical `40`, unmatched-source fallback and duplicate ambiguity remain as before. Only valid equivalent representations gain the recorded source references. No data backfill, migration rollback or new operational alert is needed.

## Later findings — recorded only

**LATER:** `synthetic-server.ts:41` fabricates home-document summaries from job titles, returning delivered quote `Q-1007` for a newly issued Kitchen extension job without persisted quote/delivery records. The report names `home document summaries require persisted document and delivery records`, using a real PostgreSQL practice session and `/api/jobs`. Deferred without code or test changes, as dispatched.

The report's five test-strengthening suggestions are also recorded only:

1. `recovery-case-selection.test.ts:11`: replace test-local old-rule coverage with production `selectedCaseAfterResponse` under concurrent cases.
2. `recovery-case-routes.test.ts:40`: add actual PostgreSQL replay coverage; mock `Map` uniqueness is not durable-effect proof.
3. `invoice-payment-state.test.ts:6`: add full reversal facts (zero paid/full balance) and assert unpaid.
4. `receipt-http-error.test.ts:5`: assert complete expected status/code across read/write modes instead of only excluding `secret`.
5. `recovery-case-requests.test.ts:119`: equivalent decimal coverage is supplied in the new blocking regression file; the existing test remains unchanged.

The instruction to list LATER findings in this receipt only takes precedence over adding adjacent items to BUILD_PLAN's discovered-later register.

## Execution environment and handoff

Node `v24.17.0`; pinned pnpm `10.28.1` from the already-installed Corepack cache. The default PATH pnpm launcher attempted version management and stalled; version probes were interrupted (exit 130). Checks use `/private/tmp/jg-bin-audit-fix-pkg-lib-86/pnpm`, a temporary wrapper invoking that cached pinned CLI. No install/download command was run and no dependency file changed. Installed dependencies and existing Turbo artifacts were reused; a clean pinned installation is not claimed. Cached logs from other worktrees are cached evidence, not commands freshly executed here.

Root `pnpm test` was not run because it starts PostgreSQL and invokes fixture Git writes. No PostgreSQL, browser or localhost listener was started. Sandbox-capable unit runs exclude only identified socket/DB suites and the two Git-writing tool fixture suites; full mandatory suites remain required on the dispatcher Mac/GitHub CI.

All `pnpm` commands below used the temporary cached-CLI wrapper in PATH. Required lint attempts used `LANE_BASE_REF=origin/main`.

| Command/check | Exit | Result |
| --- | --- | --- |
| New regression before fix | 1 | Expected failure: 2 failed / 1 passed; reported source-ID mismatch |
| New regression + existing request tests after fix | 0 | 96 passed / 2 files |
| `pnpm typecheck` | 0 | 7 tasks successful; 4 cached |
| `pnpm build` | 0 | 7 tasks successful; 4 cached; Next production build completed |
| `pnpm turbo run lint` after Next output generation | 0 | 7 workspace lint tasks successful; 4 cached; supplemental to the blocked root lane guard |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed; lane guard refuses self-comparison because HEAD equals origin/main |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same unchanged self-comparison guard; not waived |
| `node tools/money-arithmetic-lint.mjs` | 0 | Passed |
| `node tools/commercial-boundary-lint.mjs` | 0 | Completed; subsequent workspace lint ran |
| Supplemental lane registration / exact working-tree paths / unchanged old registry | 0 | Passed using exported `selectLane` / `matches`; does not replace the mandatory range check |
| `pnpm --filter @jobguard/web test` after dependency builds | 0 | 804 passed / 34 files |
| Safe API unit selection after dependency builds, `--maxWorkers=1` | 0 | 1555 passed / 64 files, including unchanged context-boundary coverage; eight socket/DB files excluded below |
| `pnpm eval` | 0 | 80 passed / 5 AI fixture files; no live-model run or provider call |
| Safe tool tests via temporary runner | 0 | 19 passed; Git-writing lane fixture suites excluded |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | 1 | 2444 passed / 1 failed; existing `receipt-allocation.test.ts:212` stress test exceeded 5000ms (6084ms) |
| Safe DB unit files via temporary runner | 1 | 168 passed / 1 failed; existing `audit-checkpoint-handoff.test.ts:279` source scan exceeded 5000ms |
| Audit-checkpoint unit file alone, unchanged, `--maxWorkers=1` | 1 | 55 passed / 1 failed; same timeout persists |
| `pnpm openapi:check` | 1 | Sandbox refuses `tsx` IPC `listen` (`EPERM`); no listener started |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` after DB build | 0 | Same generator and `--check` flag pass without the CLI's IPC listener |
| `git diff --check` and protected-file byte comparison | 0 | Whitespace clean; existing request test and protected context-boundary file unchanged |

Earlier broader diagnostic runs are retained, not reported as passes: `pnpm turbo run test --filter='!@jobguard/db' --filter='!@jobguard/api'` exited 1 on the core suite (4880 passed / 10 failed across source plus duplicate emitted tests: missing emitted-source paths and timeouts). Config (2), storage (4), and AI (80) passed from cached logs in that run. The first web suite, before the API artifacts finished rebuilding, exited 1 (482 passed / 322 failed, missing exported functions); the later full web run above passed. The first safe API selection exited 1 (1259 passed / 298 failed / 1 existing skip), with missing exports from old DB artifacts and a transitive database isolation fixture not caught by the initial direct-import screen. That fixture's port probe was refused before any PostgreSQL start; it is excluded in the final sandbox run and remains mandatory in CI. The initial direct OpenAPI loader also exited 1 on the missing `ContractorPracticeSessionRepository` export before DB build; the post-build direct check above passed.

The first `pnpm turbo run lint` exited 2 on generated `.next/types` files disappearing while the concurrently launched Next build refreshed its output. This was a builder verification-order error, not a source change; the repeated workspace lint after output generation passed. No timeout, assertion, pinned list or CI control was relaxed to address these diagnostics. Logs remain at `/private/tmp/jg-*-audit-fix-pkg-lib-86.log`; temporary runner and pinned wrapper are outside the repository. Successful Turbo build/typecheck/lint runs also report sandbox IO/cache warnings; their process exits were 0.

The safe API runner uses `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1` with exactly these sandbox exclusions: `src/final-account-lock.isolation.test.ts`, `src/health.test.ts`, `src/shadow-isolation.application.test.ts`, `src/auth/sso/action-paths.test.ts`, and the four contractor HTTP files (`site-visit`, `site-extra-pricing`, `site-extra`, `contractor-practice-session`). They require sockets and/or real PostgreSQL. The safe DB runner includes all five `src/*.test.ts` files and all eight non-integration `test/*.test.ts` files except `free-port.test.ts`, whose purpose requires binding localhost. Safe tool tests exclude `tools/agent-lane-boundary.test.mjs` and `tools/agent-lane-boundary-train.test.mjs` because they invoke Git writes in fixtures. These are execution selections only; no repository suite configuration or test was changed.

## Dispatcher Mac / GitHub CI checks and remaining gates

After the dispatcher commits (using `/private/tmp/jg-msg-audit-fix-pkg-lib-86.txt`) and pushes, run the full checks with installed pinned dependencies on the Mac where permitted, otherwise in GitHub CI. Database and browser suites are explicitly held for that environment:

```sh
pnpm typecheck
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm test
pnpm build
pnpm openapi:check
pnpm eval
pnpm test:db
pnpm test:migrations
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-1-S.spec.ts M4-3-S.spec.ts
pnpm test:e2e
```

Run the unchanged external `lane-floor.py jobguard <repo> origin/main <committed-head>` against the eventual exact commit, with RED review retained for recovery/money effects. C1/C6 evidence: existing source-selection behavior repaired with new unit coverage, no new page, component, route or workflow; the existing recovery/evidence-pack browser journeys above remain mandatory. Run receipt alone is not technical acceptance. Local stress/source-scan timeouts, full DB/migration/browser execution, normal OpenAPI CLI execution, the committed-range lane check, independently recorded verdict and separate acceptance all remain outstanding. No production, commercial or release gate is opened.
