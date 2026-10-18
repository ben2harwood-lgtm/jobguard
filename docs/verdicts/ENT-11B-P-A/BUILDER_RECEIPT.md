# ENT-11B-P-A builder receipt

Practice sandbox — synthetic data; nothing is sent or charged

Builder: Codex (issued gpt-6-astra lane), 18 October 2026. Check lane **RED**. Working tree only; no git add/commit/push. Initial HEAD and origin/main were `71d525dec8de95a89ab923be298f9d18b3408e31`, newer than the draft base `b881f90b`. Bound merged seams were reinspected; no open ENT-6B, ENT-7-P or ENT-8a-P branch consumed.

Status: built for review; **not accepted, not independently verified**. No resulting commit exists yet. Dispatcher must obtain a real different-model verdict bound to the resulting commit and a separate acceptance. Founder owns push/merge/release. Parent ENT-11b remains open for the actual billing-to-statement composition; screens remain parked by the finishing order.

## Scope and source bindings

Read local AGENTS.md, applicable BUILD_PLAN.md contractor/dashboard/ENT-11a/ENT-11b contracts, Ben's 17 October answers and finishing order, and the superseded 13 October draft. Bindings: ENT-11a `0edb85b7` (Northside commands, run, attribution); ENT-9B `f9288fec` (current scoped session reads and held billing); ENT-9A `7ff452ee` (baseline preparation only); ENT-6 `b3386186`, ENT-7 `31682762`, ENT-8B `e0ecb254` (explicit persistence limitations). Exact full commits/paths are also in the sales register. Builder receipts are source evidence, not independent verdicts or executed-test evidence.

New internal wrapper delegates the complete authorized dashboard result unchanged, without caching or fallback. Strict versioned query/principal boundaries reject authority/mode/money overrides. Server synthetic mode only. Explicit export/billing/payment/statement holds preserve null billed/paid values. Separate six-month JSON/CSV fictional baseline example delegates unchanged dependency arithmetic, hashes, methods and exports; no implicit live cohorts or stored-history claim. Compact source-only sales edition and closed claim register reject unsupported promises. No routes, controllers, UI, exports, authority, shared files or dependency implementation edits.

Invariants affected/preserved: AGENTS §§5.1, 5.3–5.8, 5.10, 5.13, 5.15–5.16. No commercial writer or provider initialization. DB test uses existing business commands and existing four-actor practice switches. Local client-link setup queues the dependency's fake_email work but executes no delivery; snapshots are around reads after setup. New reader exposes no owner run summary or another actor's attribution. PostgreSQL assertions are authored, not executed.

Migration **NONE** (0194 unused). No DDL, grant, backfill, store, routine, policy or trigger. Additive internal API only; no caller wired, backwards-compatible. No new operational alert or external data flow. Disable by ceasing internal calls; forward-fix by a reviewed additive-module change; preserve all existing audit/command/evidence history. Runbook: `docs/operations/contractor-full-demo-package.md`.

Lane file intentionally does not list itself: issued instruction overrides the contradictory draft JSON, and MERGE-CHURN-1 checker enforces that rule. No lane expansion.

## Actual execution evidence

Dependencies were already installed; no frozen install was run. Initial global `pnpm --version` probes unexpectedly attempted a package-manager version switch and failed registry fetch/signature verification; no package was downloaded. Verification then used the already cached pinned CLI directly. Default Node is **24.17.0**, not required **24.15.0**; cached Codex runtime was **24.19.0**, also unsuitable. No approved pin change claimed. Cached **pnpm 10.28.1** was used via `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`; later a `/private/tmp/jg-ent-11b-p-a-bin/pnpm` symlink put that exact version first on PATH for nested commands. Global pnpm wrapper is 11.8.0 and was not used for test/check execution. Clean pinned-install verification remains CI-owned.

- Initial direct Vitest attempt: **UNRUN**, two suites failed to resolve unbuilt `@jobguard/core`, zero assertions; sales file write initially used the wrong cwd and was corrected. Log `/private/tmp/ent-11b-p-a-red.log`.
- Built existing dependency outputs using `./node_modules/.bin/tsc -p packages/{core,config,storage,db}/tsconfig.json` (four sequential commands), exit 0; no tracked source changed. DB output log `/private/tmp/ent-11b-p-a-deps.log`.
- Failing-first command: cached pnpm `--filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/full-demo-package.application.test.ts src/contractor/full-demo-package-baseline.test.ts src/contractor/full-demo-package-sales.test.ts`: **RED**, 3 files / 11 tests failed at assertions before behavior implementation (minimal throwing application/preparation stubs, absent sales artifacts). Log `/private/tmp/ent-11b-p-a-red2.log`.
- Same command after implementing: **GREEN**, 3 files / 11 tests passed. Log `/private/tmp/ent-11b-p-a-green.log`. This proves wrapper behavior with a mocked dashboard seam and real reference baseline/claim validation, not persisted reads.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: PASS. Log `/private/tmp/ent-11b-p-a-lanes.log`.
- Remaining local verification results are recorded below after completion.

## Acceptance and holds

A01–A11: unit assertions red then green. A12–A16: real-PostgreSQL tests authored, **NOT RUN / HOLD** under explicit no-PostgreSQL local order. No database failing-first result claimed; CI must execute the file and retain all unchanged Northside/reset/attribution, dashboard-scope, auth-context, tenancy/privilege and migration regressions. Integration tests add no successful database fake. Root test suites and ENT-11a browser coverage remain mandatory in CI; no Playwright invoked locally. No new model/prompt/parser change; live-model evaluation inapplicable, existing fixture evaluation mandatory.

STOP — export/billing/payment persistence: ENT-6B prerequisite missing; typed holds only. STOP — persisted statement/approval/reconciliation: ENT-7-P prerequisite missing. STOP — persisted prompt confirmation: ENT-8a-P owns it. STOP — durable historical import/authenticated historical reads: ENT-9 owns missing storage/authority. These items do not stop independent A work and do not authorize local replacement operations. No other new fee, access, retention, real-data, provider, certification or savings policy introduced. No outward customer promise or sale is made.

Release gates D01/D02/D03/D08/D09/D16 and all other real-data, commercial/provider and production gates remain closed. No timing, physical device, human rehearsal or on-screen proof claimed. Decision 74 BUILD-DON'T-MERGE does not apply to authorized A, but this builder neither accepts nor merges it.

## continuation — 18 October 2026

Resumed dispatcher-committed candidate `2f418407ea09f9aea9653ce0c024460730479874`. Read this receipt, local AGENTS/plan contracts, binding Ben answers/finishing instruction and superseded draft, and inspected the candidate against origin/main. At continuation, origin/main is `c4f929f5a37bbc2639186fa3e2a4b2e7adc1ec3a`; merge base remains `71d525dec8de95a89ab923be298f9d18b3408e31`. The two-endpoint diff includes later main-only work; the merge-base diff contains exactly A's 13 files. No newer-main changes were reverted or copied. The unchanged Northside command/session/evidence/attribution and scoped-dashboard seams were reinspected. No migration or implementation expansion was needed.

Continuation changed only sales-test validation and this handoff documentation. Initial A01–A11 rerun executed 11 tests: 10 passed, A11 timed out after 5 seconds because invalid final claims repeatedly spawned Git evidence checks for preceding claims. This is an executed timeout, not new failing-first domain evidence. Validation now checks all editorial assertions before any source lookup, preserving every rejection assertion and the default timeout. Evidence ancestry additionally checks origin/main as well as HEAD, so branch ancestry alone cannot establish merged evidence. The second invocation passed all 11 tests in three files. Earlier recorded failing-first evidence remains the original builder's evidence, not a rerun or independent verification by this continuation.

All continuation commands use existing dependencies, Node **24.17.0** and cached pnpm **10.28.1**, with `PATH=/private/tmp/jg-ent-11b-p-a-bin:$PATH` for pnpm commands. No downloads, frozen install or pin changes. This remains non-pinned local evidence; CI must run Node 24.15.0 and a frozen install.

- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/full-demo-package.application.test.ts src/contractor/full-demo-package-baseline.test.ts src/contractor/full-demo-package-sales.test.ts`: initial **FAIL**, A11 timeout, 10/11 passed; same command after the test fix **PASS**, 11/11. Logs `/private/tmp/ent-11b-cont-unit.log` and `/private/tmp/ent-11b-cont-unit-green.log`. Sequential invocations, no PostgreSQL or browser invocation.
- `pnpm typecheck`: **PASS**, 7 tasks, 2 cached; log `/private/tmp/ent-11b-cont-typecheck.log`.
- `LANE_BASE_REF=origin/main pnpm lint`: **PASS**, repository lint and 7 tasks, 2 cached; log `/private/tmp/ent-11b-cont-lint.log`.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: **PASS**, assigned RED lane, exactly 13 candidate paths; log `/private/tmp/ent-11b-cont-lanes.log`.
- `pnpm openapi:check`: **BLOCKED** before generator execution by sandbox `EPERM` on tsx IPC listen; log `/private/tmp/ent-11b-cont-openapi.log`. Equivalent generator invocation from apps/api, `node --import tsx src/generate-openapi.ts --check`: **PASS**, exit 0; log `/private/tmp/ent-11b-cont-openapi-direct.log`. No schema changed.

PostgreSQL A12–A16, `pnpm test:db`, `pnpm test:migrations` and all browser suites: **NOT RUN**, explicitly prohibited locally. Root `pnpm test` is **NOT RUN** because it includes PostgreSQL; CI must retain the entire mandatory suite and existing fixture evaluation. No Playwright, provider, model evaluation or live integration was run. Authored DB cases are not executed proof. No new external effect, migration, money/access rule, alert or release-gate change; all scoped STOPs above remain. Exact-result-commit different-model review and separate acceptance are still required after the dispatcher commits. No commit/push/merge was performed by this builder.

- `node --test tools/*.test.mjs`: **PASS**, 100/100; log `/private/tmp/ent-11b-cont-tools.log`. These deterministic tooling tests create disposable Git fixtures in temporary directories; they do not commit or change this worktree's Git history.
- Commit-message handoff: `/private/tmp/jg-msg-ent-11b-p-a.txt` (conventional subject and body). Dispatcher owns the resulting commit and review binding.
- `pnpm build`: **PASS**, 7/7 tasks, 2 cached; log `/private/tmp/ent-11b-cont-build.log`. Existing Next workspace-root/dynamic dependency warnings and Turbo cache-write EPERM warnings were nonfatal. This is a build, not browser execution.
- Final `git diff --check`, repository lint and lane check passed after documentation updates. Continuation modifies only the sales unit test, ledger and receipt; the aggregate candidate remains within the 13-path issued lane. Local authorized work is complete for dispatcher handoff; acceptance remains HOLD for the explicitly unrun checks and independent verdict.
