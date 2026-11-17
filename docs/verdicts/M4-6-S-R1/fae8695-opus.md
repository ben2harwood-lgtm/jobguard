VERDICT: REPAIR — bound to head fae86956c587b4a97d3d32f12582a232d99d74af
Reviewer: fresh Claude Opus agent (Opus 5.5); did not build or order this piece; did not read or coordinate with the Sol check.
Lane: RED
Piece: M4-6-S-R1, PR #130. Base ff072c7. Head = builder commit 3b56568 + integrator record commit fae8695.
Integrator commit fae8695 checked: it changes only BUILD_PLAN.md (+2 lines, the §12.2 ledger paragraph) and adds "BUILD_PLAN.md" to this leaf's own lane line. Nothing else.

## Summary
Repair 1 (audit saved with the due transition) and repair 3 (populated upgrade proof) look right on inspection.
Repair 2 fixes the ordered sequence but ALSO adds a refusal the order did not ask for, which dead-ends a journey that works on main today.
No database or browser test has been seen green on this head yet. Two BLOCKING, eight LATER.

## Question 1 — criterion by criterion
Repair 1
- Audit commits in the SAME transaction as the SBOX-2 advance: MET by inspection. 0115:80-127 appends inside app.evaluate_recovery_follow_ups, which the 0112 trigger calls inside SBOX-2's own transaction (sandbox-repository.ts:36).
- Audit-last lock order kept: MET by inspection. Order is per-follow-up locks and all domain inserts, then the shared 'recovery-follow-up-audit' key, then the audit head. SBOX-2 afterwards takes only the audit head again and reads. No path takes the audit key or head before a business lock.
- Cannot be written twice: MET by inspection. became_due uses the due row's own audit_event_id (unique per tenant) and is re-read under the shared key; the repository catch-up (repository.ts:427-437) takes the same key and finds nothing missing. time_advanced is checked by follow-up + command id on both sides (0115:97-99, repository.ts:180-184).
- Rollback leaves none of Decision / due row / event / audit: MET by inspection (one transaction; a failed audit insert or head update raises).
- Transaction-ID and rollback tests exist and would fail without the change: MET. test:840-864 joins on the audit row by id (0 rows on 0112) and compares xmin of due, Decision, event, audit and the clock event; test:866-892 injects a failure after the due audit and would report "due audit was not atomic" on 0112. NOT RUN anywhere I can see.
- Catch-up kept as a no-op: MET.
Repair 2
- Rule in BOTH repository and SQL: the two queries are the same text (0115:23-31, repository.ts:451-458). The ordered sequence (deliver 1, approve 2, revoke 2, close, reopen, fresh run, new intent from 1, review, exact approval, delivery) is covered by test:894-920. MET for that sequence.
- "Keep every other refusal exactly as it is" and "still refuse with their existing typed errors": NOT MET — see BLOCKING 1.
- Queued, executing and unknown-outcome later attempts still refuse with RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED (same as 0112): MET by inspection, tests at test:922-940.
Repair 3
- Real PostgreSQL upgrade from a POPULATED 0111: MET in the test as written (upgrade test:82-123 builds previewed, queued, unknown-outcome, delivered and revoked messages through the real M4-5-S repository before 0112).
- Rows unchanged: MET as written (every table in five schemas, row_to_json text plus xmin and ctid, after 0112 and after 0115). Privileges unchanged: MET as written (roles, memberships, table owners/ACLs/RLS flags, policies, routine owner/ACL/definer flag; 0115 must equal the 0112 catalogue exactly). Audit chain verifies: MET as written. Preview/approve/revoke/deliver/reconcile on upgraded data: MET as written (test:170-210). NOT RUN anywhere I can see.
Migration limits
- Only CREATE OR REPLACE of routines from 0112: MET. 0115 contains BEGIN, two CREATE OR REPLACE FUNCTION, COMMIT. No table, column, policy, grant, role, trigger or row statement.
- 0112 and earlier files untouched: MET (9 files changed, none of them an earlier migration). Registered in numeric order: MET (migrate.ts:63). Position test by name and order only: MET (upgrade test:127-133). Comment above each routine saying what changed: MET.
- "Adds only what the repair needs": PARTLY — the trigger also writes a time_advanced entry (LATER 1 and 6).
Not-in-this-repair list: nothing from it was built (no SBOX-2 routine, UI, e2e timeout, reopened-label or M4-5-S guard change).
Existing assertions byte-identical: MET (follow-up test file is +115 / -0, all appended after line 827).

## Routine-by-routine diff against 0112 (bodies extracted to /private/tmp/claude-501/m46sr1-review and diffed)
- app.guard_recovery_follow_up: differs only in the CREATE OR REPLACE header, one comment line, and the source-message predicate (1 line became 6). Run, clock, case, revision, one-live-follow-up and owner refusals are identical, in the same order.
- app.evaluate_recovery_follow_ups: differs only in the header, two added DECLARE lines, and 51 added lines (the audit block) between END LOOP and RETURN. The original tenant check, archived check, loop and inserts are identical.
- The three M4-5-S guards and every other 0112 routine and trigger: not restated in 0115, so unchanged. 0107 comparison not applicable.

## Question 2 — money, access, data, main journey
- Money: no money path touched.
- Access/tenant: no hole found. Both routines stay invoker-rights (no SECURITY DEFINER added); CREATE OR REPLACE keeps owner and grants; the tenant check at the top of the evaluation is retained; every sub-query is tenant- and case-qualified; the audit insert runs as the runtime role under row security and uses the existing head helpers.
- Nothing is newly ALLOWED beyond repair 2's rule. Boundaries reasoned through the SQL: revoked reminder 2 then reminder 3 queued -> refuses; revoked 2 and revoked 3 -> message 1 eligible; a later delivered message -> it becomes the source; unknown outcome (sink row but action not succeeded) -> refuses; another case or tenant -> not selectable.
- Audit chain: the SQL hash matches audit.ts by inspection (same field order, 0x1f separator, UTC millisecond timestamp, sorted payload keys, null first previous hash). Two intents due in one advance -> one batch, head advanced once. Two concurrent advances on one run serialise on SBOX-2's own uniqueness, so no double append. Not executed.
- Main journey: BROKEN in one path — BLOCKING 1.

## BLOCKING
1. A reminder that was only previewed (never approved) now blocks scheduling for good. 0115:28-30 and recovery-follow-up-repository.ts:455-457 require EVERY later message to have a cancelled approval. A preview has no approval at all, so it can never qualify. 0112 chose "the newest APPROVED message" and so ignored unapproved previews.
   Failing case: deliver message 1; schedule; advance; "Preview the reminder" (message 2, not approved); cancel the follow-up (or close/dispute then reopen, or reset the practice run); schedule again from message 1. On main this is accepted. At this head it is refused with RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED, permanently: the stale preview can never be approved (0112:237-240) and no new preview is possible outside a reminder window (0112:184-188). The Schedule button stays disabled with no explanation (apps/web/app/ui/recovery-follow-ups.tsx:144,148). This is the DW6 continuation the repair exists to fix, in its previewed-but-not-approved form.
   Same cause, second effect: while a follow-up is live with an open preview, the refusal changes from RECOVERY_FOLLOW_UP_ALREADY_ACTIVE to MESSAGE_NOT_DELIVERED and scheduling.sourceMessageId becomes null (repository.ts:111,556,564).
   The new "active" test row (follow-up test:922-940) and the MIGRATIONS.md sentence "an unapproved preview ... continues to refuse" record this new refusal as if it already existed. It did not.
   Required fix: in BOTH places, a later message blocks only when it HAS an approval whose outbox action is not cancelled (join approval and outbox, o.status<>'cancelled'); unapproved previews are ignored exactly as in 0112. Add tests: previewed-not-approved then cancel then schedule succeeds; previewed-not-approved then close/reopen, new run, schedule, review, exact approval, delivery. Change the "active" row to the 0112 result (ALREADY_ACTIVE while the follow-up is live) and correct the MIGRATIONS.md sentence.
   If the integrator rules that "active" in the order meant an unapproved preview, the dead-end after cancel/stop still needs fixing.
2. Required test evidence is missing for this head. The builder ran no database or browser test. The Mac log contains only its header line; the GitHub "checks" job for PR #130 was still pending at my last look. Not a code defect, but nothing here is proven on a real database until the follow-up, upgrade, migration and browser suites are green on fae8695.

## LATER
1. 0115:95-102, repository.ts:180-184 — when an advance makes the follow-up due, time_advanced is now written by the database as "system:recovery-follow-up-clock" with the clock hash, and the member's own entry (member actor + request hash) is suppressed. The member is still in recovery_follow_up_advance and the command receipt, but the audit chain no longer names who advanced time in that case.
2. 0115:101-118 — the audit canonical form is now duplicated in PL/pgSQL; a later change to audit.ts would break chain verification with only these tests to catch it. Add a direct parity test.
3. repository.ts:180-183, 0115:97-99 — unindexed JSON probe of audit_event on every advance; fine at practice scale.
4. recovery-follow-up-upgrade.integration.test.ts:84 — random port with no free-port check; use freePort like the sibling suite.
5. MIGRATIONS.md 0115 section — old application on the new database appends a second, member-attributed time_advanced; harmless duplicate, already admitted there.
6. 0115:95-99 — a direct SBOX-2 advance now adds a time_advanced entry to every follow-up it makes due (0112 wrote only became_due there); beyond the order's "adds only what the repair needs".
7. docs/verdicts/M4-6-S-R1/BUILDER_RECEIPT.md:68-74 — required pnpm lint, lint:lanes and openapi:check exited 1 in the builder sandbox; CI must cover them.
8. follow-up test:922-940 — the refusal rows run while the first follow-up is still live, not after a close and reopen.

## What I did
Source-inspected: the order; Sol findings 1-3; all 9 changed files; 0112 (whole guard, evaluation, helper and grant sections); 0001_audit.sql; audit.ts; sandbox-repository.ts advance; 0021 event columns; follow-up repository schedule/advance/signal/cancel/state; the follow-up UI schedule controls; the M4-6-S e2e stop/reopen journey.
Executed (all exit 0 unless stated): git rev-parse HEAD (matches); git diff ff072c7...fae8695 per file; git show --stat fae8695 (2 files); git diff --numstat (9 files, 604 added, 9 removed); diff of the two extracted routine bodies against 0112; gh pr checks 130 (dependency-review pass, secrets pass, checks pending); git status at the end (worktree clean, nothing modified).
Attempted, NOT executed: a scratch database test outside the repo (/private/tmp/claude-501/m46sr1-review/scratch) for the cases in BLOCKING 1, revoked-then-queued, two revoked in a row, and two intents due at once. PostgreSQL would not start, so those cases are reasoned from the SQL, not run. Two environment facts the integrator should know: this worktree's embedded PostgreSQL aborts as installed (dyld: libicudata.68.dylib not loaded — library links not created); and with a working binary borrowed from worktree ch-1, initdb still failed at "running bootstrap script" (shared-memory limits are the likely cause; not confirmed). The Mac database run may fail for these reasons rather than for code.
Not verified: any database, migration or browser test; lint and lane checks; the Sol check.

## Test evidence seen for this exact head
None green. Mac log: header only. CI: main "checks" job pending. Database tests have NOT been seen green on fae86956c587b4a97d3d32f12582a232d99d74af.
