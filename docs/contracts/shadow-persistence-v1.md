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

Both new roles are NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT,
NOBYPASSRLS and members of no other role. Bootstrap creates them before switching
to the migration owner, rejects unsafe posture, and removes PostgreSQL 16's
implicit role-creator membership. Neither bootstrap nor the migration appoints a
support holder. Who may hold the emergency role outside synthetic mode requires
an explicit G1 decision. Tests grant membership only to generated synthetic
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
the caller session to hold the separate emergency role for that route; worker
EXECUTE permission alone cannot impersonate a support conversation. The routine does not
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
processing receipt, active owner check, exact job/variation semantic key, stored
capture hash, raising actor/role, authoritative server time and separately
labelled optional device metadata. Text capture has no evidence-object claim;
its evidence hash is null. The proposal ID is also its stable command ID. Capture,
optional initial pricing, origin, audit and receipt completion commit together.
Concurrent unchanged retries return one effect; changed content conflicts. It
creates no commercial send authority or platform fee.

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
