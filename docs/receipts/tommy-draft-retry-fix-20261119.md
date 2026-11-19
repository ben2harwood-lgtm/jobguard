# Edited-source capture retry fix — 19 November 2026

Base: `896a701157ef71c81905da93bca4299d105c775a`.

Branch: `codex/sandbox/tommy-draft-retry-fix-20261119`.

## Defect and scope

The hosted WalkIt flow was observed to create a draft, then show `DATABASE_UNAVAILABLE` after the source text was corrected and submitted again. Source inspection found that WalkIt reused one capture ID for its whole mount. The database correctly refuses different source bytes or provenance under that ID with `CaptureConflictError`; the HTTP route misclassified that typed conflict as a database outage.

This change binds capture IDs to complete submitted snapshots, including the requested tenant, text, dictation acquisition metadata, and fixture. Identical retries, including a lost response and returning to an earlier submitted snapshot, keep the same ID. Changed source gets a separate draft; earlier saved jobs and their immutable source remain intact. Editing a source clears the displayed earlier proposal so it cannot be mistaken for the edited draft.

A synchronous pending guard suppresses double clicks. While a request is outstanding, source editing and dictation start/install/apply controls are disabled; Stop listening and Cancel dictation remain usable. Typed capture conflicts now return HTTP 409 with `CAPTURE_ID_REUSED`; unexpected failures remain HTTP 503 without private error details. Conflict copy gives a recovery step instead of repeatedly suggesting the same conflicting request.

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

## Review correction: active dictation during a pending capture

Review of `4af2fc820fdb8dccc0587c42d4aec12bc99a0ad5` (tree `a8fc30f1193e404b7ffda6af6a2932350da9ffd8`) found a P2 regression: the blanket disabled fieldset also disabled Stop listening and Cancel dictation if the builder started a draft while the microphone session was active.

The correction replaces that fieldset with `LocalDictation.applyDisabled`. It blocks starting/installing, editing the transcript and applying it while capture is pending, while keeping both stop controls active. The existing synchronous capture guard is retained. The lane now explicitly permits `local-dictation.tsx`; no unrelated path is changed.

The focused harness renders the actual WalkIt and LocalDictation handlers with independent hook state, a fake local speech adapter and a held capture response. It checks both Stop and Cancel, verifies that the pending request retains its original source, blocks transcript application and another speech start, then permits dictation again after the result. The Stop path subsequently applies the retained speech and verifies a distinct capture ID with transcript provenance. A separate case checks the install control during a pending request.

| Correction check | Observed result |
| --- | --- |
| `pnpm --filter @jobguard/web exec vitest run app/ui/walk-it-retry.test.tsx --maxWorkers=1` before correction | Three new regressions failed; five existing tests passed. The active-speech tests detected the disabled fieldset. |
| `pnpm --filter @jobguard/web exec vitest run app/ui/walk-it-retry.test.tsx app/api/jobs/capture/route.test.ts app/ui/jobguard-linked-entry.test.tsx --maxWorkers=1` after correction | 22 tests passed in three files. |
| `pnpm --filter @jobguard/web typecheck` after correction | Passed. |
| `LANE_BASE_REF=896a701157ef71c81905da93bca4299d105c775a node tools/lint.mjs` after correction | Passed; core purity, eight-path lane boundary, money arithmetic and PL/pgSQL checks. Eleven existing computed-import notices remain. |

These follow-up commands used Node `v24.22.3` and pnpm at `/workspace/scratch/e06a45857489/jobguard-test-toolchain/node_modules/.bin/pnpm`. No microphone, PostgreSQL, browser or external service was started. The reviewer became the author of this correction at the coordinator's request; the corrected head still needs independent review and its own CI result.

## Browser acceptance prepared, not executed by this builder

The added test in `apps/web/e2e/capture.spec.ts` drives the existing browser form against the real capture route. It checks successful initial capture, corrected source creating a different draft, unchanged retries returning the same job, a reused ID with different input returning 409, and returning to the original snapshot retrieving its original job and source.

Two further browser cases use a fake speech adapter and hold the outgoing capture request before continuing it to the real route. They assert that native browser disabled semantics leave Stop/Cancel usable while source/apply controls are blocked and that the real saved source remains unchanged. These cases are prepared for both configured browser projects; they were not executed locally.

The coordinating agent owns the browser/database runner and independent review. Run the affected capture suite with the existing desktop and mobile-360 projects, plus the relevant WALK-stress regression. The coordinator opened draft PR #847 for the initial change; its prior CI run cannot certify the later correction. No browser run, full CI completion, deployment, or independent approval of the corrected head is claimed in this receipt. The correction has not been pushed, merged, or deployed by its author.

The lane check requires a committed comparison range. The handoff records its result against this branch's final commit, using `LANE_BASE_REF=896a701157ef71c81905da93bca4299d105c775a node tools/agent-lane-boundary-lint.mjs --lane=tommy-draft-retry-fix-20261119`.
