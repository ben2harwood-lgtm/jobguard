# SV7A-INT-P persistence handoff — STOP

24 October 2026. Source inspection at `41cd9d10c59993c01f3bcf387e750c1127ae9fa1`.
Issued build-ahead decision 74; this document does not install a persistence API.
The issued migration number is 0225; no migration has been created or applied.

The atomic writer cannot yet consume a checked diary admission seam. The accepted
MON1-A foundation installs `app.mon1_admit_place(uuid,uuid,text,uuid)` in 0210,
but its body unconditionally raises `METER_PLACE_SOURCE_HANDOFF_HELD` after its
private owner/context/preheld-lock checks. Its published contract explicitly
states there is no accepted checked pre-mutation source resolver. CH-4's separate
`app.ch4_admit_place(uuid,uuid,text)` in 0201 unconditionally raises
`CAPACITY_ADMISSION_UNAVAILABLE`. No later migration replaces either function.
Accepted parent commits therefore do not supply positive admission behavior.

`app.job_site_source_receipt` in 0144 accepts only `photo`, `delivery_note`,
`goods_receipt`, `builder_extra`, `stage_completion`. No integrated diary extension
exists. A diary must not masquerade as one of these sources. The issued draft
explicitly holds persistence construction until the coordinator binds the exact
CH-4/MON-1 delegation and acknowledges additive source constraints. Build-ahead
permission removes merge-order waiting; it cannot supply the missing interface.

The safest synthetic choice is to retain refusal. No partial off-site/message
writer, temporary success adapter, direct runtime source write or local lifecycle
algorithm is installed. The existing GET/read and worker paths are unchanged.
No source request can reveal hidden signals through a new path in this change.

## Required handoff before construction resumes

The source owners/coordinator must bind the actual private admission signature,
checked source discriminator, expected revisions, immutable diary/original/
evidence/upload mapping, first-evidence/site-activity/finish-cancellation behavior,
and refusal/replay contract. They must bind the complete order of authority,
tenant-capacity (184), lifecycle, job/source, command identity and audit locks,
including authority rechecks after waits. Lock 184 cannot be acquired late by a
trigger. Exact constraint additions and command legacy-store ownership require
acknowledgement; this document gives none on the owners' behalf.

Preserve the complete installed legacy store list in `packages/db/src/watchdog.ts`
(`LEGACY_COMMAND_OWNERS`), including CH-4 command events and links, and the shared
`watchdog-command-id:<lowercase-tenant>:<lowercase-command>` lock namespace.
Canonicalize every UUID before comparisons and hashing. Do not copy an incomplete
reservation list or replace a legacy reservation trigger.

The eventual one-transaction writer must authenticate persisted session/current
membership and exact session-owned/adopted job before informative reads, return
an exact authorized historical receipt before new-write live checks, bind every
input field/actor/job/kind to durable idempotency, and recheck authority after
blocking waits. All new sources after final lock refuse with the existing linked
job offer. On-site diary admission and original/upload/evidence/source/result/
audit must commit together; a held admission rolls back everything.

Exact reviewed UTF-8 bytes, hash, version, MIME, byte length and six-digit server
receive time must be server-derived; fixture references require exact server-owned
text/kind matches. Fictional names are metadata only. Source handlers must never
query or schedule hidden shadow work. Runtime receives only the narrow checked
writer EXECUTE, with no new direct writes. New routines remain migration-owned.
Any new role must be provisioned through demo-bootstrap ensureRoles and checked
for the required posture; no new role is proposed here.

The future writer and helpers remain the proposed signatures in the issued draft:

- `app.sv7a_intake_job_source(uuid,uuid,text,text,jsonb)` returning jsonb;
- private `app.sv7a_claim_source_identity(uuid,uuid,text,uuid,text,text)` returning text;
- private `app.sv7a_admit_diary_source(uuid,uuid,uuid,text)` returning uuid.

These names are absent at the inspected base, as expected for new deliverables;
none is called by a dormant repository in this change. The required upstream
positive source admission, by contrast, is an unresolved dependency STOP.

## Verification retained for the eventual implementation

P01–P08 and III-AUTH/MODE/COMMAND/EVIDENCE/HISTORY/SHADOW/NO-EFFECT/DB/UPGRADE
remain unfulfilled acceptance requirements, not waived tests. The unit adapter
suite must be DB-free; runtime authority, contention, post-lock serialization,
source integrity, catalogue and upgrade assertions need real PostgreSQL CI.
Every guard needs a removal-sensitive test; a negative control removing a guard
must remove every equivalent key. Upgrade tests must install predecessors, seed
and snapshot named columns/types/identities, apply only 0225, compare history,
then run successors twice. Forward-fix must preserve all stored evidence.

No positive persistence tests, migration, repository or error mapper are authored
against a fabricated upstream API. No browser spec is applicable to this leaf:
there is no route or page. CI and independent exact-head verdicts followed by
separate acceptance remain mandatory before technical completion.
