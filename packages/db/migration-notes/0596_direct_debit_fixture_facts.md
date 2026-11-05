# 0758 — M4-15 synthetic Direct Debit facts (RED)

Adds two private append-only fact tables and one synthetic-database-only routine.
No backfill. Existing rows, routines, financial books and subscription mandate
storage are unchanged. The routine executes as the migration owner under FORCE
RLS using the caller's tenant context, which it checks and never changes. Runtime
gets EXECUTE on this routine only, with no table access or new role.

The caller supplies an already signature-verified fake event and independently
trusted server bindings for mandate and accepted payment identity/amount. The
repository is not a signature verifier or an authentication bridge. The initial
created mandate fact establishes identity; later payment facts bind command,
object, amount and mandate permanently. An optimistic expected history head under
a tenant advisory lock serializes competing facts, while exact replays return
history regardless of their old expected head. Event IDs are checked across both
tables. SHA-256 covers the canonical event and binding. Delayed events remain in
history and cannot revive terminal states in the read projection.

Every call is one transaction; batch callers catch per-event failures and proceed.
The store only answers whether mandate state blocks submission; it executes no
collection, reservation, release, settlement, refund, invoice or ledger action.
No application wiring, HTTP, worker, SDK or production enablement is added.

Forward fix: keep this seam unregistered and apply a new reviewed migration.
Do not edit this migration once landed. Preserve the append-only synthetic facts;
no destructive rollback is proposed. PostgreSQL CI must prove fresh migration,
upgrade/catalogue proof, FORCE RLS and grants, immutable rows, independent-process
replay, concurrent-head conflict, account/reference rejection and lifecycle
projection. Local unit checks cannot establish those database guarantees.
M4-15 remains open for the real rail, wiring, notices and D04/D05 policy; G4-C/G4-S
and all existing release gates remain closed.
