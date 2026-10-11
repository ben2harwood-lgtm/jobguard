VERDICT: PASS — bound to head 544a9a6284c13948623bb796b1c6f8b2127478e6

Reviewer: fresh Claude Opus review agent spawned by the JobGuard integrator (Claude week, 9 Oct 2026); did not build, repair or order any commit in this PR.

**In short:** The practice follow-up does what the card asks. Letting practice time pass only creates a "please review" item. Nothing is approved or sent until the owner approves the exact reminder. The three M4-5-S safety guards that migration 0112 restates match 0107 line for line, apart from the narrow reminder exception. That exception only opens while a reminder is due, has not been stopped, and every earlier message on the case was delivered before the follow-up was scheduled, so it cannot produce a second send or reach another tenant or case. I found nothing that blocks a merge. CI is red only on ENT-2's stale "0110 is last" test, which #128 fixes, but that failure also skipped the build and both browser test projects, so this exact code has no CI browser evidence yet (see the merge gate).

**Merge gate (an order of steps, not a code repair):** after #128 merges and main is merged into this branch, CI must go fully green, including `pnpm build` and the mobile-360 + desktop end-to-end step (M4-6-S.spec and the M4-5-S/SBOX-2 neighbours), and the checks job must stay under 30 minutes.

## Findings

1. **LATER: the audit of the due moment is written later, by whoever looks next.** `packages/db/src/recovery-follow-up-repository.ts:423-434` (`settleDueAudits`) and `0112_recovery_follow_up.sql:74-75`. The due row, Decision and `became_due` event are saved together with SBOX-2's advance. The audit-chain entry is added by the next read, advance or signal. It cannot be duplicated: the due row carries a unique `audit_event_id` and the append runs under a per-tenant advisory lock. It cannot be lost either, because the due row keeps that id until the entry is written. However, it is not written together with the change it records (the card's C4 rule), and it can lag for as long as nobody reads. Separately, every GET of a follow-up writes audit rows and takes a lock shared by the whole demo tenant, which every practice session uses, so all practice follow-up reads queue behind one another.
2. **LATER: two identical "advance" requests at once can move the practice clock twice.** `recovery-follow-up-repository.ts:139-165`. The first step checks `alreadyMoved`, releases the command lock, and only then calls SBOX-2's advance. SBOX-2's own advance (`sandbox-repository.ts:36,38`) does not deduplicate a command id once it has committed. On a repeat it saves a receipt for the next step and silently skips the event (`ON CONFLICT DO NOTHING`). So if two requests with the same id run their SBOX-2 transactions one after the other rather than overlapping, the clock moves twice but records only one `advanced` event. The result is a skewed practice clock only: no extra Decision, approval or send. The DW3 race test (`recovery-follow-up.integration.test.ts:376-379`) passes because it happens to exercise the overlapping case.
3. **LATER: misleading wording on the M4-5-S panel.** Once a reminder is previewed, `apps/web/app/ui/recovery-messages.tsx:221` says "1 earlier preview replaced by this one" about a message that was actually delivered (simulated). This is the panel overlap the builder disclosed (receipt "Things you should know" 4).
4. **LATER: a new follow-up can be scheduled on a case that is closed and was never reopened.** This applies to a case closed with no recovery or prevented, provided money is still outstanding (`0112:314-322`, repository `schedule` 110-116). The owner still has to review it and approve the exact reminder, so consent is intact, and M4-5-S's own case snapshot has the same gap. Consider refusing to schedule until the case is reopened, to match DW4/DW6.
5. **LATER: the "reopened" flag is set after any stopping event, not only after a close.** `recovery_follow_up_case_facts` (`0112:121`) counts `resume_pursuit`/`reverse_landing` after a dispute too, while ruling Q3 says "after a close". It only affects a label: stopping, and the need for a new reviewed intent, are unchanged.
6. **LATER: a revoked or blocked reminder can leave the case unable to get any further follow-up.** `sourceMessage` (repository 445-455) and the guard (`0112:305-313`) take the newest message that has any approval row as the source and require it to have been delivered. If a follow-up stops before its revoked reminder is approved again, or if the practice run is archived while the reminder is queued (`0112:263-266`), no later follow-up can be scheduled on that case. This is a practice dead end, not a safety problem.
7. **LATER: CI time.** The checks job took 6m25s but stopped early, because build and e2e were skipped. #126 already ran about 28 minutes against the 30-minute limit, and the receipt says the new e2e adds about 30 s. Watch the first full run.

## Answers 1–8

**1. The three restated guards (the highest-risk item).** I extracted each function from main's `0107_recovery_messages.sql` (no later migration on main or in #104 redefines them) and diffed it against 0112.
- `guard_recovery_message`: identical except that the existing-effect condition gains `AND recovery_follow_up_reminder_window(NEW.tenant_id,NEW.case_id) IS NULL` (`0112:185-189`).
- `guard_recovery_message_approval`: identical except for two edits, both serving the same reminder exception:
  - the Decision may also be the follow-up's own due Decision, tied through the due row and the reminder link to this exact message (`0112:219-223`);
  - the existing-effect check gains `AND NOT recovery_follow_up_reminder_approvable(...)` (`0112:238-241`).
- `guard_recovery_message_sink`: identical plus one extra refusal for a stopped follow-up (`0112:263-266`). This only refuses more, never less.

Every authorization and outbox content-binding line (recipient, content hash, amount, revision, policy, expiry, status) is unchanged. The exception's limits:
- **The window** (`0112:149-161`) opens only when a due row exists, the follow-up has no stop reason, the reminder is not yet delivered, and every non-cancelled approval on the case is a succeeded message at or before the follow-up's source.
- **`approvable`** (`0112:164-172`) also requires the message to be the follow-up's newest link and the case's newest message.
- **Once the reminder has an approval, the window shuts**, because that outbox is not succeeded-at-or-before-the-source. A third preview or approval is then refused.
- **Uniqueness is enforced by the database:** one approval per message (PK), one resolution per Decision (`0005` `UNIQUE(tenant_id,decision_id)`), one authorization per resolution, and the link guard refuses a new link while any link carries a live approval (`0112:425-429`).
- **Tenant and case binding:** every helper takes `NEW.tenant_id` and `NEW.case_id`, and the tables are tenant-RLS, so no other tenant or case can use the exception.

No second live message, approval or sink effect can happen outside a due, unstopped, exactly approved reminder.

**2. Q1: SBOX-2's advance.** The trigger is `AFTER INSERT ON app.sandbox_run_event ... WHEN (NEW.kind='advanced')` (`0112:464-469`). It runs inside SBOX-2's `withTenant` transaction (`sandbox-repository.ts:36`); the xmin test proves this, and so does the injected-failure rollback test.

For a run with no follow-up, the function writes nothing and has no new way to fail. It does four things: a tenant check (always equal, because only the runtime role can insert, under 0021's tenant policy, with `app.tenant_id` set to the demo tenant), an archived check, a receipt count, and an empty loop. Runtime holds EXECUTE and SELECT. The only locks are per-follow-up advisory locks, which cannot form a cycle with the commands that lock the case first. Receipts, events, error codes and step results are unchanged: CI `sandbox.integration.test.ts` (2) passed, and so did "leaves SBOX-2 exactly as it was for a run that has no follow-up".

A failed evaluation rolls back the advance only for a run that has a follow-up, which is what Q1 asks for.

**3. DW2: consent.**
- **Elapsed time:** evaluation writes only a pending Decision, a due row and an event (`0112:439-459`). The due guard refuses a Decision that is resolved or authorized (`0112:401-406`).
- **The follow-up's own approval:** `approveReminder` checks the exact current reminder in `reminderFor` (repository 477-504): newest link, newest message, not already approved, revisions, then `verifyRecoveryMessageContent` and `matchesRecoveryMessageApproval`. It re-checks inside the mutation (repository 271-278: case lock, then `inspectRecoveryMessageCase` content hash), and the database guard binds the content again.
- **Replays:** a replayed advance, review or approval returns the current state and has no effect.
- **The M4-5-S panel's own buttons:** its Approve on a reminder is refused by M4-5-S's application check (`recovery-message-repository.ts:185-188`), and this is tested (`recovery-follow-up.integration.test.ts:779`, `RECOVERY_MESSAGE_EXISTING_EFFECT`). Its "advance delivery" and "revoke" buttons only act on a reminder that is already approved.

One observation: at the database level, a `recovery_message`-subject Decision is also accepted for a linked reminder, which the re-approval-after-revocation path needs. So it is the application check that keeps M4-5-S's Approve button away from reminders. Either way, the approval stays bound to the exact content.

**4. DW3–DW6 and boundaries.**
- **One due Decision under races and restarts:** due PK `(tenant_id,follow_up_id,period)`, a per-follow-up lock with a re-check, and unique `scheduled`/`became_due`/`cancelled` events. Tested with racing advances, ten concurrent signals over two pools, and a fresh pool.
- **Q3 stop reasons:** the mapping at `0112:117-122` matches Q3, and an SQL-versus-core parity test covers every event at every review point. The one gap is the reopen nuance in finding 5.
- **Reopen:** an earlier stop stays stopped, because the stop reason never reverts.
- **RLS, grants and foreign keys:** FORCE RLS, migration ownership, runtime SELECT/INSERT and REVOKE UPDATE/DELETE/TRUNCATE on all six tables (`0112:473-480`). The tenant/job/case composite foreign keys are present on every table.
- **Synthetic only:** an `environment='synthetic_demo'` CHECK on every table. All of this is tested.

**5. Tenant contexts.** The new files have no constructor or minting call:
- the repository receives the context as a parameter and only passes it whole or reads `.tenantId`;
- the application takes `PracticeAccess(...).case(...).context`, the same shape as merged M4-5-S (`recovery-message.application.ts:18,30`);
- the tests use `testTenantContext`.

I ran #104's scanner (`apps/api/src/auth/context-boundary.test.ts` at #104 head 20488b8) on a scratch merge of 544a9a6 and #104: 145 of 145 passed. As a control, storing the context in an object inside the new repository made it fail at that line, which proves the new file is scanned. Nothing will turn red after #104 lands.

**6. Audit.** See finding 1. It cannot be duplicated (unique id plus lock) or lost (the id is kept on the due row). It can lag, and is not written atomically with the transition. LATER.

**7. Lane, ledger and tests.** All 30 changed files are inside the `m4-6-s` lane, and CI `pnpm lint` passed. `BUILD_PLAN.md` was added to the lane by the integrator's ledger commit 544a9a6 and disclosed in its message. The ledger line is at `BUILD_PLAN.md:3346`. No founder-reserved area is touched. The only existing test edited is `tenancy.integration.test.ts`, with six catalog rows. New timeouts appear only in new test files; no existing assertion is weakened or skipped.

**8. CI** (run 37976480736, head 544a9a6):
- secrets ✓, dependency-review ✓, checks ✗;
- typecheck ✓, lint ✓;
- `pnpm test` ✗: db 870 of 871 passed. The only failure is `packages/db/test/work-order-import.integration.test.ts:55` ("expected '0112_recovery_follow_up.sql' to be '0110_work_orders.sql'"), which #128 fixes (still open). Every other package is green, including the new core (20), api (38 + 7) and db (45) tests, sandbox, tenancy, UIWIRE-12 and demo-bootstrap;
- `pnpm build` and the mobile-360 + desktop e2e step were SKIPPED because of that failure;
- no known flake appeared (neither PostgreSQL ECONNREFUSED nor the M4-1-S focus race);
- the checks job ran 6m25s, stopped early.

---
_Generated by [Claude Code](https://claude.ai/code)_
