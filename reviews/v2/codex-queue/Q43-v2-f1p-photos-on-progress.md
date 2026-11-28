# Q43 · V2-F1-P: attach a photo to Done, Blocked or Changed

**Tier:** RED (proof photos). **Builder:** Opus 5.5 thread (Ben, 25 Nov 19:53 UK: Opus builds and repairs, Codex only checks). **Base:** F1 #953 `codex/sandbox/v2-f1` @ 30fc44b81. **Branch:** `codex/sandbox/v2-f1p`. **PR:** draft into `codex/sandbox/v2-f1`. **Waits on:** PX #964 (@ dcd9236b6) only for its firm lock on evidence tables. If PX hasn't merged, say "pending V2-PX" in "Rules met", and don't merge before PX. **Migration: 2053** (next free becomes 2054). This replaces the roadmap's "none": F1's CHECK has to change. **Plan check:** Astra, frm-management-layer#3. Rules 1 to 29 apply. Planner: Fable thread, 25 Nov 18:15 UK.

## Dry-check against `codex/sandbox/v2-f1` @ 30fc44b81 (rule 23)
- `packages/db/migrations/2015_v2_brief_progress.sql`:
  - lines 9 to 28 define `app.v2_brief_progress`;
  - line 20 is `photo_reference uuid CHECK (photo_reference IS NULL)`, so F1 reserved the column and blocked it;
  - grants are SELECT and INSERT only (line 37);
  - triggers `v2_brief_progress_stage` (line 40) and `v2_brief_progress_live` (line 43).
- `packages/db/src/v2-brief-progress-repository.ts`:
  - the command zod is at lines 12 to 22, with no photo field;
  - `BriefProgress.photoReference: null` is at line 25;
  - `record` is at line 49.
- Screen: `apps/web/app/ui/brief-progress.tsx`. `TaskProgress` (line 49) builds the command at lines 60 to 62 and keeps a pending command for retries (line 55).
- Route: `apps/web/app/api/jobs/[id]/brief-progress/route.ts`. This is a web route under `/api/jobs`, not `/api/v2-backend`.
- Practice upload path: `packages/db/src/evidence.ts` lines 74 to 111, and `apps/api/src/proof/proof.application.ts` line 64 (generated fixture plus `synthetic_evidence_original`).
- Same-job photo check pattern: `2008_v2_walk_record.sql` lines 63 to 77 on B1B. It refuses an `evidence_upload` from another job, using the caller's rights.

## Build
1. **Migration 2053.**
   - Drop the `photo_reference IS NULL` check and add `photo_reference` as an FK to `app.evidence_upload (tenant_id, id)`.
   - Add a BEFORE INSERT guard in 2008's pattern that refuses an upload from another job (`V2_PROGRESS_PHOTO_OTHER_JOB`).
   - Run it twice. Grants and policies stay byte-identical.
2. **Command.** `v2-brief-progress-command.v1` is unchanged. A new `v2-brief-progress-command.v2` adds optional `photoId: uuid`, and `record` accepts both versions. `BriefProgress.photoReference` becomes `string | null`.
   - The photo isn't required for any kind yet. Proof rules are F2 (Q-later, migration 2028).
   - The view shows the photo's live verification state, read from the upload and never copied. It uses the same states as the walk: not_uploaded, pending, quarantined, verified and rejected.
3. **Upload** (amended 25 Nov 18:40 UK, rule-23 miss: there's no walk upload on this base, and B1E isn't built). Use the **practice proof upload path that is already on this base**, the same one the Proof card uses:
   - `packages/db/src/evidence.ts` `EvidenceRepository.beginUpload` (line 74) and `finalize` (line 101). These need a live job (`requireLiveJob`, line 104). F1's progress trigger `v2_brief_progress_live` already requires that.
   - Practice photos are **generated fixture PNGs**, made the same way `apps/api/src/proof/proof.application.ts` line 64 does it with `generatePracticePng(command.fixture)` and `synthetic_evidence_original`. Real camera bytes come later with the B2 device piece.
   - Add the upload as a new action on F1's own route, `apps/web/app/api/jobs/[id]/brief-progress/route.ts`:
     - a POST body version `v2-brief-progress-photo-command.v1` with `{ commandId, scopeItemId, fixture }`, which begins the upload, stores the generated original and finalizes it;
     - it returns `{ uploadId, evidenceId, state }`.
     The progress command then carries that id as `photoId`. Don't add a new Nest controller, and don't change `proof.application.ts`.
   - A failed upload leaves no progress row. The retry rule at line 55 still holds: a retry sends the same command with the same photo id.
4. **Screen.** Show a thumbnail and its state next to each progress row. Put the logic in a pure helper, `progressPhotoLabel(row)`, with unit tests (there's no jsdom).

## Tests
- Seed tests:
  - Done with a photo, read back;
  - a photo from another job is refused;
  - a replay leaves one row;
  - a v1 command still works;
  - the second firm can't see the row or the photo (FL plus PX).
- Unit tests: the v1 and v2 zod commands, and the helper.
- Browser test (lane B, three passes): extend `tools/v2/brief-progress.browser.test.mjs` with a Done press plus a photo.

## Done when
- On the practice job, the builder records "Blocked: no power" with a photo, and after reload sees the photo and its state next to the row.
- CI1 is green, and the Claude check is clean or answered.


## Legal research note (26 Nov 07:45 UK, `reviews/v2/V2-legal-research-followups.md`)
Before real use, photo screens carry the builder rule: no people in photos (especially children), no key-safe or alarm codes, no dates the home will be empty. Practice build unchanged.
