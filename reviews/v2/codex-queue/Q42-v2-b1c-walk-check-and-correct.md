# Q42 · V2-B1C: check and correct the walk ("needs room" tray, re-file a photo, keep the original)

**Tier:** RED (walk record is evidence). **Builder:** Opus 5.5 thread (Ben, 25 Nov 19:53 UK: Opus builds and repairs, Codex only checks). **Base:** B1B #957 `codex/sandbox/v2-b1b` @ 2c20eb6db (it carries B1A's 2008). **Branch:** `codex/sandbox/v2-b1c`. **PR:** draft into `codex/sandbox/v2-b1b`; retarget when B1B merges. **Migration: 2029** (reserved in the roadmap). **Plan check:** Astra, frm-management-layer#3. Rules 1 to 29 apply, with a "Rules met" list. Planner: Fable thread, 25 Nov 18:10 UK.

Plan text (rev 1.3, b1c): "Unclear links are flagged. Imported photos wait in 'needs room'. Corrections keep the original and the revision."

## Dry-check against `codex/sandbox/v2-b1b` @ 2c20eb6db (rule 23)
- **Migration 2008** (`packages/db/migrations/2008_v2_walk_record.sql`):
  - `app.v2_walk_entry` is at lines 31 to 56. Its key is `(tenant_id, job_id, session_id, capture_order, expected_version)`, and `kind` is room, note, measurement or photo.
  - The room is never stored on a photo. A photo belongs to the nearest lower room entry by `capture_order` (comment, lines 27 to 30).
  - The guard trigger (lines 78 to 95) refuses version gaps and **refuses changing `kind` or `photo_id` in a revision** (`V2_WALK_ENTRY_KIND_FIXED`).
  - Grants are SELECT and INSERT only (line 132). Policies are at lines 120 to 131. `app.v2_walk_editor(text)` resolves the editor (lines 99 to 112).
  - So a photo **can't be moved by revising its entry**. Re-filing needs its own record.
- **Repository** (`packages/db/src/v2-walk-repository.ts`):
  - `foldWalkEntries` (lines 122 to 148) sets `link` to room, linked, no_room or waiting, and flags clock drift over `WALK_CLOCK_TOLERANCE_SECONDS` (line 52).
  - `read` is at line 153, `recordEntry` at line 208, and the audit batch at line 294.
- **Screen:** `apps/web/app/(designed)/jobs/[id]/walk/walk.tsx`.
  - Room entries are filtered at line 87.
  - A non-linked entry shows "Room link needs checking" (line 150).
  - Pure helpers are in `walk-state.ts` (lines 11 to 26). There's no jsdom (Q25), so new screen logic goes in pure helpers there.
- **Route:** `apps/web/app/api/v2-backend/jobs/[id]/walk/route.ts`, with GET at line 20 and POST at line 31.

## Lane mount (amended 25 Nov 18:40 UK, after Codex's rule-4 stop)
B1C's lane file is `config/lanes/v2-b1c.json`. It lists its own new files, and it also **mounts exactly these B1A-owned edits** (lane `v2-b1a`, #920). Each one carries the lane note **"B1C mount, owned by B1A #920: <what>"**:
- `packages/db/src/v2-walk-repository.ts`:
  - `foldWalkEntries` takes an optional `filings` argument and adds the `filed` link and `originalRoomCaptureOrder`. Its behaviour is unchanged when there are no filings.
  - `read` also selects the latest filing per photo.
  - A new `fileWalkPhoto` method.
  - New zod `walkPhotoFilingCommandV1`.
  - Nothing else in the file changes.
- `apps/api/src/workspace/walk.application.ts`: a `fileWalkPhoto` pass-through, beside the existing entry call.
- `tools/v2/bootstrap.mjs`: the 2029 line, placed above 2054 (rule 30).
- `tools/v2/seed.integration.test.mjs`: new B1C tests appended in their own `describe`.
B1A's and B1B's existing tests must pass unchanged. No other B1A file changes. A lane-lint failure on any other B1A file is a stop.

## Build
1. **Migration 2029: `app.v2_walk_photo_filing`.**
   - Columns: tenant_id, job_id, session_id, capture_order (the photo entry), expected_version, command_id (unique per job), room_capture_order (a room entry in the same session), reason (`'misfiled' | 'no_room' | 'waiting'`), actor_membership_id and server_received_at.
   - It is immutable and revisioned like 2008: each re-file is a new version, earlier versions stay, and gaps are refused by a trigger in 2008's style. The trigger also refuses when the target isn't a `room` entry, or when the photo entry isn't `kind='photo'`.
   - Forced RLS with policies copied from 2008 lines 120 to 131, SELECT and INSERT only, plus the `v2_practice_firm` lock (FL pattern).
   - Audit event `v2.walk.photo_filed`, carrying references only.
2. **Fold.** `foldWalkEntries` takes the latest filing per photo.
   - If one exists, `linkedRoom` and `roomCaptureOrder` come from it, `link = "filed"` (a new value), and the view carries `originalRoomCaptureOrder`, the room by capture order, so the original stays visible.
   - Unfiled photos behave exactly as today.
   - Unit-test the fold for: no filing; a filing; a second filing; a filing after a later room entry arrives.
3. **Command** `fileWalkPhoto(context, jobId, credential, { version: "v2-walk-photo-filing-command.v1", sessionId, commandId, captureOrder, roomCaptureOrder, expectedVersion, reason })`.
   - Same editor check as `recordEntry`. A replay of the same commandId returns the same receipt.
   - It refuses a stale expectedVersion, a room in another session, a non-photo, and a closed session (if B1A has closed sessions).
4. **Screen.**
   - A **"Needs room" tray** at the top of the walk screen lists every photo whose link is `no_room` or `waiting`, or whose clock is flagged.
   - Each item has a "File under…" room picker built from the session's room entries.
   - Every photo also gets a "Move to another room" action.
   - A filed photo shows "Filed under <room> (taken in <original room or 'no room'>)".
   - Pure helpers go in `walk-state.ts`: `needsRoom(entries)` and `filingLabel(entry)`, both unit-tested.
5. **Route.** The POST at the existing walk route accepts the filing command version alongside the entry command (strict zod union). No new route, so the existing route tests extend. Rule 29 already covers that route through SX once merged; otherwise mark it "pending V2-SX".

## Tests
- Seed tests:
  - file a no-room photo, read it back with its original kept;
  - re-file it, and see both versions in the database;
  - a replay leaves one row;
  - a stale version is refused;
  - another session's room is refused;
  - the second firm sees nothing (FL).
- Unit tests: the fold cases above and the two helpers.
- Browser test (lane B, three passes): add `tools/v2/walk.browser.test.mjs` cases for the tray, filing and the label, run on a fresh stack before the seed suite.

## Done when
- On the practice job, a photo taken before any room shows in "Needs room", gets filed under "Hall", and shows "Filed under Hall (taken in no room)" after reload.
- The original entry is unchanged in the database.
- CI1 is green, and the Claude check is clean or answered.

## Not in this piece
- Imported photos from the camera roll (B1E, D6) use this tray once they land.
