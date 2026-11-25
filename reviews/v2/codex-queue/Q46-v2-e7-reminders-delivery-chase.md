# Q46 · V2-E7: one reminder per unanswered request, and "unconfirmed" the day before

**Tier:** RED (messages to merchants, crew and customers, local catcher only). **Builder:** Opus 5.5 thread (Ben, 25 Nov 19:53 UK: Opus builds and repairs, Codex only checks). **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** E2 #949 `claude/project-thread-49qd38` @ c0e2e3ede (stacked on E1 #919). **Branch:** the builder thread's own branch, listed in `config/lanes/v2-e7.json`. **PR:** draft into `claude/project-thread-49qd38`; retarget when #949 merges. **Migration: 2030** (reserved for E7 in the roadmap; final number set at merge by `tools/migration-renumber.mjs`). **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: Fable thread, 25 Nov 20:30 UK.

## What it is (rev 1.3 line 143)
"An unanswered request produces a limited reminder or a builder decision before the deadline." Added in 1.3 (#12): "a merchant delivery date with no confirmation is asked for once, and flagged to the builder the day before it is needed if there is still no reply." Done when (Astra, 21:44 UK, persisted state only): "a delivery due Thursday with no reply by Wednesday morning is stored as 'unconfirmed' with its reason, and the local catcher holds exactly one chase per request." The Tomorrow screen is E8, not this piece.

## Planner reading (Astra please confirm or correct)
1. **The request is E2's.** A "merchant delivery date" is an E1 open fact of kind `merchant_delivery_date` with `needed_by`. The ask is E2's reply request to the merchant. E7 adds **at most one reminder per E2 request** and **one "unconfirmed" flag per request**. It works for all four E2 fact kinds, because rev 1.3 line 143's first sentence is about any unanswered request. The done-when test uses the merchant delivery case.
2. **E3 stock deliveries are not chased here.** `app.v2_stock_delivery` (E3 #932, `2014_v2_stock.sql` lines 11 to 38) has a supplier name only, with no contact and no link to an E1 fact, so it can't be chased without inventing a recipient. Chasing a stock delivery's `forecast` row needs a fact-to-delivery link. That is a named later piece (E7-S), not this one. E7 therefore doesn't stack on E3.
3. **K4 is untouched.** Rev 1.3 says K4 "reuses v2-e7's reminder rules", but K4 #926 was built first with its own engine (`packages/db/src/v2-chase-policy.ts`, `2019_automatic_chasing.sql`). E7 doesn't change K4. Sharing one engine is a later tidy, and only if Ben asks.

## Dry-check against `claude/project-thread-49qd38` @ c0e2e3ede (rule 23)
- `packages/db/migrations/2022_v2_open_fact.sql` (E1):
  - line 18: `kind` is one of `customer_choice`, `merchant_delivery_date`, `crew_availability`, `access`;
  - line 22: `owner_kind`; line 24: `needed_by date NOT NULL`;
  - lines 49 to 76: `app.v2_open_fact_change`; the highest `expected_version` is the current status (`open`, `answered`, `cancelled` or `out_of_date`).
- `packages/db/migrations/2023_v2_fact_reply.sql` (E2):
  - lines 42 to 72: `app.v2_fact_reply_request` (`fact_id`, `fact_version`, `recipient_kind`, `contact_email`, `token_hash` stored as a hash only, `expires_at`, `requested_at`);
  - lines 74 to 85: `app.v2_fact_reply_cancel`;
  - lines 90 to 115: `app.v2_fact_reply` (`request_id` is set for a link reply and null for a pasted one, line 108; pasted replies answer a `fact_id` plus `fact_version`);
  - lines 143 to 172: the runtime policy pattern (`app.lp11_policy_tenant()` plus job EXISTS), and SELECT, INSERT grants only;
  - lines 252 to 260 on: `app.v2_fact_reply_current(r)`: the fact is still at the request's version, no newer request for the fact, and the customer binding or recipient row is unchanged.
- `packages/db/src/v2-fact-reply-repository.ts`:
  - line 8 imports `assertV2Recipient`, `captureV2Delivery`;
  - lines 195 to 225: `command()`; the actor check is `app.v2_work_plan_editor(sha256(sessionId))` with `REPLY_NOT_V2` (lines 204 to 207); capture happens **after commit**, once per request (line 223);
  - lines 296 to 306: `fact()` reads the fact's current version and status;
  - lines 313 to 315: `lock()` is `pg_advisory_xact_lock(hashtextextended(tenant:key, 2013))`; `request()` (line 366) and `paste()` (line 439) lock `fact:<factId>`; `apply()` locks `fact:<factId>` then the request id (lines 468 to 469);
  - lines 324 to 329: `audit()`, references and hashes only.
  - The link reply (`receive`, lines 245 to 282) runs `app.v2_fact_reply_receive` and takes **no** advisory lock.
- `packages/db/src/v2-local-catcher.ts` (on v2/main): fixed invented destinations, lines 3 to 11; `captureV2Delivery(kind, recipient)` logs metadata only, line 26 to 30.
- `apps/api/src/workspace/fact-reply.application.ts`: `FactReplyApplication` with `PracticeAccess` and `v2Only()` (lines 10 to 50).
- `apps/web/app/lib/v2-fact-reply-server.ts`: `factReplyMode` (line 12), `builderFactReplies` (line 16), `builderOrigin` (line 32), `factReplyFailure` (line 40).
- `apps/web/app/api/jobs/[id]/fact-replies/route.ts`: GET and POST pattern (lines 8 to 22).
- `apps/web/app/ui/v2-fact-replies.tsx`: request rows at line 131 (`Link to … : status`); 159 lines; test file uses `renderToStaticMarkup` (no jsdom).
- `packages/core/src/watchdog.ts` line 162: E2's `"/api/jobs/[id]/fact-replies": "pre_live_allowed"` line.
- `packages/db/test/purchase-order-audit.integration.test.ts` lines 46 to 49 (V2 migration stems the main runner skips) and line 67 (E2's "table absent" check).
- `tools/v2/bootstrap.mjs` line 71 is the 2023 line, the last V2 line on this base.
- `tools/v2/seed.integration.test.mjs` imports repositories straight from `packages/db/dist` (lines 10 to 11) with the `runtime` pool (line 23), so a test can pass a fixed clock.

## Build
1. **Migration 2030** `packages/db/migrations/2030_v2_fact_reminder.sql`, with its note and proof file as E2 has them. Same fence as 2023 lines 3 to 11, plus `to_regclass('app.v2_fact_reply_request') IS NULL` → RETURN.
   - `app.v2_fact_reminder`: `tenant_id`, `job_id`, `request_id`, `kind` (`'reminder'` or `'unconfirmed'`), `reason` (null for a reminder; `'no_reply'` or `'link_expired'` for unconfirmed), `due_at timestamptz NOT NULL`, `recorded_at timestamptz NOT NULL` (the run's clock), `recipient varchar(320)` (set only for a reminder, and equal to the request's `contact_email`, checked in code and by a seed test), `run_id uuid NOT NULL`, `actor_membership_id uuid NOT NULL`.
     - **PRIMARY KEY (tenant_id, job_id, request_id, kind).** That is the "exactly one chase per request" rule, in the database.
     - FK `(tenant_id, job_id, request_id)` → `app.v2_fact_reply_request`.
     - CHECKs tie `reason` and `recipient` to `kind` as above.
   - `app.v2_fact_reminder_run`: `tenant_id`, `job_id`, `id` (the command id), `request_digest char(64)`, `result jsonb`, `actor_membership_id`, `recorded_at`. PK `(tenant_id, job_id, id)`. This is the replay record.
   - Both tables: RLS enabled and forced; the 2023 runtime policy pattern (lines 143 to 167); `REVOKE ALL … FROM PUBLIC`; `GRANT SELECT, INSERT` to `jobguard_runtime`; trigger `app.reject_immutable_authorization_record()` (0005 line 57) BEFORE UPDATE OR DELETE.
   - No SECURITY DEFINER function. Run it twice; the second run changes nothing.
2. **Bootstrap.** Add the 2030 line after the 2023 line in `tools/v2/bootstrap.mjs`. If FL-6's 2054 line is on the base when this merges, the 2030 line goes **above** it (rule 30).
3. **Timing rule, pure** `packages/db/src/v2-fact-reminder-policy.ts`, with unit tests:
   - `londonEight(date)`: the instant of 08:00 Europe/London on a calendar date (use `Intl`, no new dependency).
   - `reminderPlan({ neededBy, requestedAt, expiresAt, replied, cancelled, current, factOpen, has }, now)` returns `{ remind: boolean, unconfirmed: null | "no_reply" | "link_expired" }`.
   - **Stopped** (both false or null) when: any reply exists for the request's fact at the request's fact version (link **or** pasted), or the request is cancelled, or `current` is false, or the fact is no longer `open`.
   - **Reminder**, once: not stopped, the link has not expired, no reminder row yet, and `now ≥ max(londonEight(neededBy − 2 days), requestedAt + 24 h)` and `now < londonEight(neededBy − 1 day)`. A run that first happens after that window sends no reminder: it is too late, and the flag takes over.
   - **Unconfirmed**, once: not stopped, no unconfirmed row yet, and `now ≥ londonEight(neededBy − 1 day)`. Reason `link_expired` if `expiresAt ≤ now`, else `no_reply`.
   - Unit tests: Thursday 3 Dec 2026 case; a request made Wednesday morning (no reminder, flag only); a British Summer Time date (needed by 31 Mar 2026, reminder due 29 Mar 08:00 BST = 07:00 UTC); each stop reason; an expired link before the reminder window.
4. **Repository** `packages/db/src/v2-fact-reminder-repository.ts`, `FactReminderRepository(pool, clock = Date.now)`, the same clock injection as K4's `V2ChaseRepository` (line 19 on `codex/sandbox/v2-k4`).
   - `read(context, jobId)`: per request, its reminder and unconfirmed rows (`kind`, `reason`, `dueAt`, `recordedAt`). No email, question or answer text beyond what E2's read already returns.
   - `run(context, jobId, sessionId, { version: "v2-fact-reminder-command.v1", commandId })` (zod strict):
     - V2 check and actor exactly as E2 lines 204 to 207 (`app.v2_work_plan_editor`), with its own codes `REMINDER_NOT_V2`, `REMINDER_EDITOR_REQUIRED`.
     - **Lock order:** `reminders:<jobId>` first, then `fact:<factId>` for each open request's fact in ascending fact id order, using E2's key space (`hashtextextended(tenant:key, 2013)`), so a run serialises with E2's `request`, `paste` and `apply`.
     - Replay: a stored run with the same id and digest returns its stored `result` and captures nothing; a different digest or actor is `REMINDER_COMMAND_CONFLICT`.
     - For each request, compute `reminderPlan` inside the transaction from the rows, and insert any due rows. For a reminder, call `assertV2Recipient(contact_email)` before insert; a refusal skips the reminder and records nothing for it.
     - One audit event per inserted row, `v2.fact_reminder.sent` or `v2.fact_reminder.unconfirmed`, with references only (`runId`, `requestId`, `factId`, `factVersion`, and `reason` for unconfirmed), through `appendAuditBatch` as E2 line 324 does.
     - Store the run result `{ reminded: [requestId…], unconfirmed: [requestId…] }`.
     - **After commit only**, `captureV2Delivery("v2_fact_reminder", recipient)` once per inserted reminder. The reminder carries **no new link**: E2 keeps only the token hash, and one link per request stays E2's rule. The local catcher holds metadata only, so no message body is written anywhere.
   - Export it from `packages/db/src/index.ts`.
5. **Application** `apps/api/src/workspace/fact-reminder.application.ts`, `FactReminderApplication`, the same shape as `FactReplyApplication` (PracticeAccess, `v2Only`, session required for `run`). Export it from `apps/api/src/workspace/index.ts`.
6. **Route** `apps/web/app/api/jobs/[id]/fact-reminders/route.ts` with `route.test.ts`: GET reads, POST runs. Same gates as E2's route: `factReplyMode()` 404, `builderOrigin()` 403 on POST, `factReplyHeaders`, failures through a `factReminderFailure` (409 for `REMINDER_COMMAND_CONFLICT`, 400 otherwise, 503 for anything else). Add `builderFactReminders()` to `apps/web/app/lib/v2-fact-reply-server.ts`. Add one `watchdog.ts` line: `"/api/jobs/[id]/fact-reminders": "pre_live_allowed"`.
7. **Screen**, in E2's replies section `apps/web/app/ui/v2-fact-replies.tsx`:
   - on each request row (line 131), after the status: "Reminder sent <London date and time>" and, if flagged, "Unconfirmed: no reply by the day before" or "Unconfirmed: the reply link expired";
   - one button "Run reminders now (practice)", which posts a fresh command id and keeps it for a retry until a response arrives;
   - the text comes from a pure helper `reminderLabel(row)` in `apps/web/app/ui/v2-fact-reminder-label.ts`, with unit tests. Add one `renderToStaticMarkup` case to `v2-fact-replies.test.tsx`.
   - No Tomorrow screen (E8) and no automatic timer: the practice run is the builder's press. A worker schedule is a later piece.
8. **Lane** `config/lanes/v2-e7.json`. Mounts on E2-owned files are each noted as "E7 mount, owned by E2 #949: <what>": `v2-fact-replies.tsx` (status text and run button), `v2-fact-replies.test.tsx` (one case), `v2-fact-reply-server.ts` (one builder function), `apps/api/src/workspace/index.ts` and `packages/db/src/index.ts` (one export each), `bootstrap.mjs` (one line), `seed.integration.test.mjs` (tests appended), `purchase-order-audit.integration.test.ts` (the `_v2_fact_reminder.sql` stem and one "table absent" check, as E2 did at lines 49 and 67), `watchdog.ts` (one line, owned by main).

## Tests
- **Seed tests** (`tools/v2/seed.integration.test.mjs`, appended; repository on the `runtime` pool with a fixed clock, as the file already does with `FactReplyRepository`):
  1. **Done-when case.** A `merchant_delivery_date` fact needed Thursday 3 Dec 2026, requested Monday 30 Nov 10:00 London to `merchant@jobguard-v2.invalid`. Run Tue 1 Dec 12:00: one reminder row, one capture. Run again Tue 13:00 with a new command id: no new row, no capture. Run Wed 2 Dec 08:00: one `unconfirmed` row with reason `no_reply`. Reading back shows both. Count the `v2.delivery.captured` lines (stub `console.info`): the request plus exactly one `v2_fact_reminder`.
  2. Stops: a link reply before Tuesday; a pasted reply; a cancel; the fact answered or cancelled in E1; a newer request for the same fact (the old one is not current); a corrected recipient. Each gives no reminder and no flag.
  3. An expired link (`expiresInDays: 1`) gives no reminder and an `unconfirmed` row with `link_expired`.
  4. Replay: the same command id and body returns the stored result and captures nothing; the same id with another actor is `REMINDER_COMMAND_CONFLICT`.
  5. The database refuses a second `reminder` row for a request (PK), an UPDATE and a DELETE (trigger), and a `reminder` row with a reason.
  6. **Rule 30, firm A/B read check:** the second firm sees no `v2_fact_reminder` or `v2_fact_reminder_run` rows for the first firm's job, as `jobguard_runtime`. The FL ruling's fixture rule applies only if a fenced command is needed (it isn't expected here).
- **Rule 29:** this is a web route under `/api/jobs`, like E2's, not under `/api/v2-backend`. Still prove the GET refuses: no session, an invalid session (made-up and never-issued UUID v4), and the second firm, with typed codes. If the SX helpers aren't on the base, write "Rule 29: pending V2-SX" in "Rules met" and add the helper calls in one test-only commit later.
- **Unit tests:** the timing rule (step 3), the zod command, `reminderLabel`, the route's 404, 403 and failure mapping.
- **Migration proof:** `packages/db/test/migration-proofs/2030_v2_fact_reminder.proof.json`, as E2 has.
- No browser test is required for this piece; the screen change is two lines and a button. Lane B may add one later.

## Known limit (to write in the PR)
E2's link reply takes no advisory lock, so a reminder computed in the same instant that a link reply commits can still be captured once. The one-row rule still holds. Closing that needs a change to E2's `v2_fact_reply_receive`, which this piece doesn't make.

## Done when
- On the practice job, a delivery needed Thursday with no reply has one reminder in the local catcher and, from Wednesday 08:00 London, is stored as "unconfirmed" with reason `no_reply`; the builder sees both on the request row after reload.
- A reply, a cancel, or a changed question stops it.
- CI1 is green, and the Codex check is clean or answered.
