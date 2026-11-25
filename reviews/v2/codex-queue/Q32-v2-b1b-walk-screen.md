# Q32 · V2-B1B: the Walk screen, online first cut (batch C6)

**Tier:** T1 (route plus screen over B1A's checked application; no migration). **Builder:** desktop Codex, lane A. No database is needed while building; the browser proof runs in CI or lane B. **Base:** B1A's branch `claude/project-thread-tjgrce` (#920). **Branch:** `codex/sandbox/v2-b1b`. **PR:** draft **into `v2/main`**, so CI1 runs. Say "Stacked on #920; review only the commits after its head". **Planner:** Fable thread, 25 Nov 16:00 UK. Use ★★, effort M, rework risk medium.

## Rules this piece must meet
`01-RULES.md` (rules 1 to 28) and `02-BUILD-RULES-CHECKLIST.md`, with a "Rules met" list in the PR body. Rule 21 applies to the POST route. Rule 22 applies to the browser test.

## Dry-check against `claude/project-thread-tjgrce` (planner, 25 Nov 15:55 UK, rule 23)
- **Application:** `apps/api/src/workspace/walk.application.ts`, reached through the workspace as `walk`. Check the property name in `apps/api/src/workspace/application.ts` on this base before using it. It has:
  - `read(jobId, { version: "v2-walk-query.v1", sessionId? })`;
  - `start(jobId, { version: "v2-walk-session-command.v1", sessionId, deviceStartedAt })`;
  - `record(jobId, { version: "v2-walk-entry-command.v1", sessionId, commandId, captureOrder, expectedVersion, deviceCapturedAt, entry })`, where `entry` is one of: `{kind:"room", room}`, `{kind:"note", text}`, `{kind:"measurement", quantity, unit, text?}` (quantity matches `^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$`), or `{kind:"photo", photoId, text?}`.
  - Schemas are in `packages/db/src/v2-walk-repository.ts` lines 13 to 45. `WalkEntryView` is at line 78.
- **No walk web route exists.** Copy the route pattern from `api/v2-backend/jobs/[id]/materials/route.ts` on `codex/sandbox/v2-d5b`.
- **Mock-up:** `apps/web/app/(designed)/v2-mock-walk/walk-mock.tsx` on v2/main (states Example, Microphone refused, Camera refused, No signal, Empty, Problem; screenshots in `e2e/artifacts/v2-mock-walk/`).
- **Dictation** is the phone keyboard's own microphone in the textarea. No Web Speech API, and no audio anywhere.
- `apps/web` has no jsdom, so test pure helpers.

## What to build
1. `apps/web/app/api/v2-backend/jobs/[id]/walk/route.ts` plus `route.test.ts`:
   - GET reads sessions.
   - POST takes `{ action: "start" | "record", ... }`, behind the origin check (rule 21).
   - Return 404 unless `JOBGUARD_LOCAL_V2 === "1"`, use no-store, and return error codes only.
2. A screen at `apps/web/app/(designed)/jobs/[id]/walk/page.tsx` plus `walk.tsx`, which you own:
   - pick or add a room, which records a `room` entry;
   - "Add note" (textarea, "Dictate or type what you see");
   - "Add measurement" (quantity and unit);
   - notes for the current room so far, each Saved or Not saved yet;
   - "Next room" and "Finish walk".
   - `captureOrder` counts up from 1 for each session, on the device. `deviceCapturedAt` is the phone's clock, shown as "phone time" and **never used to choose a room**.
   - An entry that fails stays "Not saved yet. Retry", and retrying reuses the **same** `commandId` and `captureOrder`.
   - **The camera button is shown disabled** with "Photos arrive in the next update" (B1E). No `getUserMedia`, no file input.
3. A link to the walk from the job's Work tab: one mount line, V2 only, put in your lane file with the note "mount only".
4. Browser test `tools/v2/walk.browser.test.mjs` at 360 and 1280 px, and phone mode, on a fresh stack:
   - start a walk, add two rooms, a note and a measurement;
   - reload, and check they're all there in order;
   - make a retry after a forced failure (route intercept) save once.

   Three passes in a row (rule 22).

## Done when
Route tests pass, the browser test is green three times, CI is green apart from Vercel, and a Claude check has been done on the frozen head.
