# Extra authority loss v1 — Q14 synthetic ruling

Decision (plan writer, logged in AGENT_CHOICES.md; cautious, fail closed, easy to undo): retain recorded decisions, cancel unused client permission when either party loses the authority covering the job, and offer no client-approval-history export. Ben may reverse this ruling. This amendment does not complete ENT-5 or activate Q15, delivery, scheduling, a real provider or a real-user launch.

A named client's membership and current client/contract grant must still cover the job. The surveyor or commercial manager who authorized an invitation must also retain a job-covering grant. At fake-email claim, SQL cancels every still-unused pending or retryable invitation for that approver/job whose authority has lapsed, before an attempt is recorded. A cancelled outbox row invalidates its invitation permanently; granting access again does not revive that link. Nothing is deleted. Existing decided links and immutable approval/outcome facts stay as history, subject to current read authority. A sender's later loss of authority cannot erase the client's decision or prevent an otherwise authorized historical read.

At link use, both the identity session route and the legacy command/view boundaries check current authority and cancellation. They return typed refusals. A failed SQL operation rolls back its transaction; cancellation becomes durable at an executor claim, while link reads/decisions always fail closed against current authority. No refusal-audit table is added. Committed automatic cancellation appends the existing audit chain event, without recipient or free text.

There is no client history export operation. The existing client action allowlist refuses `export` as `CUSTOMER_REFUSED` (SQLSTATE 42501), without storing the refusal. Internal contractor evidence-bundle assembly can inspect approval facts; its API check returns only verification sections/digests and a verification report, never bundle bytes or history. Its strict input refuses an export request as `INVALID_INPUT`. This amendment grants no new export or recipient authority.

## Named holds for landing

- RED independent review and green CI on the exact head remain required; this is a NOPR branch.
- PostgreSQL execution, regression suites (extra-client-session, extra-approval-chain, outbox, Northside demo/upgrade and evidence-bundle), fresh/upgrade migration proof, and negative mutation proof must run in CI. This sandbox cannot start PostgreSQL or a browser. No existing suite was edited.
- Migration 0686 re-creates `app.xa_client_view_authority(uuid,uuid,uuid,text)` from 0158, `identity.extra_customer_use(uuid,uuid,uuid,text,text,text)` from 0643, and `app.xa_client_decide(uuid,uuid,uuid,uuid,text,text,text,bigint,boolean,text,text,text)` from 0522. Apart from the added authority checks, predecessor bodies, owners, search paths and grants are retained. Reconcile any later LP routine replacement before landing.
- The proof JSON follows main's newest schema; new routine catalog entries are authored expectations, not observed PostgreSQL evidence. Recompute definition/call deltas for all three re-created routines and scanner/pin changes in the landing lane. No protected scanner or pin file was changed.
- There is no single authority-revoke routine: contractor admin commands and SCIM can remove membership/grant authority. No one revoke path was changed. Claim/use enforcement is mandatory regardless of the revocation path. Immediate durable cancellation solely on a refused link use would require a separate committing refusal boundary; the current exception-based interfaces roll back refusals.
- The router adds amendment pointers to existing contracts and BUILD_PLAN.md at landing, as required by this piece's allowed-file boundary.

Forward fix by an additive migration; do not delete decisions, links or migration history. Restoring a grant preserves authorized history access but never reopens a link whose send was cancelled.
