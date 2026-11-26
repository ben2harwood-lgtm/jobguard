# Q50 · V2-B1E: "Take photo" on the walk files a practice photo through the existing upload path

**Tier:** RED (evidence uploads). **Builder:** Opus 5.5 thread. **Checker:** Codex, `@codex review` on the PR. **Base:** B1C #973 `codex/sandbox/v2-b1c` @ 461f15172 (stacked on B1B #957; PX #964 is merged into v2/main). **Branch:** the builder thread's own, listed in `config/lanes/v2-b1e.json`. **PR:** draft into `codex/sandbox/v2-b1c`. **Migration:** none. **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: Fable thread, 26 Nov 16:20 UK.

## Design choice for the coordinator (Ben's 20:07 UK rule: build decisions go to the coordinator)
The shared upload path (`packages/db/src/evidence.ts`: `beginUpload` line 85, `finalize` line 104) calls `requireLiveJob`, so a photo can only be uploaded on a **live** job. A real walk happens before the quote, when the job isn't live.
- **Option 1 (planner recommends, this packet):** B1E uses the shared path **unchanged**. On the practice job, which is live in the seed, "Take photo" works. On a job that isn't live yet, the button stays disabled with the line "Photos can be added once the job is live (practice limit)". No shared rule changes.
- **Option 2 (later piece B1E-2):** a V2-only pre-live upload for walk photos. That changes or bypasses the shared live-job rule, so it needs its own RED packet and plan check.

## Dry-check against `codex/sandbox/v2-b1c` @ 461f15172 (rule 23)
- `packages/db/migrations/2008_v2_walk_record.sql`:
  - lines 26 to 30: a photo entry's id shares the evidence upload id space, and its verification is read live, never copied;
  - lines 54 and 60 to 61: a photo entry needs `photo_id`, and a photo is filed once per tenant;
  - lines 63 to 77: refuses an upload from another job (`V2_WALK_PHOTO_OTHER_JOB`).
- `packages/db/src/v2-walk-repository.ts`: the entry command's photo variant at line 32 (`{ kind: "photo", photoId, text? }`); `WALK_PHOTO_REFUSED` at lines 284, 320, 321 and 367.
- `apps/web/app/(designed)/jobs/[id]/walk/walk.tsx` line 155: `<button … disabled>Take photo</button>`.
- `apps/web/app/api/v2-backend/jobs/[id]/walk/route.ts`: GET (line 21) and POST (line 32, `commands.safeParse` at line 36).
- `packages/db/src/evidence.ts` lines 74 to 110 (`beginUpload`, `finalize`, both live-job only).
- Pattern to copy: F1-P's `uploadBriefProgressPhoto` (`apps/api/src/workspace/brief-progress-photo.application.ts` on `codex/sandbox/v2-f1p` @ aeedba94d, 72 lines):
  - a generated practice PNG (`generatePracticePng`);
  - `EvidenceService.beginUpload` with `scopeItemId: null`;
  - the original stored in `app.synthetic_evidence_original`, then finalize;
  - an "attached" audit event, and replay and actor checks under the begin lock (Codex P2 4707412001).
  That file is not on this base. **Copy it** into `apps/api/src/workspace/walk-photo.application.ts` with a header naming the source commit. Merging the two copies is a later tidy.

## Build
1. **Walk photo upload:** a POST body `v2-walk-photo-command.v1` `{ commandId, fixture }` on the existing walk route.
   - It runs the copied helper. Events are `v2.walk_photo.attached` and so on; the upload's scope is null; the actor is the walk editor.
   - It returns `{ photoId, state }`.
   - The screen then sends the existing photo entry command with that `photoId`.
   - No new Nest controller. `evidence.ts` and F1-P's helper stay unchanged.
2. **Screen:** "Take photo" is enabled on a live job.
   - It shows the upload state from the walk read (`photo.state`): not uploaded, pending, being checked, verified, rejected.
   - A retry resends the same command id.
   - On a job that isn't live, keep the button disabled with the line above.
   - Put the logic in a pure helper `walkPhotoAction(job, entry)` with unit tests.
3. **Lane** `config/lanes/v2-b1e.json`. B1B- and B1C-owned files are each noted "B1E mount, owned by B1B #957 / B1C #973: <what>".

## Tests
- **Seed tests**, appended:
  - "Take photo" on the live practice job gives one upload and one photo entry, and reads back `verified` once checked;
  - a retry leaves one upload and one entry;
  - a photo id from another job is refused (`WALK_PHOTO_REFUSED`);
  - on a job that isn't live, the upload is refused with `JOB_NOT_LIVE` and no entry is written;
  - the second firm can't read the photo or the entry (rule 30, as `jobguard_runtime`).
- Unit: the zod body and `walkPhotoAction`.
- Browser (`tools/v2/walk.browser.test.mjs`, extended, three passes): take a photo in a room, reload, and see it under that room, verified.
- **Rule 29:** the walk GET's refusal checks follow B1B. If SX isn't merged, write "pending V2-SX".

## Done when
- On the practice job's walk, "Take photo" files a verified practice photo under the current room, and it's still there after reload.
- CI1 is green, and the Codex check is clean or answered.
