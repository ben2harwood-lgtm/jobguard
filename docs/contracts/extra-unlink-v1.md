# ENT-4c duplicate un-link v1

Server repository only, `synthetic_demo`; no route or screen. Authority: founder's 12 October 2026 answer "All five roles", BUILD_PLAN §9.1.6 and the issued ENT-4c-R2 order. The coordinator's existing commit changes only the pure un-link list and its one merged test row. The list `senior`, prompt confirmation, reconciliation and fees keep their existing rules.

## Definitions

- **Extra:** one `app.variation` row on a contractor job together with its one `app.extra_origin` row; identified by `variation.id`.
- **Contractor job:** a job where `app.job.provenance='work_order'`, `app.job_commercial_track.job_track='contractor'` and `environment='synthetic_demo'`.
- **Link row / un-link row:** a row of `app.extra_duplicate_link` whose `kind` is `link` / `unlink`. **Duplicate** and **canonical** are that row's `duplicate_id` and `canonical_id`.
- **Active link:** a link row for which no un-link row exists whose `reverses_link_id` equals its `id`. **Reversed link:** a link row that has one. A reversed link never becomes active again; linking the same pair again writes a new link row with a new id.
- **Exported:** an extra has at least one `app.extra_event` row with `kind='exported'`. No merged repository writes that kind yet; migration-owner test fixtures do.
- **Link history of a job:** every row of `app.extra_duplicate_link` with that tenant and job, of both kinds.
- **Link revision of a job:** the number of rows in its link history, counted inside the command's own transaction after the job lock is held; 0 when there are none. The read obtains the count and active list in one SQL statement.
- **Actor:** the membership named by `actorMembershipId`. This order adds no route, so no person can reach the command. The later route must take the actor from the signed-in membership, never a request body; that binding is not built here.
- **Covering grant:** a row of `app.role_grant` for the actor that is not revoked and whose scope covers the job, exactly as `app.contractor_job_allowed` decides it.
- **The five roles:** supervisor, surveyor, commercial_manager, admin, owner.
- **Allowed to un-link:** exactly when the database answers true to `app.contractor_job_allowed(actor,'organisation.manage',job) OR app.contractor_job_allowed(actor,'extra.price',job)`. This expression is **the allowed test**, the whole rule. The database decides active membership, grants and coverage. The repository does not read role names or copy scope rules.
- **The command:** `ExtraRepository.unlinkDuplicate`. **The read:** `ExtraRepository.readDuplicateLinks`.
- **Command receipt:** the command's row in `app.command_receipt`. **Result:** the object the command returns, also stored in that row's `result` column. **Builder receipt:** `docs/verdicts/ENT-4c/BUILDER_RECEIPT.md`.
- **Request hash:** `sha256Hex(canonicalJson(the parsed input without commandId))`, after all input uuids have been put into lower case.
- **Replay:** a call whose `commandId` and request hash both equal those of a call that already succeeded.
- **Refused; nothing written:** the transaction is rolled back; for that tenant the row counts of `app.command_receipt`, `app.extra_duplicate_link` and `app.audit_event`, and the audit head (sequence and hash), are the same before and after the call.
- **Passes unedited:** a merged test file whose bytes are identical to BASE and whose every case passes. This is an evidence claim only after execution; database cases have not run in the builder sandbox.

## Authority

INTERIM: the two permission names read the founder's five-role rule through the merged database permission function. A later order may give un-linking its own permission name. Authority follows grants; a member invited as read-only may un-link if later given a covering supervisor grant. No migration or permission-table copy is added.

| Role | Database role list (9) | Pure rule list (10) | May un-link before export with a covering grant |
|---|---|---|---|
| owner | yes | yes | yes |
| admin | yes | yes | yes |
| supervisor | yes | yes | yes |
| surveyor | yes | yes | yes |
| commercial_manager | yes | yes | yes |
| operative | yes | yes | no |
| finance | yes | yes | no |
| read_only | yes | yes | no |
| client_approver | yes | yes | no |
| connector | no; no grant can carry it | yes | no |

Every authority-refused caller receives `UNLINK_FORBIDDEN` before any job, command-receipt or link-row lookup, including replays and missing or foreign jobs. Refused callers cannot use different error codes to learn what they named. This specifies the answer, not constant execution time.

## Boundaries

`unlinkDuplicate(context: VerifiedTenantContext, raw: unknown, seam?: ExtraTransactionSeam): Promise<ExtraUnlinkResult>`.

The strict input schema `extra-duplicate-unlink.v1` accepts exactly:

| Field | Value |
|---|---|
| version | `extra-duplicate-unlink.v1` |
| commandId, jobId, actorMembershipId, linkId | UUID strings; normalized once to lower case |
| expectedRevision | integer 1–1,000,000; link revision the caller last read |
| reasonCode | `not_same_work`, `wrong_pair`, `linked_in_error` |

No tenant, duplicate/canonical id, role, permission, grant, time, kind, state or free-text reason is accepted. The command type is exported as `extraUnlinkCommandType = UnlinkDuplicate`; the reason list is closed. Unknown fields are refused.

Result: `{ unlinkId, linkId, variationId, revision }`. These are the new un-link row's id, the reversed link's id, the duplicate's id and the link revision after the write (`expectedRevision + 1`). The exact result is persisted in the completed command receipt.

`readDuplicateLinks(context, jobId)` returns the strict record:

```json
{
  "version": "extra-duplicate-links.v1",
  "jobId": "<uuid>",
  "revision": 0,
  "activeLinks": []
}
```

Each active link has exactly `{ linkId, duplicateId, canonicalId }`; ordered by `linkId`. The revision counts all history, including reversals. One SQL statement returns the count and active list at one moment. A missing or foreign job is `NOT_FOUND`. Like existing reads, it takes no actor and has no role rule. There is no route; who may read is held for the later route order.

## Ordered transaction

No savepoint is used: the existing deferred audit check requires the un-link row and audit event to share `xmin`.

0. Parse with the merged helper; `INVALID_COMMAND` precedes database work. Normalize every input UUID once and use only normalized spellings afterwards. Normalize the context's tenant id as merged methods do.
1. First lock: shared tenant advisory lock `pg_advisory_xact_lock_shared(hashtextextended(tenant::uuid::text,54))`.
2. Select the allowed test as one boolean column `allowed`. Anything other than boolean true is `UNLINK_FORBIDDEN`. This always runs, including on replay, before reading job, command-receipt or link rows.
3. Use merged `lockJob`: per-job advisory lock followed by required job row; missing row is `NOT_FOUND`.
4. Require the contractor-job binding defined above; otherwise `NOT_FOUND`. These guards cannot be reached as refusals after a yes at step 2 through merged work-order import paths: import creates the work-order job and contractor track together, and the track row is immutable. They remain guards against proceeding for another kind of job. No made-up-row test of those inner guards is claimed.
5. Claim the command receipt through merged `claim`, type `UnlinkDuplicate`, semantic value `extra-duplicate-unlink:<jobId>:<linkId>:<commandId>`, normalized request hash and actor. Replay returns the stored result here and writes nothing. Reusing a command id with a different request or any other command is `COMMAND_CONFLICT`.
6. Read only the named tenant/job/id row of kind `link`; absent is `NOT_LINKED`.
7. A reversing row means `ALREADY_UNLINKED`.
8. Count all job link history under the job lock; mismatch with `expectedRevision` means `STALE_REVISION`.
9. One `INSERT ... SELECT` obtains duplicate/canonical ids from the stored link and places the same allowed test in its WHERE clause. Insert an un-link fact with the exact reversed id, reason code, command and actor. Zero inserted rows means `UNLINK_FORBIDDEN`. The existing guard refuses either exported endpoint with typed `EXTRA_EXPORTED`.
10. Optional seam runs before audit with kind `duplicate_unlink`, command id, job id, duplicate id, new un-link id as `linkId` and reversed link id as `reversesLinkId`.
11. Append one exact-id audit event through merged `appendAuditBatch`. The audit head is the last new lock. No later business lock is acquired.
12. Complete the existing command receipt through merged `complete` and return the result.

Success writes exactly one command receipt of type `UnlinkDuplicate`, status `succeeded`, one link-table row of kind `unlink`, one audit event and the audit-head advance. No extra event or change to variation/origin/state/pricing/fee/grant facts. The optional seam follows the existing future-leaf contract; it is not used to add other behavior in this order.

The job lock serializes replay, competing reversals and new links. Replay writes nothing. Another command for an already reversed link is `ALREADY_UNLINKED` and writes nothing. Two callers create one un-link row. A new link can make a caller's expected revision stale. History is append-only; relinking writes a fresh link id.

## Audit

Event id equals the new un-link id; event type `contractor.extra.duplicate_unlinked`; subject type `extra`; subject ref the duplicate id; actor ref `membership:<actor>`.

Payload has exactly `references` with these seven names:

| Name | Value |
|---|---|
| command | command id |
| job | job id |
| duplicate | stored duplicate id |
| canonical | stored canonical id |
| link | new un-link row id (required by the existing deferred check) |
| reverses | reversed link id |
| environment | `synthetic_demo` |

No hashes, reason, note, free text or role name. The existing exact-id audit guard verifies the same transaction through `xmin`. Failed command work rolls back audit and command/domain rows together. Audit-chain verification detects changes relative to a trusted head, not privileged rewriting or the truth of the underlying work.

## Closed refusals

All refuse with nothing written. `ExtraPersistenceError.message` equals its `code`; the merged context error remains unchanged. Raw PostgreSQL details never leave either new method.

| Code | Meaning |
|---|---|
| INVALID_COMMAND | schema mismatch, before database work |
| INVALID_TENANT_CONTEXT | context not minted by the merged constructor; thrown unchanged by `withTenant` |
| UNLINK_FORBIDDEN | database authority not true: other roles, no covering grant, revoked membership/grant, mixed non-covering grants, foreign or made-up actor, missing/foreign/non-work-order job; also zero inserted rows |
| NOT_FOUND | command inner guards at steps 3–4 and missing/foreign job in the read |
| COMMAND_CONFLICT | reused command id with a different request or command type |
| NOT_LINKED | unknown/foreign/wrong-job link id or id of an un-link row |
| ALREADY_UNLINKED | previously reversed link; unique violation 23505 |
| STALE_REVISION | wrong link revision; serialization/deadlock codes 40001 and 40P01 |
| EXTRA_EXPORTED | exported event on either endpoint |
| DATABASE_UNAVAILABLE | other database or seam failure |

One new private mapper serves both new methods. Existing `ExtraPersistenceError` and `InvalidTenantContextError` pass through unchanged; any exact known merged/new code in a database message passes through as that code. Unique violation becomes `ALREADY_UNLINKED`; serialization/deadlock becomes `STALE_REVISION`; other errors become `DATABASE_UNAVAILABLE`. The merged `failure` helper keeps its text. Three codes are appended after the ten merged codes, whose order is unchanged.

## Two stated limits

1. A caller that skips the repository method and inserts an un-link row with raw runtime SQL is not role-checked by the table. Migration 0122's guard remains unchanged. A database guard combining role and command type is LATER, owned by a later database order (Q4).
2. The check and write are one statement under the shared tenant lock. A grant/membership revocation either commits before that lock (the command is refused) or waits until the command commits. An un-link committing an instant before revocation therefore stands, recorded with its actor and server time.

RLS protects rows within a correctly authenticated/stamped tenant context; it cannot protect a compromised privileged connection or false context selected by a compromised authentication bridge.

## Not built

- Coordinator's pure-role patch and merged test row: already committed; builder never edits them.
- Screen/page/wording/component: HELD by founder's UI pause. Route/controller/OpenAPI and binding actor to signed-in person: HELD, ENT-3.
- Whether owners/admins see duplicate extras: HELD for founder's screen order.
- Former duplicate state and extra events; who marks a duplicate: HELD, ENT-5.
- Extra recording roles: other leaves ENT-3a and ENT-4a-ALIGN.
- Raw-row authority trigger and a dedicated un-link permission: LATER, later database/permission order; Q4 default is no migration.
- Export repair, `ReconcileExportedDuplicate` and its roles: HELD, ENT-7.
- Fee rules, `senior`, prompt confirmation, pricing basis and money: outside this leaf; respective commercial/prompt owners.
- No new migration, database object, dependency, route, UI, provider or release. Other source files, indexes, shared helpers, security pins, tools, CI, AI, BUILD_PLAN and AGENTS stay untouched.

Builder tests use synthetic organisations and `.invalid` members, with no outbound call. D1–D18 require actual PostgreSQL execution by the Mac helper and CI on the final head; source compilation does not prove database behavior. RED requires fresh Opus and separate Sol verdicts bound to the exact committed head, separate acceptance and dispatcher catch-up on main before a PR. Existing production/data/fee gates remain pending.
