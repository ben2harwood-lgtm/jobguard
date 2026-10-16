# 0173_evidence_pack_authority — SERIOUS-B7 / S21

The highest migration on supplied `origin/main` is 0165. This migration replaces
only the body/language of the existing `app.authenticate_practice_session(text,uuid)`;
its signature, default tenant, returned principal, permission rules, owner and ACL
are preserved. There are no data changes, backfills or new privileges. The runner
discovers this file; neither its pinned migration list nor MIGRATIONS.md changes.

The approving repository enables transaction-local `app.evidence_pack_approval_fence`.
Only that path changes locking: session and fixed practice-owner membership rows
are locked FOR SHARE inside the matching tenant transaction before a
fresh statement checks current revocation, owner permission and clock-based expiry.
Evidence-pack attachment approval calls this routine inside its transaction after
command/case lock waits and before replay or writes. The existing server-installed
practice digest and recorded actor must agree. Legacy internal tenant-only fixture
calls retain their existing path. This is the existing application authentication
trust boundary; it does not protect against stolen privileged database credentials.

Lock order for authenticated attachment approval: command advisory key, case advisory
key, practice session, practice membership, final audit head. No business locks
follow audit allocation. Shared row locks persist through transaction completion,
ordering concurrent session/member revocation with the approval. Authentication
without this internal fence setting retains its original read-only behaviour.
The fenced path fails closed without the matching tenant context. No RLS policy
or control-plane grant is expanded to make bootstrap row locking work.

Upgrade/fresh application, non-superuser migration ownership, unchanged stored rows,
EXECUTE ACL, direct control-plane denial, blocked revocation, permission/expiry
changes and source routing are covered by `test/serious-b7.integration.test.ts`.
Those PostgreSQL checks cannot run in the issued sandbox and remain mandatory in CI.

Forward fix: keep attachment approval disabled if the migration cannot be deployed;
correct the function in a later numbered migration. Do not roll application code
back to unfenced approvals. Restoring the previous function body would reopen S21
and requires disabling that command first. No stored rows need reversal.
