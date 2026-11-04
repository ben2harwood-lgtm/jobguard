# 0753 retention records — synthetic draft archive

Adds one empty append-only business table with tenant/job and membership foreign
keys, ordered book rows, record hashes, FORCE RLS, and update/delete/truncate
refusal. The migration-owned routine is the sole runtime grant. No existing table,
routine, financial fact, policy or historical row is modified.

Prepare/core validation/append share a job advisory lock and transaction. Session
membership is resolved again before append and replay. The existing audit routine
takes the final lock; there are no later business locks. The caller's tenant
setting is saved/restored rather than attached as a function SET clause.

Forward fix is preferred: retain historical records and use core reversal/date
revision facts. To disable access, revoke EXECUTE on the new routine in a reviewed
follow-up migration; preserve the archive. Never delete retained history.

The hand-authored proof covers LP-0 runtime authority, upgrade catalogue changes,
empty rows and tenant posture. CI must execute fresh and upgrade PostgreSQL proofs,
RLS/privilege inspection and retention-records.integration.test.ts, especially two
concurrent releases. Local source/unit checks are not database proof. Exact-head
independent RED review is required before merge. This does not finish M4-20 or
authorize production, notices, invoices, reminders, tax or fee posting.
