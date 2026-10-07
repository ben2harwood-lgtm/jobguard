# Shadow persistence v1 — SV-2 (synthetic)

Migration `0100_shadow_persistence.sql` extends the merged SH-1 origin schema. It
creates no detector, lock table, final-review/catch command, HTTP route or screen.
D12, D13, G1 and G4-S remain gates. This document records implementation choices;
it grants no production or support authority.

`shadow_commercial_signal` stores the §10.2.2 proposal/provenance fields, a work
identity, state/revision/outcome, qualified match references and a write-once
coalesced target. Original descriptions, detector provenance and server creation
time cannot be rewritten. Evidence links bind the exact tenant/job/evidence ID,
immutable object version, SHA-256 and evidence object's server receive time.
Ineligibility reasons, classifications, dispositions, reconciliation results,
disclosures and emergency-access facts are append-only. A reconciliation result
is inserted as completed/failed; SV-5 will implement orchestration and add its
lock/locked-line bindings by an expand-compatible migration. SV-2 writes no run,
classification or disposition from a worker or command.

All nine new business tables have FORCE RLS and migration ownership. Every
subject link includes tenant/job; classification is unique per tenant/run/signal.
Withdrawal retains the variation and its origin in the capture register, without
changing its existing draft/priced/approved/rejected state. Its repository seam
checks active owner membership and appends an audit event. No Withdraw action is
exposed by SV-2.

| Database principal | Table privileges / bounded routine EXECUTE |
| --- | --- |
| `jobguard_runtime` | No shadow table/column/sequence/view privileges. SELECT/INSERT withdrawal facts. EXECUTE `reveal_shadow_signals(uuid,uuid)` only. Existing SH-1 ordinary origin grants stay unchanged. |
| `jobguard_shadow` | SELECT shadow tables; INSERT proposal/evidence/ineligibility/run/classification/disposition facts. UPDATE selected signal projection columns only. EXECUTE `record_shadow_disclosure(uuid,uuid,uuid,uuid,text)`. |
| `jobguard_shadow_emergency_access` | No table privileges. EXECUTE `read_shadow_emergency(uuid,uuid,text)` and `record_shadow_disclosure(uuid,uuid,uuid,uuid,text)` only. |
| `jobguard_migration` | Owner and tenant-scoped routine authority; private audit helper is owner-only. |

Schema `app` USAGE is new for both shadow roles. 0100 therefore revokes PUBLIC EXECUTE
from four older SECURITY DEFINER routines that never had it revoked
(`advance_final_account_draft`, `invalidate_stale_final_account_authorizations`,
`reserve_customer_invoice_number`, `issue_practice_customer_invoice`). `jobguard_runtime`
keeps its existing explicit grants on each, unchanged. A catalog test proves each new
role can execute, among non-trigger routines in `app`, only its SV-2 grants above plus two
pure non-SECURITY-DEFINER arithmetic helpers (`half_even_ratio`, `reference_recovery_cap`)
that keep their default PUBLIC EXECUTE, and that the four older routines are refused to
real logins of both roles.

Both new roles are NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT,
NOBYPASSRLS and members of no other role. Bootstrap creates them before switching
to the migration owner and rejects unsafe posture. PostgreSQL 16 gives the
CREATEROLE bootstrap owner an automatic ADMIN-only membership in each role it
creates (no INHERIT, no SET; granted by the bootstrap superuser). The owner cannot
remove it, so it remains: bootstrap and its test accept exactly that shape (the
bootstrap owner, `admin_option` true, `inherit_option` false, `set_option` false)
and fail closed on any other holder. It confers none of the role's privileges
(`pg_has_role` `USAGE` and `SET` are false), but ADMIN OPTION would still let that
owner grant the role to a login; who may hold the emergency role outside synthetic
mode therefore stays an explicit G1 decision. Neither bootstrap nor the migration
appoints a support holder. Tests grant membership only to generated synthetic
logins; runtime and shadow never hold emergency permission.

The repository takes a server-verified tenant context and versioned Zod inputs.
The database routines verify the transaction-local tenant, use a pinned
`pg_catalog,app` path and never change the tenant context. RLS covers missing or
incorrect row filters within that verified tenant. It does not authenticate the
application choosing that context or defend against privileged rewrites.

The reveal routine checks for the future `app.final_account_lock` relation. In
its absence it always returns an empty result, including when matching revealed
rows exist. It creates no lock relation. When that relation exists, its guarded
query checks a matching tenant/job lock before returning only that job's revealed
rows. Ben's 7 October “split the test” decision moves the positive locked-job
assertions to SV-4; SV-2 tests the empty half and exact EXECUTE grantees. SV-4 must
retain the `(tenant_id,job_id)` predicate and serialize lock creation on the job
row before audit. The reveal audit shape is constant with respect to hidden
signal presence/count.

Every disclosure route uses `record_shadow_disclosure`. Job then signal locks
precede the final audit-head lock. Before lock it atomically appends the disclosure,
sets permanent disclosure and first-visible provenance, moves the projection to
`surfaced_early`, and appends `disclosed_before_lock` and `surfaced_early`
ineligibility reasons. The disclosed state cannot be cleared or moved out of the
terminal early-surface state. An identical event-ID replay returns the existing
fact; changed job/signal/route/actor conflicts. The support repository function
pins route `support_conversation`, with no HTTP surface. The routine requires
the caller session to be able to use the separate emergency role (`pg_has_role`
`USAGE`) for that route; worker EXECUTE permission alone cannot impersonate a
support conversation, and an ADMIN-only membership, such as PostgreSQL 16's
automatic creator membership, does not satisfy it. A holder must therefore be
granted the role with INHERIT. The routine does not
return the signal description.

Emergency reads require the separate role and a nonempty, bounded reason. They
append `shadow_break_glass_access` and an audit event before returning rows. Audit
actor references come from the database session principal, never a caller claim.
The audit payload contains job/event IDs and the reason's SHA-256 only; the reason
text remains in the restricted access fact. SQL audit appends use the existing
per-tenant serialized head and the existing `audit.v1` canonical hash format.
Read results must not be delivered until the containing transaction commits;
`ShadowRepository` returns them after `withTenant` commits. A rollback removes
both the access/disclosure fact and its audit entry. Private helpers have no
PUBLIC or business-role EXECUTE grants. The audit chain retains its previously
documented checkpoint/privileged-rewrite limitations.

The shared command names remain exactly:

| Draft card name | Merged command | Origin |
| --- | --- | --- |
| LogExtra | LogBuilderExtra | builder_logged |
| AddFinalReviewExtra | AddFinalReviewExtra | final_review |
| ConfirmCatch | ConfirmJobGuardCatch | jobguard_catch |

The existing application propose action now uses `LogBuilderExtra`, with a
processing receipt, active owner check, a live small-builder job check in either
synthetic practice mode (`synthetic_demo` or the UI's default No charge scenario,
`pilot_no_charge`; the track column admits no other value), exact job/variation semantic key, stored
capture hash, raising actor/role, authoritative server time and separately
labelled optional device metadata. Text capture has no evidence-object claim;
its evidence hash is null. The proposal ID is also its stable command ID. Capture,
optional initial pricing, origin, audit and receipt completion commit together.
Concurrent unchanged retries return one effect; changed content conflicts. It
takes no row lock on `app.job`: PostgreSQL requires UPDATE privilege for every row-lock
strength and `jobguard_runtime` has none there. Exactly-once rests on the receipt claim
and the variation/origin keys. It creates no commercial send authority or platform fee.

After SBOX-SESSION-1, every variation read and command first authenticates the
practice cookie and checks the job's immutable `practice_session_digest` through
`PracticeAccess`, including command retries. Missing or invented sessions fail
with 401; another session's job fails with 404 before parsing or repository work.
The capture seam receives that verified tenant context. Practice application
fixtures use jobs generated by the session issuance routine; isolated tenant/FK
fixtures and the unbound legacy upgrade fixture remain deliberate database tests.
0100 changes neither 0094's ownership binding/guards nor its restrictive catalogue
policies. Shadow tables retain their restricted worker/support authority and are
not exposed through practice routes; any future builder reveal composition must
retain the same session/job check. Tenant RLS alone does not authenticate a
practice session.

SH-1's backfill is verified rather than repeated. Existing synthetic legacy
capture compatibility remains. `source_signal_id` is mandatory only for
`jobguard_catch`, with a tenant/job-qualified FK. PostgreSQL FK checks bypass RLS;
therefore the BEFORE INSERT origin validator uniformly rejects every ordinary
runtime catch/source-ID attempt before any FK lookup. Existing and nonexistent
IDs have the same SQLSTATE/message/detail. SV-5 must provide the authorized,
lock-bound catch path; SV-2 adds no exception or command alias.

SV-1's pre-lock duplicate marker is intentionally `reconciled/duplicate_signal`
with a coalesced target: it records coalescing, not a completed final-check run.
A duplicate whose provenance was disclosed stays `surfaced_early`. SV-3 must
preserve those semantics without exposing hidden counts or content.
