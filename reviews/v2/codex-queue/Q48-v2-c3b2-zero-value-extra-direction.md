# Q48 · V2-C3B-2: the builder says whether a no-charge extra adds or removes work

**Tier:** RED (changes 2020's plan-edit check and what joins the plan). **Builder:** Opus 5.5 thread. **Checker:** Codex, `@codex review` on the PR. **Base:** C3B-1 (Q47)'s branch, once it exists; until then do not start. **Branch:** the builder thread's own, listed in `config/lanes/v2-c3b2.json`. **PR:** draft into C3B-1's branch. **Migration: 2055** (reserved; final number at merge by `tools/migration-renumber.mjs`). **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: Fable thread, 25 Nov 20:45 UK.

## Why
#922 decided that a variation stores no direction apart from the sign of its money. A £0 approved extra ("move the socket, no charge") is therefore held back as `direction_unknown`, and can never be planned. The builder knows which it is. This piece lets the builder say so once, per approved revision.

## Dry-check against `origin/v2/main` @ fad1c16cf (rule 23)
- `packages/db/src/v2-work-plan-repository.ts`:
  - lines 106 to 113: `edit()` checks the editor with `app.v2_work_plan_editor(sha256(sessionId))`, `WORK_PLAN_EDITOR_REQUIRED`;
  - line 115: `planHead(client, tenant, job, true)` is the plan lock every edit takes;
  - lines 152 to 167: the single audit event pattern (`v2_work_plan.edited`, references and a hash only);
  - lines 304 to 345: `approvedScope()` reads approved revisions in one statement (lines 305 to 325); lines 336 to 338 hold back `signedDeltaPence <= 0` as `omission` (< 0) or `direction_unknown` (= 0); lines 339 to 341 let only `> 0` join the plan scope;
  - line 396: `version: edits.length - inherited.length`.
- `packages/db/migrations/2020_v2_plan_variation_scope.sql`:
  - lines 41 to 65: `app.v2_work_plan_edit_scope_check()`; lines 53 to 59 accept an extra's edit only for an approved revision with `r.signed_delta_pence > 0`;
  - lines 67 to 70: the AFTER INSERT trigger.
- `tools/v2/bootstrap.mjs` line 68 is the 2020 line.
- C3B-1 (Q47) gives the screen `extrasNotPlanned` and the `direction_unknown` text. Re-check its line numbers on its branch before building.

## Build
1. **Migration 2055** `packages/db/migrations/2055_v2_extra_direction.sql`, with its note and proof, fenced exactly as 2020 lines 9 to 15.
   - `app.v2_extra_direction`: `tenant_id`, `job_id`, `variation_revision_id`, `scope_item_id`, `direction` (`'adds_work'` or `'removes_work'`), `quote_revision_id`, `command_id`, `request_digest char(64)`, `actor_membership_id`, `recorded_at`. **PRIMARY KEY (tenant_id, job_id, variation_revision_id):** one answer per approved revision, never changed. UNIQUE `(tenant_id, job_id, command_id)`. FK to `app.variation_revision (tenant_id, job_id, id)` and to `app.scope_identity`.
   - An AFTER INSERT check in 2020's pattern refuses a row unless the revision is approved (the same join as 2020 lines 54 to 55), has `signed_delta_pence = 0`, and belongs to that scope item.
   - RLS enabled and forced, the 2020-era runtime policy pattern (tenant plus job EXISTS), `REVOKE ALL FROM PUBLIC`, `GRANT SELECT, INSERT` to `jobguard_runtime`, and `app.reject_immutable_authorization_record()` BEFORE UPDATE OR DELETE.
   - `CREATE OR REPLACE` `app.v2_work_plan_edit_scope_check()`: lines 53 to 59 now accept `r.signed_delta_pence > 0` **or** (`= 0` and an `adds_work` row for that revision). Nothing else in the function changes.
   - No commercial table, grant or policy changes. Run it twice.
2. **Bootstrap:** the 2055 line after the 2020 line, and above 2054 if FL-6 is on the base (rule 30).
3. **Repository:**
   - `approvedScope()` reads the direction in the **same statement** (LEFT JOIN on the revision id), so plan and money still come from one snapshot. `= 0` with `adds_work` joins the plan scope like an addition; `= 0` with `removes_work` goes to `extrasNotPlanned` as `omission`; no row stays `direction_unknown`. Money is never recalculated, and `agreement.approvedVariations` is unchanged.
   - A new command `work-plan-extra-direction.v1` `{ commandId, quoteRevisionId, expectedVersion, variationRevisionId, direction }` (zod strict, exported next to `workPlanEditV1`). `recordExtraDirection()` takes the editor check and the same plan lock as `edit()`, replays on the same command id and digest, refuses a different digest (`WORK_PLAN_COMMAND_CONFLICT`), and refuses unless the revision is in this snapshot's `extrasNotPlanned` with `direction_unknown` (`WORK_PLAN_INVALID_EDIT`). It appends exactly one `v2_work_plan.extra_direction_recorded` event with references only (`commandId`, `variationRevisionId`, `scopeItemId`, `direction`).
   - **Plan version:** recorded directions on this quote revision count toward `version` (line 396), so an open screen's next edit is refused as stale after the plan changes shape.
   - A later approved revision of the same extra has a new id, so it starts as `direction_unknown` again; any planning on it is set aside with `planningDropped`, as #922 already does.
4. **Application and route:** `WorkPlanApplication.recordExtraDirection()`; the same POST in `apps/web/app/api/v2-backend/jobs/[id]/work-plan/route.ts` accepts either body version (parse the direction body only when the edit body fails).
5. **Screen:** on each `direction_unknown` row from C3B-1, two buttons, "Adds work" and "Removes work". Command building goes in a pure helper with unit tests. After a press, reload the plan; an "Adds work" extra then shows as Unplanned, ready for C3B-1's editing.

## Tests
- **Seed tests** (appended):
  - a £0 approved extra shows as `direction_unknown`; "adds work" makes it Unplanned, and the builder can then plan it with C3B-1's command; "removes work" lists it as `omission`;
  - money: `agreement.approvedVariations` and the agreement's total are byte-identical before and after;
  - the database refuses a direction for a non-zero, unapproved, or other-scope-item revision, a second direction for the same revision, an UPDATE and a DELETE;
  - the 2020 check now accepts an edit on a £0 `adds_work` extra and still refuses one on a £0 extra with no direction;
  - replay appends no event; the plan version goes up by one;
  - **rule 30:** the second firm can't read the first firm's `v2_extra_direction` rows as `jobguard_runtime`, and its direction command is refused.
- Unit tests: the zod command, the helper, the route's choice between body versions.
- Browser test (`v2-c4.spec.mts`, extended): a £0 extra → "Adds work" → plan it → reload keeps it.

## Done when
- On the practice job, a £0 approved extra can be marked "adds work" and then planned, or "removes work" and stays off the plan, with the money unchanged.
- CI1 is green, and the Codex check is clean or answered.
