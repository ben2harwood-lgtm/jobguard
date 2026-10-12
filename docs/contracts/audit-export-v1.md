# Audit export v1 — ENT-10b

The signature proves export integrity only. It does not establish truthful work, commercial liability, customer agreement, enforceability or an external timestamp.

This leaf is synthetic-only. Every payload says `Practice sandbox — synthetic data; nothing is sent or charged`. `pilot_no_charge`, `production_billing` and missing/unknown modes refuse creation server-side with `AUDIT_EXPORT_MODE_HELD`. Founder signing-key decisions, D04/G5 live approval, rotation and long-term verification (M5-9) are HELD. No provider or outbound business action is used.

Both Next `/api/contractor/audit-exports` and Nest `/contractor/audit-exports` use `AuditExportApplication`, registered through `createWorkspaceApplication`. GET lists persisted artifacts; POST accepts only the strict `audit-export-request.v1` `{version, commandId}`. Browser writes require a trusted configured origin. There is no requested tenant, role, identity, recipient, checkpoint, environment or signing key in this input. The existing ENT-1 persisted session resolves membership; the existing reviewed ENT-1 query verifies active membership before export access. Its projection is discarded and grants no export authority. If that query refuses a session-attributed membership (including revocation), the shared contractor-session bridge supplies a context solely for a refusal transaction, with the tenant coming from the persisted session lookup. That path rechecks historical membership/identity in the session tenant, appends one refusal event and commits before returning 403; it never queries exports or grants export authority. Failure to persist the refusal returns unavailable. Authorization is rechecked under ENT-1's tenant lock. Only active tenant-wide owner/admin grants permit create/list; branch-scoped grants cannot authorize export of the entire tenant chain. Other authenticated roles are refused and `audit.export.refused` commits before the typed 403 is raised. Unknown/foreign actor identities never enter the tenant refusal chain: its actor is the fixed `security:unverified-member` reference. Missing sessions are typed 401; there is no trustworthy tenant in which to audit an unauthenticated request.

A trusted checkpoint must already exist in `audit_control.checkpoint`. The existing assurance path produces it. `handoffAuditExportCheckpoint(assurancePool, checkpoint)` copies precisely the matching stored record to `app.audit_export_checkpoint`; callers must supply restricted migration/assurance credentials. This function is not wired to an HTTP route, workspace seam or worker. Runtime cannot read `audit_control`, insert a handoff, or call a new elevated routine. It can read only RLS-scoped handoffs. The export fails with `AUDIT_EXPORT_CHECKPOINT_REQUIRED` if there is none. A handoff is a copy of existing trust material, not a new checkpoint or external anchor. The all-tenant `exportAuditCheckpoints` operator skips existing `(tenant_id, sequence)` records and returns only newly recorded checkpoints; an all-idle call returns an empty array. A different stored hash at a newest sequence raises `AUDIT_VERIFICATION_FAILED`; true records inserted for other companies by that call remain recorded.

Creation takes ENT-1's business lock before the audit head lock. The head lock is final. It appends `audit.export.created`, then reads all committed tenant entries, including that event, verifies every handed-off checkpoint with `verifyAuditChain`, signs and inserts an immutable row in the same transaction. A failure rolls everything back. Replaying a command ID returns identical stored bytes and no new event; another actor reusing that ID is a typed conflict. A new command ID creates a new export/event. Export table keys and membership/audit foreign keys are tenant-qualified, with FORCE RLS and SELECT/INSERT only for runtime. Handoffs have SELECT only. No existing privilege, role, table, policy, routine or audit row is changed.

Each creation generates an Ed25519 key pair in memory using Node crypto. No private key is stored, logged, configured or committed. UTF-8 bytes of the strict JSON payload are signed exactly, without verification-time reserialization. The `audit-export-file.v1` wrapper carries `algorithm`, base64 payload/signature and public PEM. The signed payload carries one tenant, export ID, server time, signer SPKI SHA-256 fingerprint, exact entry count/tail hash, complete ordered audit entries and that tenant's checkpoint records. Audit payloads retain the merged identifier/hash-only policy; references remain potentially personal data. No membership directory, emails, other tenant count, or other tenant keys are joined into the artifact.

After building the DB package, run:

```
node packages/db/tools/verify-audit-export.mjs export.json --trusted-public-key public.pem
```

The CLI needs only the file and public verification material, installed local code and Node; no database, credentials, server or network. It verifies the signature, key fingerprint, strict versions, all tenant bindings, sequence/link/payload/event hashes through the merged `verifyAuditChain`, checkpoint membership, signed count/head, and the final export event. Alteration, omission, reordering, tail truncation, invalid signatures or checkpoint mismatch fail verification. Exit 0 means intact against independently supplied trusted public material; exit 1 means invalid integrity or missing independent signer trust; exit 2 means usage/unreadable input. Without `--trusted-public-key`, integrity may be valid but `complete` and `signerTrusted` are false. Public material copied from the same untrusted file is not independent trust. In this synthetic leaf an independently trusted delivery channel is an operator responsibility; there is no founder-approved signer identity, key registry, rotation, revocation/expiry service or long-term guarantee. A fresh per-export key is not another tenant's key.

The admin page at `/admin/contractor/audit-exports` lists persisted artifacts and downloads exact stored JSON/public material; reload and a second browser context use the same service. No checkpoint importer or privileged bootstrap button is offered. Missing handoff and permission refusals remain explicit. The page retains its command ID for unavailable, transport, unreadable and unknown outcomes, including across list reloads. It clears the ID only after success identifying that command or a versioned 4xx forbidden/invalid-input/checkpoint-required/mode-held refusal. All responses are no-store and unexpected errors return only `AUDIT_EXPORT_UNAVAILABLE`, without driver detail.

Migration 0121 is expand-only and adds two tables, policies/grants on those new tables, immutable triggers using the existing rejection function and tenant-qualified foreign keys. It has no backfill and changes no prior object. Rollout/rollback: the preceding application ignores the new tables; disable new routes if needed and fix forward. Never delete exported artifacts or alter historical audit events to roll back. Retention/export/deletion for real data remain held on founder-approved policy.

## Operator hand-off (ENT-10b-OPS)

Definitions:

- **Checkpoint:** one row of `audit_control.checkpoint` `(tenant_id, sequence, event_hash, recorded_at)`: a statement that at `recorded_at` the tenant's chain held the event with that sequence and hash. Immutable; only the migration role can read or write it.
- **Hand-off row:** one row of `app.audit_export_checkpoint`: a copy of one checkpoint that the runtime role may read for its own tenant and can never write.
- **The audit-checkpoint hand-off:** the two-step act, for one tenant, of (1) recording a checkpoint and (2) copying it into a hand-off row. Export creation needs at least one hand-off row for the tenant.
- **Audit head:** the tenant's row in `audit_control.audit_head` (the sequence and hash of its newest event). **Head lock:** the row lock `app.lock_audit_head()` takes; every appender takes it.
- **No new events:** a tenant has no new events exactly when a hand-off row exists whose `(sequence, event_hash)` equals the tenant's audit head. Decided only AFTER the head lock is held, by a fresh statement.
- **Hand-off event:** the single audit event this command appends for a tenant in an effective run, defined below. The checkpoint is taken AT this event, so the record of the hand-off is itself inside the checkpointed chain, and the next run finds no new events.
- **Disagreement:** for a tenant, any of: the audit head differs from the tenant's newest event; a checkpoint or hand-off row whose sequence has no event of that tenant, or whose hash differs from that event's hash.
- **Outcome (per tenant, per run):** `handed_off` (exactly one hand-off event, one checkpoint and one hand-off row were committed together), `unchanged` (no new events; nothing written), `failed` (nothing written for that tenant; carries a code).
- **Owner login:** the PostgreSQL login in `MIGRATION_DATABASE_URL`. **Runtime login:** the one in `DATABASE_URL` (`jobguard_runtime`). **Operator:** a person with a trusted shell holding the deploy variables.
- **Synthetic gate:** `JOBGUARD_ENV` is exactly `synthetic_demo` AND the URL's database name is exactly `jobguard_synthetic_demo` AND, once connected, `current_database()` is that name.

The event has random UUID `id`, version `audit.v1`, actor reference `operations:audit-checkpoint-handoff`, event type `audit.checkpoint.handed_off`, subject type `audit-checkpoint`, and subject reference equal to the tenant ID. Its payload uses only the merged fields:

```json
{
  "references": {
    "environment": "synthetic_demo",
    "priorSequence": "<head sequence before the append>",
    "operator": "<operator label>",
    "sessionUser": "<database session user>"
  },
  "hashes": { "priorHead": "<head hash before the append>" },
  "classifications": { "action": "security" }
}
```

`operator` is required at both the function and CLI boundaries, with 1–64 characters from `[A-Za-z0-9._-]`. The existing `references` field accepts these identifiers without changing the merged event schema or hash rule. The database session user comes from PostgreSQL, rather than the operator input. When is the event's own stored `occurred_at`, obtained by the merged appender from the server clock. Session names must satisfy the existing audit identifier schema; an incompatible name fails before an event write. Operator labels and session references remain subject to audit access/retention policy.

Only the local modules `audit-checkpoint-handoff.ts` (function, typed error/code and result) and `audit-checkpoint-handoff-cli.ts` (CLI entry function) export the new functions. Neither is re-exported by `packages/db/src/index.ts` or a package export. No API or web source imports them and the API module registrations cannot reach them. The sole changed shared helper type permits the existing copy function to accept a dedicated transaction client; its body and request-facing exports are unchanged. The existing all-tenant helper retains its signature.

Gates run before connecting: mode, URL protocol/database, then UUID/operator input. After connecting, the command verifies the actual database, session user equals the database owner and existing membership in both migration and runtime roles, before `BEGIN` or any write. The owner login is the merged bootstrap's database-owning login from `MIGRATION_DATABASE_URL`, acting as `jobguard_migration`, never an arbitrary role merely able to set company context.

A short enumeration transaction selects only positive heads from `audit_control.audit_head`, ordered by tenant ID, as `jobguard_migration`. Optional `--tenant` filters that server list; it cannot invent a company. Companies run sequentially on one dedicated connection. Each company gets its own default READ COMMITTED transaction: local 5-second lock timeout; parameterized transaction-local company value; local runtime role; head lock as the first lock; local migration role; fresh reads of newest event, checkpoints and hand-off rows. Disagreement and unchanged paths roll back. The effective path switches locally to runtime, appends the event, switches locally to migration, inserts a checkpoint with no conflict clause, invokes the existing copy helper and commits. After the append there are only the role switch, two control-row statements and commit. Their foreign-key checks involve rows written by the transaction and the tenant row already held by the event insertion; no later business lock is acquired. A company failure rolls back its event and both control records and the command proceeds to the next company.

The connection is destroyed rather than released for reuse, and its dedicated pool is ended in `finally`, including failed connection attempts. Only `SET LOCAL ROLE` and `set_config(..., true)` occur; no company or role setting survives commit or rollback. A no-new-events run writes nothing and emits `nothing to do` for that company. No audit record is created for an idle run.

Closed error codes:

| Code | Meaning |
| --- | --- |
| `AUDIT_CHECKPOINT_MODE_HELD` | Missing or non-synthetic mode; no connection. |
| `AUDIT_CHECKPOINT_TARGET_FORBIDDEN` | Invalid protocol/database URL, missing owner URL, or connected database differs. |
| `AUDIT_CHECKPOINT_INVALID_INPUT` | Invalid UUID/operator or missing, repeated or unknown CLI arguments. |
| `AUDIT_CHECKPOINT_TENANT_NOT_FOUND` | Requested UUID absent from the server's positive-head list. |
| `AUDIT_CHECKPOINT_FORBIDDEN` | Wrong owner login/role membership or PostgreSQL 42501. |
| `AUDIT_CHECKPOINT_DISAGREEMENT` | Defined disagreement, checkpoint uniqueness conflict or copy helper requiring a checkpoint. |
| `AUDIT_CHECKPOINT_UNAVAILABLE` | Other failure, including connection or lock timeout. |

CLI output is one JSON line. `ok` is false and exit status is 1 if any company failed or a top-level gate failed. Role refusal includes a plain message naming the found role and required owner/migration role. It prints no connection URL, host, credentials, driver message or stack. This role-refusal detail is the explicit C-OPS-2 exception to omitting user detail.

**Why this is safe:** the command is reachable only from a shell that holds `MIGRATION_DATABASE_URL`; it adds no grant, so the runtime role's rights are identical before and after. The chain event is appended as `jobguard_runtime` under the transaction-local tenant value, so row-level security itself refuses a row for any other tenant. Control rows are written as `jobguard_migration` with the same tenant ID bound as a parameter; tenant IDs never come from a request. These are restricted local operator credentials, rather than application authority. A checkpoint remains a restricted observation of chain history, with no external timestamp or proof of underlying work.

**Later:** every hosted practice sign-in creates a new tenant, so a manual run covers only companies existing at enumeration; a later company still sees `CHECKPOINT_REQUIRED` until another run. Automatic or scheduled hand-off, a hand-off at deploy, and a screen or route are not built. A future automatic hand-off needs a separate RED order deciding frequency, where the owner credential may live outside the build, and the evidential worth of system-taken versus deliberate operator checkpoints. External time-stamping remains M4 / M5-9. Non-synthetic modes, D04/G5 and M5-9 approvals remain held. Recording the operator person label is built under C-OPS-4; it is not deferred.

### All-company checkpoint candidate snapshot (Rounds 1–2)

`exportAuditCheckpoints(pool)` selects each company's newest `(tenant, sequence, hash)`
triple once in a materialized candidate set, in the PostgreSQL statement that
inserts missing checkpoints. That statement returns every candidate and whether it
was inserted. After it completes, a fresh statement checks the stored checkpoint for
every skipped candidate, using only those fixed identities and hashes. This also
covers a conflicting row committed while the insert waited on uniqueness: that row
can be invisible to the insert snapshot, but is visible to the fresh check.
A candidate disagreement
means the existing checkpoint at that candidate's tenant and sequence has a different
hash. An append after that snapshot cannot move the check to a newer sequence.
Equal hashes are harmless skips; the return value contains only newly inserted rows.

The statement commits all valid missing checkpoints before TypeScript reports any
candidate disagreement with `AuditVerificationError` (`AUDIT_VERIFICATION_FAILED`),
naming the company and sequence. Existing rows remain unchanged, and valid inserts
for other companies are kept even though the function rejects and returns no list.
This is the existing partial-success behavior of the all-company pool helper; it does
not wrap insertion in a transaction that rolls back on verification failure. Its three
existing callers retain the same signature and successful return shape. The shell
operator command does not call it: that command still locks one company's head and
commits or rolls back that company's event, checkpoint and hand-off together.
