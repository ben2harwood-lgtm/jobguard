# Q53 · V2-G1: snag register, with a crew owner, who fixed it, who checked it, and agreed outstanding

**Tier:** RED (adds V2 records beside main's snag tables; a second-person check). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** SYNC-1 #980 `claude/project-thread-ctngmn` @ bfd158609 (brings main's QW-4 snag list, migration 0782, and 2056's firm locks into V2). **Screen:** M3 #956 `codex/sandbox/v2-m3` "Snags" mock (`apps/web/app/(designed)/v2-mock-pages-3/pages-mock.tsx` lines 128 to 146); follow its branch files if #956 isn't merged. **Branch:** the builder thread's own branch, listed in `config/lanes/v2-g1.json`. **PR:** draft into `claude/project-thread-ctngmn`; retarget when #980 merges. **Migration: 2042** (reserved for G1). **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: 26 Nov 17:15 UK. Does not need F6 #923 or E9 #948.

## What it is (rev 1.3 line 167, page table line 288)
"Each snag has an owner and due date, a record of the fix and who checked it. Agreed outstanding items can be listed openly." Page: "Snags · Builder · Job › Records · Each snag with owner, due date, photo, fixed and checked marks. · Add a snag; Mark checked."

## Planner reading (Astra please confirm or correct)
1. **Main's snag list is adopted unchanged.** QW-4 already stores title, location, free-text owner (`assignee_label`), due date, photos (up to six, verified), and fixed, checked and reopened events with the acting membership. G1 adds no column to main's tables and changes no main function. It adds three small V2 records beside them, plus the V2 screen. Main has no snag screen yet (`packages/core/src/snag.ts` line 3: "no screens yet").
2. **Owner can be a crew record.** The builder picks a C3C crew member (`app.v2_crew_contact`) of the job's firm, or keeps main's free-text label. The V2 owner record wins when present. This lets later pieces (My brief, E8 6pm list) show a crew member their own snags.
3. **Who fixed and who checked are people, not sign-ins.** In a practice firm there is usually one builder sign-in, so main's membership-based rule (0782 lines 264 to 269) lets the same membership check its own fix when no other member works on the job. G1 records **which person** fixed and checked (the builder, or a crew record) against main's event sequence, and refuses a check by the same person who fixed it. That is the mock's "Choose someone other than the person who fixed it."
4. **Agreed outstanding** is the builder's mark that an open or fixed snag is agreed with the customer to stay open at handover, with a short note ("visit agreed with Alex"). G2's handover pack lists those under "Outstanding snags" (M3 `fixture.ts` line 51). It never closes a snag and never touches money. "Checking a snag does not approve the final account" stays on screen.

## Dry-check against `claude/project-thread-ctngmn` @ bfd158609 (rule 23)
- `packages/db/migrations/0782_snag_list.sql` (main, QW-4):
  - tables `snag` (lines 23 to 37: `assignee_label`, `due_on`, `created_by_membership_id`), `snag_revision` (41 to 55), `snag_event` (57 to 69: `sequence`, `kind` fixed/checked/reopened, `actor_membership_id`), `snag_photo` (71 on), `snag_photo_upload` (90 on);
  - runtime gets SELECT only (line 111); writes go through definers `snag_add` (186), `snag_revise` (220), `snag_record_event` (247), photo functions (280, 297), granted at lines 332 to 335;
  - `snag_practice_actor` (119 to 134) needs the practice material digest (`app.practice_material_digest`) and the job owner;
  - `snag_record_event` lines 247 to 275: `require_watchdog_live`, replay, `FOR UPDATE` on the snag row, transition rule (259 to 262), checker rule (264 to 269).
- `tools/v2/migrations/2056_v2_sync1_fences_and_locks.sql` (SYNC-1): retargets the snag fence to `jobguard_v2_local` and adds the restrictive `v2_practice_firm` policy on all six snag tables.
- `packages/core/src/snag.ts`: commands `snag.v1` (add, revise), `snag-event.v1`, `snag-photo.v1`; `buildSnagListV1`, `deriveSnagState`, `allowedSnagEvents`, `isSnagOverdue`.
- `packages/db/src/snag-repository.ts` lines 41 to 123: `add`, `revise`, `recordEvent` (line 56, one `withTenant` transaction calling `app.snag_record_event`), `photo`, `read`.
- `apps/api/src/snag.application.ts`: `SnagApplication` (practice mode, `PracticeAccess`, `practiceMaterialPool(pool, auth.digest)`, line 24).
- `apps/web/app/api/jobs/[id]/snags/route.ts`, `…/[snagId]/events/route.ts`, `…/[snagId]/photos/route.ts`; `packages/core/src/watchdog.ts` lines 169 to 172 (`watchdog_live_only`).
- `packages/db/migrations/2027_v2_crew_contact.sql`: crew records, firm policy, and the assignee guard pattern (`'practice:' || j.practice_session_digest`).
- `tools/v2/bootstrap.mjs`: last V2 line is 2056 (line 74).
- `tools/v2/seed.integration.test.mjs` lines 1040 to 1100: SYNC-1's snag proof on V2 through the HTTP route.

## Build
1. **Migration 2042** `packages/db/migrations/2042_v2_snag_register.sql`, note and proof file. The V2 fence as 2027 has it, plus `to_regclass('app.snag_event') IS NULL OR to_regclass('app.v2_crew_contact') IS NULL` → RETURN.
   a. `app.v2_snag_owner`: `tenant_id`, `job_id`, `snag_id`, `sequence` (1, 2, …), `crew_id` and `crew_revision` (both null means "back to main's free-text label"), `firm_key`, `command_id`, `actor_membership_id`, `recorded_at`. PK `(tenant_id, snag_id, sequence)`; FK `(tenant_id, job_id, snag_id)` → `app.snag (tenant_id, job_id, id)`; FK crew → `v2_crew_contact (tenant_id, firm_key, crew_id, revision)`; a trigger as 2027's guard checks `firm_key` is the job's firm. Latest sequence wins.
   b. `app.v2_snag_event_person`: `tenant_id`, `job_id`, `snag_id`, `event_sequence`, `person_kind` (`builder` or `crew`), `crew_id`, `crew_revision`, `firm_key`, `recorded_at`. PK `(tenant_id, snag_id, event_sequence)`; FK `(tenant_id, snag_id, event_sequence)` → `app.snag_event (tenant_id, snag_id, sequence)`; CHECK `(person_kind = 'crew') = (crew_id IS NOT NULL)`; same firm trigger. A trigger refuses a row for a `checked` event whose person equals the person on the latest `fixed` event before it (same `person_kind` and same `crew_id`), code `V2_SNAG_CHECKER_IS_FIXER`.
   c. `app.v2_snag_agreed`: `tenant_id`, `job_id`, `snag_id`, `sequence`, `agreed boolean`, `note varchar(200)` (required when `agreed`), `command_id`, `actor_membership_id`, `recorded_at`. PK `(tenant_id, snag_id, sequence)`. Latest wins.
   d. All three: RLS enabled and forced; runtime policy `tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (job)` as 2015 does; `REVOKE ALL … FROM PUBLIC`; `GRANT SELECT, INSERT` to `jobguard_runtime`; `app.reject_immutable_authorization_record()` BEFORE UPDATE OR DELETE. No SECURITY DEFINER function. UNIQUE `(tenant_id, command_id)` where a command id is stored. Run it twice; the second run changes nothing.
2. **Bootstrap.** Add the 2042 line after the 2056 line in `tools/v2/bootstrap.mjs`, or above FL-6's 2054 line if that is on the base when this merges (rule 30).
3. **Repository** `packages/db/src/v2-snag-register-repository.ts`, `SnagRegisterRepository(pool)`, used through the same `practiceMaterialPool(pool, digest)` that `SnagApplication` uses:
   - `read(context, jobId)`: main's `read()` rows plus, per snag, the current V2 owner (crew name and trade, or null), the person on each event, and the current agreed mark and note.
   - `setOwner(context, jobId, { version: "v2-snag-owner-command.v1", commandId, snagId, crewId | null })`.
   - `recordEvent(context, jobId, snagId, { version: "v2-snag-event-command.v1", commandId, action, person: { kind: "builder" } | { kind: "crew", crewId } })`: **one transaction**: call `app.snag_record_event` exactly as `SnagRepository.recordEvent` does (line 56), then insert the `v2_snag_event_person` row for the returned sequence. If the V2 insert refuses, the whole event rolls back. A replay of main's command id returns main's stored result; insert the person row only if it isn't already there, and refuse a replay naming a different person (`V2_SNAG_COMMAND_CONFLICT`).
   - `setAgreed(context, jobId, { version: "v2-snag-agreed-command.v1", commandId, snagId, agreed, note })`: refused for a `checked` snag (nothing outstanding).
   - Writes take `pg_advisory_xact_lock` on `snag:<snagId>` before the V2 insert, then compute the next sequence. Each write appends one audit event (`v2.snag.owner_set`, `v2.snag.event_person`, `v2.snag.agreed_set`) with references and hashes only.
   - Export from `packages/db/src/index.ts`.
4. **Application** `apps/api/src/workspace/snag-register.application.ts` with the same mode and access checks as `SnagApplication`. It answers with the whole register, like `SnagApplication.save()`. Export it.
5. **Routes** `apps/web/app/api/jobs/[id]/snag-register/route.ts` (GET register; POST owner, event or agreed by `version`). Gates as main's snag route; watchdog line `"/api/jobs/[id]/snag-register": "watchdog_live_only"` (events are site work, as main's are).
6. **Screen** `apps/web/app/(designed)/jobs/[id]/snags/page.tsx` under Job › Records, following the M3 mock. Each snag card shows title, "Owner: <name> · due <date>", photo, "Fixed: <person>", "Checked: <person> · second person", and an overdue tag from `isSnagOverdue`. Actions: Mark fixed (pick who fixed it); Mark checked (pick who checked; the fixer is shown but refused with the mock's alert text); Reopen; "Agreed to leave open at handover" with a note. "Record another snag" uses main's add command, with an owner picker that lists the firm's crew plus "Someone else (type a name)", which uses main's label. Photos use main's practice photo route. "Checking a snag does not approve the final account." Empty and Problem views as in the mock. All text from pure helpers in `apps/web/app/ui/v2-snag-register-label.ts`, tested with `renderToStaticMarkup` (no jsdom).
7. **Lane** `config/lanes/v2-g1.json`. Mounts on SYNC-1-owned or main-owned files are each noted: `index.ts` exports, `bootstrap.mjs` (one line), `seed.integration.test.mjs` (tests appended), `purchase-order-audit.integration.test.ts` (the `_v2_snag_register.sql` stem and one "table absent" check), `watchdog.ts` (one line, owned by main), and the Job › Records nav link (one line).

## Tests
- **Seed tests** (appended; through the HTTP routes like SYNC-1's snag test at line 1074, or the repository on the `runtime` pool):
  1. **Done-when case.** On the practice job: add "Refit the hall door stop", owner the crew record Jordan, due 4 Dec; Mark fixed by Jordan; Mark checked by Jordan is refused (`V2_SNAG_CHECKER_IS_FIXER`) and leaves **no** main `checked` event; Mark checked by Sam is accepted; the register shows owner Jordan, fixed by Jordan, checked by Sam.
  2. Agreed outstanding: an open snag marked agreed with "visit agreed with Alex" reads back; clearing it reads back; marking a checked snag agreed is refused.
  3. Owner: a crew record of the second firm, or a crew id that doesn't exist, is refused; clearing the owner falls back to main's label.
  4. Replay: the same event command with the same person returns the stored result; the same id naming another person is refused; main's own events route still works and shows "person not recorded" in the V2 register.
  5. Database: UPDATE and DELETE on all three tables are refused; a person row for an event of another snag is refused; main's tables and functions are byte-identical before and after 2042 (catalog check of `pg_get_functiondef` for the `snag_*` functions and the column lists).
  6. **Rule 30, firm A/B read check:** the second firm sees no rows of the three tables for the first firm's job, as `jobguard_runtime`.
- **Rule 29:** the route is under `/api/jobs`, not `/api/v2-backend`. Still prove GET refuses no session, an invalid session and the second firm, with typed codes. If SX #965 isn't on the base, write "Rule 29: pending V2-SX" in "Rules met".
- **Browser** (one case at 360 px, in a new `tools/v2/snag-register.browser.test.mjs` using BH1's shared sign-in helper): add a snag with a crew owner, mark fixed, try the fixer as checker (alert shown), check with the second person, reload, and see both names.
- Unit tests: the zod commands, the label helpers, the route's 404, 403 and failure mapping. Migration proof `2042_v2_snag_register.proof.json`.

## Known limits (to write in the PR)
- A fixed or checked event made through main's own route (not the V2 screen) has no person row. The V2 register shows "person not recorded", and the second-person rule can't apply to it. The V2 screen uses only the V2 route.
- "Who checked" is the builder's statement of who did it. It isn't that person's own sign-in. A crew check by their own link is later, after My brief (Q52).

## Done when
- On the practice job, a snag has a crew owner and a due date. It is marked fixed by one person and checked by a different person, and the same person is refused. An open snag can be marked "agreed to leave open" with a note. After a reload the Snags screen shows all of it.
- No main snag table or function changes.
- CI1 is green, and the Codex check is clean or answered.
