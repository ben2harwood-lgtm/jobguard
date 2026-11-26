# Q49 · V2-F2: a task that needs a proof photo stays open until the photo is verified

**Tier:** RED (proof rules decide when work counts as done). **Builder:** Opus 5.5 thread. **Checker:** Codex, `@codex review` on the PR. **Base:** F1-P #974 `codex/sandbox/v2-f1p` @ aeedba94d (stacked on F1 #953; PX #964 is merged into v2/main). **Branch:** the builder thread's own, listed in `config/lanes/v2-f2.json`. **PR:** draft into `codex/sandbox/v2-f1p`. **Migration: none expected.** 2028 stays reserved for F2. If the builder finds a database rule is needed, stop and ask the coordinator first. **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: Fable thread, 26 Nov 16:10 UK.

## What it is (rev 1.3 line 154)
"A stage that needs verified proof stays open while its upload is pending." Planner reading: a **task** on a crew brief whose `proofNeeded` list is not empty only counts as **complete** when its latest Done record carries a photo whose upload is `verified`. Until then, the task is still open, and the screen says why. Nothing is refused: the builder can still press Done with no photo, or with one still uploading, and the record is kept as F1 wrote it. Only the derived status changes.

## Dry-check against `codex/sandbox/v2-f1p` @ aeedba94d (rule 23)
- `packages/db/src/v2-brief-progress-repository.ts`:
  - line 11: `progressPhotoStates = ["not_uploaded", "pending", "quarantined", "verified", "rejected"]`;
  - lines 35 to 38: `BriefProgress` (no status field);
  - lines 52 to 60: `read()` returns every progress row, oldest first, each through `photo()` (lines 62 to 72), which reads the live upload state and never copies it;
  - lines 74 to 129: `record()`; it stores `brief_version` (line 118), so each row knows the brief it was recorded against.
- `packages/db/src/v2-crew-brief-repository.ts`: brief content tasks carry `proofNeeded: string[]` (line 46, filled at line 289 from the template's `proofPoints`). Brief rows are `app.v2_crew_brief` with `expected_version` (read at lines 99 to 102 of the progress repository).
- `packages/db/src/v2-splashback-decorating-template.ts` lines 10 to 28: every practice task has one proof point, for example "Photo of the finished splashback".
- `apps/web/app/ui/brief-progress.tsx`: `BriefProgressView` (line 18), `TaskProgress` (line 51), `record()` (line 60), "Proof needed: …" (line 87), `ProgressPhoto` (line 105).
- `apps/web/app/ui/brief-progress-photo.ts`: `progressPhotoLabel()`, a pure helper with tests.

## Build
1. **Pure rule** `packages/db/src/v2-proof-status.ts`, with unit tests:
   - `taskProofStatus(latest, proofNeeded)` returns one of `open`, `blocked`, `changed`, `done`, `done_proof_missing`, `done_proof_pending`, `done_proof_rejected`.
   - `latest` is the task's highest-version progress row; `proofNeeded` comes from **the brief version that row was recorded against**, not the newest brief.
   - No row is `open`. Blocked and Changed keep their kind. Done with an empty `proofNeeded` is `done`. Done with proof needed is `done` only when `photoState === "verified"`; `not_uploaded` or no photo gives `done_proof_missing`; `pending` or `quarantined` gives `done_proof_pending`; `rejected` gives `done_proof_rejected`.
   - `isTaskComplete(status)` is true only for `done`. Export both for later pieces (K5B stage due, G6 close-out, E4 afternoon check), which must call them rather than re-derive.
2. **Read:** `BriefProgressRepository.read()` also returns `tasks: { trade, scopeItemId, taskKey, version, status }[]`, one per task with progress, using the rule above. It reads the brief content for each row's `brief_version` in the same transaction. The existing rows array is unchanged.
3. **Screen:** on each task, a status line from a pure helper `taskStatusLabel(status)` in `apps/web/app/ui/brief-progress-photo.ts`: "Done", "Done, but the proof photo is missing", "Done, proof photo still uploading or being checked", "Done, but the proof photo was rejected: add another". For the three proof states, show the existing Done-with-photo action again, so the builder records a new Done (next expected version) with a new photo. Unit tests for the helper; one `renderToStaticMarkup` case if a component test file exists there.
4. **No change** to `record()`, the command versions, the upload path or any migration.
5. **Lane** `config/lanes/v2-f2.json`. F1-P-owned files are each noted "F2 mount, owned by F1-P #974: <what>".

## Tests
- Unit: every branch of `taskProofStatus`, including a task whose proof list changed between brief versions (the older brief rules for the older row).
- **Seed tests**, appended, on the practice job:
  - Done with no photo on a proof task reads `done_proof_missing`;
  - Done with a photo still pending reads `done_proof_pending`, and becomes `done` after the practice upload finishes verifying, with no new record;
  - a rejected photo reads `done_proof_rejected`; a new Done with a verified photo reads `done`;
  - the second firm reads no status for the first firm's job (rule 30's A/B pattern, as `jobguard_runtime`).
- Browser (`tools/v2/brief-progress.browser.test.mjs`, extended, three passes): Done with a pending photo shows "still uploading or being checked"; after verification and reload, it shows "Done".
- Rule 29: no new route. The existing GET's refusal checks follow F1 #953.

## Done when
- On the practice job, "Finished splashback" pressed Done without a verified photo stays open with a plain reason, and becomes Done once its photo is verified.
- CI1 is green, and the Codex check is clean or answered.
