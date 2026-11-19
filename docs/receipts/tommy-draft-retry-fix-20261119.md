# Edited-source capture retry fix — 19 November 2026

Base: `896a701157ef71c81905da93bca4299d105c775a`.

Branch: `codex/sandbox/tommy-draft-retry-fix-20261119`.

## Defect and scope

The hosted WalkIt flow was observed to create a draft, then show `DATABASE_UNAVAILABLE` after the source text was corrected and submitted again. Source inspection found that WalkIt reused one capture ID for its whole mount. The database correctly refuses different source bytes or provenance under that ID with `CaptureConflictError`; the HTTP route misclassified that typed conflict as a database outage.

This change binds capture IDs to complete submitted snapshots, including the requested tenant, text, dictation acquisition metadata, and fixture. Identical retries, including a lost response and returning to an earlier submitted snapshot, keep the same ID. Changed source gets a separate draft; earlier saved jobs and their immutable source remain intact. Editing a source clears the displayed earlier proposal so it cannot be mistaken for the edited draft.

A synchronous pending guard suppresses double clicks, and the source/dictation controls are disabled while a request is outstanding. Typed capture conflicts now return HTTP 409 with `CAPTURE_ID_REUSED`; unexpected failures remain HTTP 503 without private error details. Conflict copy gives a recovery step instead of repeatedly suggesting the same conflicting request.

No database repository, migration, fee policy, session logic, scope identity, commercial authorization, or stored record is changed or deleted. Capture identities remain in memory for the current mount; this change does not claim retry continuity across a page reload.

## Verification executed in the isolated worktree

All commands used the pinned toolchain on `PATH`: `/workspace/scratch/e06a45857489/jobguard-test-toolchain/node_modules/.bin`.

| Command | Observed result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile unchanged. |
| `pnpm turbo run build --filter=@jobguard/web^...` | Passed, six dependency package builds restored from the shared local Turbo cache. No Next server or database was started. |
| `pnpm --filter @jobguard/web exec vitest run app/ui/walk-it-retry.test.tsx app/api/jobs/capture/route.test.ts --maxWorkers=1` before the fix | Four failures and six passes. Failures reproduced edited-source/provenance conflicts, duplicate pending submits, and incorrect HTTP 503 mapping. |
| `pnpm --filter @jobguard/web exec vitest run app/ui/walk-it-retry.test.tsx app/api/jobs/capture/route.test.ts app/ui/jobguard-linked-entry.test.tsx --maxWorkers=1` after the fix | Nineteen tests passed in three files. |
| `pnpm --filter @jobguard/web typecheck` | Passed. |
| `node tools/lint.mjs` before the first commit | Core purity passed; lane check correctly refused the self-comparison range while HEAD still equalled the base. Recheck after committing. |
| `LANE_BASE_REF=896a701157ef71c81905da93bca4299d105c775a node tools/lint.mjs` after the first commit | Passed, including the lane boundary over all seven changed paths. Eleven existing computed-import notices were reported without refusal; no lint rules were changed. |
| `git diff --check` | Passed. |

The component tests use the repository's existing hook harness and a simulated capture boundary. They prove request identity and displayed-state behavior; they do not prove PostgreSQL persistence. Route tests use the real exported error classes and a stubbed application boundary.

## Browser acceptance prepared, not executed by this builder

The added test in `apps/web/e2e/capture.spec.ts` drives the existing browser form against the real capture route. It checks successful initial capture, corrected source creating a different draft, unchanged retries returning the same job, a reused ID with different input returning 409, and returning to the original snapshot retrieving its original job and source.

The coordinating agent owns the browser/database runner and independent review. Run the affected capture suite with the existing desktop and mobile-360 projects, plus the relevant WALK-stress regression. No browser run, full CI, deployment, or independent review is claimed in this receipt. This branch has not been pushed, merged, or deployed by this builder.

The lane check requires a committed comparison range. The handoff records its result against this branch's final commit, using `LANE_BASE_REF=896a701157ef71c81905da93bca4299d105c775a node tools/agent-lane-boundary-lint.mjs --lane=tommy-draft-retry-fix-20261119`.
