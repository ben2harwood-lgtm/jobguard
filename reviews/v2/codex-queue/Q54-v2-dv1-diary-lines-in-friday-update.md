# Q54 · V2-DV1 + K3-D: the builder marks diary notes for the customer, and the Friday update offers them

**Tier:** RED (the builder's own diary text can reach a customer message, local catcher only). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** K3 #935 `codex/sandbox/v2-k3` @ 260aebe92. **Branch:** the builder thread's own branch, listed in `config/lanes/v2-dv1.json`. **PR:** draft into `codex/sandbox/v2-k3`; retarget when #935 merges. **Migration: 2036** (reserved for DV1; final number set at merge). **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: 26 Nov 17:30 UK. Does not need F6, E9 or SYNC-1: the diary (`0164_job_sources.sql`) is already on this base, and SYNC-1 changes only its mode check.

Roadmap rows E7 (DV1, "diary entries get a 'customer can see this' flag") and E8 (K3-D, "Friday update includes flagged diary entries") are built as one piece. Each one alone is too small to be useful.

## Planner reading (Astra please confirm or correct)
1. **The builder chooses, entry by entry.** Nothing from the diary reaches a customer unless the builder has marked that entry "Customer can see this". The mark is a V2 record beside main's diary. Main's diary tables, functions and screen don't change.
2. **It's a suggestion inside the existing review.** At "prepare", marked entries from that week are added to "This week" as ordinary lines. They go through K3's existing `line` rule (no amounts, at most 400 characters), and the builder can edit or remove them before "send", exactly as with plan lines. An entry that fails the rule isn't added. The screen says why.
3. **Shadow bill (AGENTS §5.14) is untouched.** These are the builder's own notes, which the builder already sees. Marking one changes no capture, finding, count or fee. Nothing the builder sees varies with hidden signals.
4. **K3's comment line 3 changes meaning**, from "never copy diary" to "only diary notes the builder marked for the customer, then reviewed". That change is the point of this piece, and the PR must say so plainly.

## Dry-check against `codex/sandbox/v2-k3` @ 260aebe92 (rule 23)
- `packages/db/migrations/0164_job_sources.sql` lines 25 to 38: `app.job_diary_entry` (`tenant_id, job_id, id`, `entry_mode`, `on_site`, `source_received_at`; UNIQUE `(tenant_id, job_id, id)`); the text is in `app.job_source_original.bytes` (lines 4 to 16).
- `packages/db/migrations/0749_lp6d_remaining_routines.sql` line 1306: `app.read_job_sources(t, j, digest, 'diary')` returns `entries[]` with `id`, `text` and `evidence`; it needs the bound actor and the practice digest.
- `packages/db/src/job-source-repository.ts` line 12: `read(context, jobId, digest, "diary")`; `apps/api/src/job-source.application.ts`: `diary(jobId)` uses `auth.digest` from `PracticeAccess`.
- `packages/db/src/v2-friday-update.ts`: line 3 comment; `line` rule (lines 4 to 5); `fridayContentV1` (`thisWeek` at most 30 lines); `fridayWeekDates` (lines 28 to 33); `fridayContentFromPlan` (line 34).
- `packages/db/src/v2-friday-update-repository.ts`: `command()` line 29 (actor by `app.v2_work_plan_editor`, advisory lock `friday:<tenant>:<job>` line 40, replay by request hash); `prepare` content is computed **before** the transaction by `planContent()` (lines 92 to 99).
- `packages/db/migrations/2021_v2_friday_update.sql`: `app.v2_friday_update` (line 8), runtime policy and grants.
- `apps/web/app/(designed)/jobs/[id]/friday-update/screen.tsx` (111 lines): prepare, edit, send.
- `tools/v2/bootstrap.mjs` line 70: the 2021 line, the last V2 line.

## Build
1. **Migration 2036** `packages/db/migrations/2036_v2_diary_share.sql`, note and proof file. The V2 fence as 2021 has it, plus `to_regclass('app.job_diary_entry') IS NULL` → RETURN.
   - `app.v2_diary_share`: `tenant_id`, `job_id`, `diary_entry_id`, `sequence` (1, 2, …), `shared boolean`, `command_id`, `actor_membership_id`, `recorded_at`. PK `(tenant_id, job_id, diary_entry_id, sequence)`; UNIQUE `(tenant_id, command_id)`; FK `(tenant_id, job_id, diary_entry_id)` → `app.job_diary_entry (tenant_id, job_id, id)`. The latest sequence wins.
   - RLS enabled and forced; the 2021 runtime policy pattern (`lp11_policy_tenant()` plus job EXISTS); `REVOKE ALL … FROM PUBLIC`; `GRANT SELECT, INSERT` to `jobguard_runtime`; `app.reject_immutable_authorization_record()` BEFORE UPDATE OR DELETE. No SECURITY DEFINER function. Run it twice; the second run changes nothing.
2. **Bootstrap.** Add the 2036 line after the 2021 line (rule 30: above FL-6's 2054 line if that is on the base when this merges).
3. **Pure helper** in `packages/db/src/v2-friday-update.ts`: `diaryLinesForWeek(week, entries, shares)` returns `{ lines, refused: [{ entryId, reason: "amount" | "too_long" | "empty" }] }`. It takes entries whose latest share is `true` and whose `source_received_at` falls in the week by Europe/London date (Monday to Sunday, using `fridayWeekDates`), oldest first, and only text that passes `line`. `fridayContentFromPlan` gains an optional third argument for those lines, appended after the plan lines in "This week", capped at 30 lines in total (plan lines first). Change the line 3 comment as in reading 4. Unit tests cover the week edges (Sunday 23:30 London in BST and in GMT), the amount rule, the cap, and an unmarked or un-marked-again entry.
4. **Repository.**
   - `DiaryShareRepository` (new file `packages/db/src/v2-diary-share-repository.ts`):
     - `set(context, jobId, sessionId, { version: "v2-diary-share-command.v1", commandId, diaryEntryId, shared })`. The actor is found by `app.v2_work_plan_editor`. It takes an advisory lock `diary_share:<jobId>`. A replay with the same body returns the stored row; a different body is `DIARY_SHARE_COMMAND_CONFLICT`. It writes one audit event `v2.diary_share.set` with references only, never text.
     - `read(context, jobId)` returns the latest share per entry.
   - `FridayUpdateRepository.planContent()` also reads the week's diary through `JobSourceRepository.read(context, jobId, digest, "diary")`, plus the shares, and passes `diaryLinesForWeek(...).lines`. `read()` returns `diaryRefused` for the screen. The `digest` comes from the application's `PracticeAccess` as `JobSourceApplication.diary()` does. The application passes it in; the repository never derives it.
5. **Application and route.** `FridayUpdateApplication` gains `diary(jobId, week)` (the week's entries with their share state and refusal reason, text included because the builder already sees it) and `share(jobId, body)`. Route `apps/web/app/api/jobs/[id]/friday-update/diary/route.ts`: GET and POST, the same gates as K3's route; watchdog line `"/api/jobs/[id]/friday-update/diary": "pre_live_allowed"` (marking is not site work).
6. **Screen** (`friday-update/screen.tsx`): a "From your diary this week" card above "This week" lists each entry with its time, its text and a "Customer can see this" switch. A refused entry shows "Has an amount: leave amounts out of the customer update", or "Too long for one line". A note says: "Marked notes are added when you prepare the update. You can still edit or remove them before sending." After marking, the screen offers "Prepare again" only if a draft exists, using K3's own prepare. Text comes from pure helpers tested with `renderToStaticMarkup` (no jsdom).
7. **Lane** `config/lanes/v2-dv1.json`. Mounts on K3-owned files are each noted as "DV1 mount, owned by K3 #935: <what>": `v2-friday-update.ts` (helper and comment), `v2-friday-update-repository.ts` (diary lines in `planContent`), `friday-update.application.ts`, `screen.tsx` (one card), `index.ts` exports, `bootstrap.mjs` (one line), `seed.integration.test.mjs` (tests appended), `purchase-order-audit.integration.test.ts` (the `_v2_diary_share.sql` stem and one "table absent" check), `watchdog.ts` (one line, owned by main).

## Tests
- **Seed tests** (appended):
  1. **Done-when case.** On the practice job, the builder writes two diary notes on Wednesday of the week, "Tiles delivered and stacked in the hall" and "Extra socket quoted at 85.00". The builder marks both "Customer can see this" and prepares the update. "This week" has the plan lines plus the first note. The second note is refused with `amount` and isn't in the content. The builder unmarks the first and prepares again, and it has gone. Send puts exactly one message in the local catcher, and its text holds the first note only while it was marked.
  2. A note from the previous Sunday at 23:30 London isn't in this week. A Monday 00:10 note is.
  3. Replay and conflict for the share command. A share for another job's diary entry is refused by the FK. The second firm's runtime sees no `v2_diary_share` rows (**rule 30, firm A/B read check**). UPDATE and DELETE are refused.
  4. The audit payload for `v2.diary_share.set` holds no diary text (searched for the note's words).
  5. Main's diary functions and tables are unchanged (catalog check of `read_job_sources` and `sv7a_intake_job_source` definitions before and after 2036).
- **Rule 29:** the route is under `/api/jobs`, not `/api/v2-backend`. Still prove GET refuses no session, an invalid session and the second firm. If SX #965 isn't on the base, write "Rule 29: pending V2-SX" in "Rules met".
- Unit tests: the helper (step 3), the zod command, the route's 404, 403 and failure mapping, and the label helpers.
- Browser: extend K3's `apps/web/v2-browser/friday-update.browser.ts` by one case at 360 px: mark a note, prepare, and see it in the draft.

## Known limits (to write in the PR)
- Only typed or dictated diary text is offered. Diary photos aren't (K3 sends no photos yet).
- The mark is the builder's choice for that note. It isn't consent from anyone named in the note, so the builder should still read the draft before sending, as K3 already asks.

## Done when
- On the practice job, a diary note the builder marked appears in that week's Friday update draft. A note with an amount is refused with a reason. An unmarked note never appears. The sent message in the local catcher matches the reviewed draft.
- CI1 is green, and the Codex check is clean or answered.

## Claude plan check, 27 Nov (stands in for Astra under Ben's 13:27 UK rule): PASS. Note: K3's amount rule misses bare numbers such as "costs 85". That's acceptable only because the builder reviews the draft before sending, so keep that line in the PR's known limits.
