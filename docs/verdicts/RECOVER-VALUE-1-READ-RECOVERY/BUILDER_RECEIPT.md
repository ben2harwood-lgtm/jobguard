# READY — recover-value-1-read-recovery

Plan piece: VALUE-1 recovery / CH-9 value, BUILD_PLAN.md §10 (CH-9). RED: money display. NOPR; router owns commit and push. Synthetic data only.

## Recovery and scope

Source: origin/codex/sandbox/value-1-read-recovery at b729dc74956aec4209dfc85bfe9a1ad79d9bd5db. Audit read with git show from origin/codex/sandbox/branch-audit:docs/review/unmerged-branches-2026-11-05.md.

The change is still missing on current main (origin/main and this worktree base: 62081c68933d0b953e7dd75a8cbd7b3a2fb4f304): job-value.tsx retained unkeyed value/error state, accepted another job ID and allowed old requests to publish. The recovery browser spec was absent. Ported only the component repair and its regression spec; no old branch merge, fetch, Git mutation or migration.

The page now hides previous money and source links during pending/failed reads, validates schema and response job identity, binds state to the requested job, and ignores superseded responses after refresh, navigation or unmount. Automatic failures announce an alert without taking unrelated focus. An explicitly retried failure focuses the heading after render when focus has not moved elsewhere. All reads remain GET/no-store; no calculation, authorization, API, database or commercial policy changes.

The recovered browser spec covers transport/HTTP/JSON/schema failures, retry focus, pending-state concealment, overlapping success/failure reads, late job-A success after job-B navigation, GET-only behavior, real persisted sources, reload/reopen, phone and desktop layout. Scoped the loading-status query to main because current main also renders JobMappedValue with its own status. Confirmed the existing debug router is exposed in installed Next 16.4.2 app-router-instance.js, including production; it is used only by the test to preserve the in-flight client request. Current API contract imports only Zod; imported journey helpers do not statically import core or db.

## Local validation

- PASS: node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false.
- PASS: from apps/web, node node_modules/@playwright/test/cli.js test --list --workers=2 VALUE-1-READ-RECOVERY.spec.ts — six cases discovered (three each on mobile-360 and desktop). Discovery is not browser execution.
- PASS: git diff --check and explicit whitespace/newline checks for all four changed files.
- Standard lane checker executed: node tools/agent-lane-boundary-lint.mjs. It refused with “Missing branch or self-comparison range” because HEAD equals cached origin/main on this uncommitted recovery branch. No Git state was changed to bypass it.
- PASS: direct Node assertions using the existing loadLanePolicy/lanePathAllowed exports validated the exact branch, exact equality between the lane allowlist and all changed non-lane paths, and authorization for all four changed files. The lane does not grant itself. This validates working-tree scope, not a committed-range CI result.

No PostgreSQL, browser, localhost server, provider or real-data execution ran. No package downloads requested. No migrations required. No complexity beyond the recovered keyed state and monotonic request lifetime.

## Named holds for landing

- CI browser proof: run VALUE-1-READ-RECOVERY.spec.ts and existing VALUE-1.spec.ts on mobile-360 and desktop against the production build and real synthetic PostgreSQL backend (at most two workers). Prove failures/retries, stale-request suppression, navigation, exact source links and existing invoice/receipt reversal behavior.
- Current-head CI: rerun the standard lane checker after the router creates the commit; required pinned-install typecheck, lint, test and build checks remain required. Local discovery does not replace browser or integration execution.
- Independent RED review at the exact landing head and green CI against current main remain required. No independent review, merge, deployment or release is claimed here.

LATER / SIMPLICITY — apps/web/app/ui/job-value.tsx: consider reusing apps/web/app/lib/pounds.ts after verifying identical formatting; one currency formatter reduces duplicate display maintenance. Initial source-review suggestion only; non-blocking and outside this recovery.

## Batch-48 landing continuation — 5 November 2026

The router merged ac0886c64 into batch-48 at e3972cb26 before this continuation.
The overlapping-read test now keeps a nonmatching interception route registered
while its one-shot routes expire. All success responses still use the real
backend and every existing assertion is preserved. No additional product repair
or migration was needed; the working tree started clean with no unmerged paths.

Re-executed the unchanged lane CLI: PASS for batch-48 and all 19 changed paths.
The previous batch handoff's removed-lane hold is cleared. Playwright discovery
for both recovery specs passed: 12 cases across mobile-360 and desktop, with
`--workers=2`; this is collection only. `git diff --check origin/main...HEAD`
and `git diff --check` passed. PostgreSQL/browser execution, full required CI
against current main and an independent exact-head RED review remain named
holds for landing. No Git writes, provider calls or downloads were performed.

Web TypeScript also passed on the merged tree:
`node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false`.
