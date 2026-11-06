# Recovery UIWIRE-15 read recovery

READY — NOPR. RED: customer-money/progress display. Ready for router commit and push; not independently reviewed or browser-verified.

## Scope and source evidence

Plan: UIWIRE-15 / M1 persisted core journey and DEMO-S (`BUILD_PLAN.md` §10). Both HEAD and local origin/main are `62081c68933d0b953e7dd75a8cbd7b3a2fb4f304`. No fetch was run. Read the audit with `git show origin/codex/sandbox/branch-audit:docs/review/unmerged-branches-2026-11-05.md` and the old source at `origin/codex/sandbox/uiwire-15-read-recovery` (`a43bcbfff`). Main still used optionalJson, converted failed reads to missing facts and published an initial zero snapshot, with no request lifetime guard. The repair was still missing.

Ported only the component and its browser regression spec, plus this receipt and the branch lane. The current successful progress fields, completion predicate, next-step logic and formatting remain unchanged. No migrations, API contracts, business commands, financial calculations or grants changed. All authored scenarios use synthetic data. No Git metadata was written, and no commit, push, PR, merge or deployment was performed.

## Recovered behavior

Loading and failed reads suppress balance, next-step and completion claims until a complete validated read succeeds. Successful projections use the current schemas and validate job IDs wherever the contract provides them. Exact lifecycle absences remain allowed: draft proof 404/NOT_FOUND; pre-activation variations 400/ACTIVATION_REQUIRED; unprepared fee illustration 404/NOT_FOUND. Other HTTP, transport, JSON, schema and wrong-job failures show an explicit error and GET-only retry. Fee illustrations have no job ID in their existing response contract; their request remains bound to the current job.

Job/status-keyed state, a request generation and AbortController prevent replaced or unmounted requests from publishing. Keyboard retry can focus its own error; automatic failure and an abandoned requested check preserve the user's newer focus. The retry target is at least 44px. No shared request framework was added.

The recovered Playwright file covers pending reads, faulty response boundaries, lifecycle near misses, overlapping reads, completed-state refresh failure, persisted backend recovery/reopen, GET-only retry, keyboard focus and phone overflow. It retains the actual v1 sample journey and existing Final Check helper; successful business responses are not mocked.

## Checks actually run

Runtime: Node v24.17.0. Pinned pnpm 10.28.1 was invoked as `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs` (abbreviated P below). Installed dependencies only.

- `P --filter @jobguard/web typecheck` — PASS.
- `P --filter @jobguard/web exec playwright test --list UIWIRE-15-READ-RECOVERY.spec.ts --workers=2` — PASS, 6 cases discovered (3 each for mobile-360 and desktop). Discovery only; no browser or database started.
- `P --filter @jobguard/web exec vitest run app/ui/workspace-lifecycle.test.ts app/ui/practice-receipts-state.test.ts --maxWorkers=2` — initial import failure because @jobguard/core/dist was absent; no tests executed on that attempt. `P --filter @jobguard/core build` passed, then the identical Vitest command passed: 2 files, 33 tests. These supporting regressions do not execute the new browser cases.
- `node --check tools/agent-lane-boundary-lint.mjs` — PASS.
- `node tools/agent-lane-boundary-lint.mjs` — refuses the uncommitted HEAD=origin/main range: “Missing branch or self-comparison range; refusing a misleading pass.” No false lane PASS claimed.
- Direct Node assertions using the tool's exported `loadLanePolicy` and `lanePathAllowed` — PASS: lane branch matches exactly; all 4 changed/untracked files are permitted; its allow list equals the 3 non-lane files and does not list itself. This verifies working-tree policy, not a committed comparison range.
- `git diff --check` and explicit whitespace checks of the new files — PASS.

The default PATH pnpm version probe stalled and was interrupted; all actual checks used the pinned installed pnpm entrypoint above. No packages were downloaded.

## Named holds for landing

1. Router must commit, push the NOPR branch and rerun the standard lane command against the resulting real comparison range. No PR opened here.
2. CI must run the recovered `UIWIRE-15-READ-RECOVERY.spec.ts` and existing `UIWIRE-15.spec.ts` on both configured browser projects, with the real PostgreSQL-backed application and at most 2 workers, proving the failure/retry/focus paths and unchanged complete journey. No database or browser is available in this sandbox.
3. Required current-head CI checks (typecheck, lint, tests, build and applicable e2e) must pass against current main. Local supporting tests and discovery do not replace them.
4. One independent RED review at the exact landing head is still required. This builder's source inspection is not that review.

LATER / SIMPLICITY — initial source review, `apps/web/app/ui/practice-journey.tsx`, final successful-state render: format the existing compressed next-step/JSX block across readable lines in a later focused change. This makes progress decisions easier to maintain without adding another abstraction. It does not block this recovery.
