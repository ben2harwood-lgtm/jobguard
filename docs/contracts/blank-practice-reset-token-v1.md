# Blank practice reset token v1

WALK-RESET-TOKEN, RED: amendment to WALK-2's synthetic practice session
boundary. Migration 0687 leaves 0657 and its routine definition unchanged.

`app.start_blank_practice_company_v2(new_token text, previous_token text DEFAULT
NULL)` accepts raw tokens matching the existing `practiceSessionV1` UUID format,
including its nil/max UUID cases and case-sensitive token bytes. It hashes UTF-8
bytes using PostgreSQL SHA-256 and lowercase hex, matching the existing TS
session authentication. Null/malformed new tokens, malformed non-null previous
tokens and identical tokens fail with UNAUTHENTICATED. A null previous token
starts a new blank firm; reset requires the caller's current raw blank-session
token. Missing reset tokens are refused by the existing application boundary.

Possession of another tester's stored job/session digest is insufficient to reset
that session. The routine locks the presented previous session before checking
it is live and blank, then atomically revokes/replaces it. Expired, revoked,
nonblank or unknown previous credentials fail without changes. Historical jobs,
sources and audit remain intact. The old browser credential loses access; the new
session starts empty. All existing synthetic-database and membership fences stay.

Only jobguard_runtime receives EXECUTE on the new SECURITY DEFINER routine,
owned by jobguard_migration with search_path=pg_catalog. Runtime EXECUTE on the
old digest routine is revoked. No table privileges are added. This narrows reset
authority; it does not replace the other existing digest-based practice APIs or
create separate tenants for the firms. Raw tokens must stay out of logs, fixtures
and receipts; parameterized SQL carries them only to the trusted database.

The integration suite holds the first reset transaction open and observes the
second backend waiting on a database lock before committing the first. The second
must then refuse. A scratch replacement of the routine body without its lock
must allow both resets, demonstrating why that same invariant would fail; finally
restores the original definition. This mutation is test-database-only.

Undo (explicit operational rollback): re-grant runtime EXECUTE on the old routine
and point the TypeScript call back to the original digest arguments. Keep both
migrations and retained history. This deliberately restores the old weakness and
needs security review; forward repair is preferred.

Named holds for landing: LP-0 effective-privilege inventory and any affected
routine/source pins must be reviewed and updated by their owning lane; no scanner,
pin or existing contract is changed here. The supplied migration proof is authored
expected catalogue change, pending real PostgreSQL proof replay. PostgreSQL
integration/migration suites, unchanged WALK-2.spec.ts, the lock-removal mutation
and exact-head independent RED review remain landing gates, not local passes.
