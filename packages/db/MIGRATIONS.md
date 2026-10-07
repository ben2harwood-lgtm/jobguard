# Database migration strategy

`0020_job_import.sql` adds the synthetic-only, command-created in-flight-job baseline. Imported provenance can never carry accepted/baseline quote pointers; the immutable builder attestation fixes the candidate cap and exposes its weaker lineage. The routine creates no retrospective obligation, fee, journal, invoice, or collection. Production entry remains disabled pending D06/D11 approval. Forward fixes preserve the attestation and cap history.

`0019_commercial_integrity.sql` adds immutable synthetic-only value and activity facts used by the advisory D11 evaluator, and backfills accepted/quoted freezes for synthetic activations. Both tables have forced RLS and runtime `SELECT`/`INSERT` only. The evaluator is read-only and returns an in-memory review queue; no money, ledger, authorization, cap, suspension, or penalty write path is present. D11 remains proposed and D01's candidate cap remains unchanged. Forward fixes preserve these observations.

`0018_recovery_outcomes.sql` adds synthetic-only recovery cases, settled receipt facts, exact approvals, append-only landing allocations, cumulative job-level fee derivations, controlled journals, reversals, and review records. Runtime cannot write these tables directly: the security-definer routines lock the job, case, and receipt and enforce proof, mode, policy, availability, approval freshness, shared cap, and shared credit. Production and pilot posting remain disabled pending D01–D03/M4. Forward fixes preserve all derivations and compensations.

`0017_customer_billing.sql` adds tenant-numbered immutable synthetic customer invoices, embedded runtime PDF bytes/evidence manifests, append-only credit notes, manual builder-attested receipts and reversals. Customer receipts are structurally marked as neither recovery proof nor platform-fee settlement. Forward-fix only: issued commercial history must never be rolled back destructively.
`0000_tenancy.sql` is the M0-4 fresh-install baseline. It is intentionally
idempotent so an existing M0-1 database (which had no application tables) can be
upgraded safely. Tests execute it both fresh and a second time.

The migration creates roles but does not create production login credentials.
Deployment must grant the non-login `jobguard_runtime` role to a separately
managed application login. The migration owner remains separate from runtime.

This foundation migration is forward-fixed rather than rolled back: dropping
RLS, tenant columns, schemas, or roles could expose or destroy tenant data. A
failed transaction leaves the previous state intact; corrections ship as a new,
reviewed migration.

RLS is a defence within a correctly verified tenant context. It does not protect
against a compromised owner/migration connection or an application bridge that
is allowed to manufacture a false verified context.

`0002_evidence.sql` is the forward-only M0-11 evidence-storage migration. It adds
RLS-protected upload, immutable object-registration, and authorized-link tables.
An interrupted migration rolls back transactionally; corrections are forward fixes
because removing evidence identity or object-version references would weaken proof.
Object bytes remain private and versioned outside PostgreSQL. Object Lock/WORM is
intentionally not enabled pending the retention/deletion decision.

`0004_ledger.sql` is the forward-only M0-10 ledger migration. Posted journals
and lines are immutable; corrections are linked reversing journals. Deferred
triggers validate whole-journal balance and matching audit provenance at commit.
Production chart mappings and recovery-fee posting remain disabled pending D02,
the fee decisions, and the qualifying-landing implementation. Corrections are
forward fixes, never destructive rollback.

`0005_commands.sql` is the forward-only M0-8 command/authorization migration.
It adds tenant-protected immutable decisions and resolutions, exact revocable
authorizations, and durable semantic command receipts. It also adds membership
expiry/revocation timestamps. An interrupted application rolls back as one
transaction; corrections are forward fixes because removing receipts or grants
would destroy authorization evidence. Standing and unattended authorization is
deliberately excluded from the database until its later policy gate is approved.

## 0006_outbox.sql

Adds tenant-protected outbox, immutable attempt history, and provider-event inbox tables. A trigger writes only tenant/action routing identifiers to an infrastructure projection in the same transaction; the Graphile connection can read that projection but has no `app` schema access. Forward-fix rollback: stop dispatchers, preserve action/attempt/event records for audit, and deploy a corrective migration; do not drop delivery history after use.

## 0007_capture.sql
Adds immutable, tenant-owned capture sources and cited job-record proposals. The forward fix is a later numbered migration; captured source/proposal records must never be rolled back by mutation. Runtime receives only `SELECT`/`INSERT`, and both new tables use enabled and forced RLS with `WITH CHECK` policies. Proposal lines reserve existing job-spine scope identities but do not create canonical revisions.

## 0008_review.sql
Adds the tenant-owned optimistic review aggregate, editable review lines, explicit split/merge parents, and question dispositions. It deliberately permits an unknown canonical unit price so M1-4 can price it; quote issue must fail rather than treating null as zero. Confirmation remains fixture-only and uses the command transaction. Rollback is forward-fix only: preserve review, lineage, receipt, and audit history, disable confirmation, and deploy a later corrective migration.

## 0009_quote_pricing.sql
Adds immutable quote-edit revisions and lines, a mutable draft pointer, and idempotent tenant-scoped rate observations. Corrections use a later forward-fix migration; commercial revision and observation facts are never edited or deleted.

## 0010_quote_documents.sql
Adds immutable, tenant-isolated quote document versions, exact authorized send records, and separate append-only delivery/customer-acceptance facts. Corrections are forward fixes: published commercial artifacts are never rewritten or destructively rolled back.

### 0011_quote_acceptance.sql

Adds immutable, tenant-protected builder-attested quote acceptances and append-only disposition events. It creates the accepted quote-version projection from the exact immutable document in the controlled acceptance routine. Forward-fix only: acceptance/audit history must not be rolled back or deleted; disable command entry and ship a corrective migration if remediation is needed.

### 0012_job_activation.sql

Adds immutable, tenant-protected activation, cap snapshot, illustrative synthetic obligation, and simulated-settlement facts. The controlled switch routine freezes the exact accepted quote/net/cap atomically with the live transition. Pilot mode cannot create an obligation; demo settlement is a separate simulated fact and never a production journal or collection. Corrections are forward fixes because activation and authorization history must remain intact.

- `0013_decision_inbox.sql`: immutable deterministic findings, advisory-only suppressions, and tenant-safe Decision Inbox links. Forward-fix only; finding history is append-only.

## 0014_variations.sql
Adds tenant-protected variation proposals, immutable priced revisions, exact-revision approval/rejection facts, and append-only rate observations. AI rates remain optional labelled proposal metadata; only confirmed revision rows are priced. Rollback is forward-fix only so approval and provenance history is never removed. Production sends, charging, live AI, and transcription remain disabled.

## 0015_proof_stage_gates.sql
Adds immutable stage completions plus append-only evidence invalidation and rework events. Completion references the exact finalized evidence link; revocation never rewrites that history. Rollback is forward-fix only. Object bytes remain in the synthetic versioned store and audit payloads contain identifiers and hashes only.
## 0016_final_accounts.sql

Adds tenant-protected draft heads and immutable final-account revisions, traced lines, and exact-version proof manifests. Forward-fix only: revisions are commercial history and must not be rolled back destructively.

## 0022_browser_local_dictation.sql

Adds immutable acquisition metadata for reviewed browser-local transcripts and a database-enforced zero audio-byte count. Existing forced RLS and SELECT/INSERT-only runtime grants remain unchanged. Roll back only with a forward fix that preserves transcript provenance; browser speech never has a remote fallback.

## 0023_recovery_demo_ui.sql
Adds the synthetic-only UIWIRE-13 scenario selection and its narrow configuration routine. The table is forced-RLS and append-only; runtime receives SELECT plus specific routine execution only. Roll forward to correct it because recovery/audit history is immutable.

## 0024_uiwire7_synthetic_evidence_bytes.sql
Adds an append-only, forced-RLS store for the generated sandbox image originals. It is not a general upload surface; corrections are forward fixes and registered object versions remain immutable.

## 0031_material_rates.sql
Adds append-only tenant merchants, SKUs/aliases, explicit pack conversions, job/scope-qualified material requirements and validity-dated agreed-rate revisions. All tables are forced-RLS and runtime SELECT/INSERT only. Corrections append a new revision; forward-fix rather than destructive rollback.
`0034_recovery_cases.sql` adds append-only, tenant/job-bound recovery cases, immutable claim revisions and transition events. Roll forward with a compensating event/claim revision; these histories are intentionally not rolled back destructively.

`0035_recovery_eligibility.sql` adds append-only, forced-RLS reference-D03 eligibility reviews bound to exact case, evidence and policy revisions. Supersession appends a revision; remediation is a forward fix and never rewrites an approval.
`0036_supplier_fact_confirmation.sql` adds append-only, tenant-isolated parser proposals and separately immutable human-confirmed revisions. Forward-fix only: preserve both histories and add a superseding revision rather than rolling data back.

`0037_supplier_matching.sql` adds immutable deterministic three-way match proposals, human-confirmed revisions and exact receipt allocations. Forward-fix only: corrections append a new revision; old source bindings and audit sequence remain preserved.
## 0039 readiness

Adds immutable planned-work revisions, pure-engine snapshots, and due-review Decisions bound to exact source/adapter hashes. All are append-only tenant tables. Roll forward to correct records; historical readiness evidence is retained.

## 0041_evidence_packs.sql

Introduces append-only evidence pack identities and revisions with tenant/job-qualified case links, FORCE RLS, migration ownership and runtime SELECT/INSERT. Retrospective verdict `docs/verdicts/M4-3-S/fd56bdd.md` found that application source mapping and download labels were incorrect; this migration alone was not evidence of a working pack. Preserve history and apply 0042 as a forward fix.

## 0042_evidence_pack_repair.sql

Adds the honest TEXT format, stored text artifacts, canonical command hashes, source omissions and a case-qualified pack/revision foreign key. Adds immutable attachment approval commands with FORCE RLS, `jobguard_migration` ownership and runtime SELECT/INSERT only. No SECURITY DEFINER function is introduced. Approval validity is derived from its exact approved hashes against current immutable sources; source changes invalidate authority without UPDATE/DELETE. The old unused boolean remains solely for expand compatibility and is never authorization.

Existing 0041 rows keep their historical labels and lack a verified artifact/request hash. Repaired readers expose them as legacy/unverified, refuse downloads and approvals, and require rebuilding from source records. There is no invented backfill of original bytes or approval. Previous applications can still insert their old labels during rollout, but repaired readers hold those rows as well. Forward-fix only: disable attachment commands if necessary and preserve pack, command and audit history; do not destructively reverse source or approval records. Fresh install and upgrade coverage is in the migration/catalog suite and evidence pack integration tests; executed results belong in the builder receipt.

0042 first updates the two 0041 tenant policies to use missing-safe, empty-safe tenant context, so the migration no longer fails with `unrecognized configuration parameter` under `jobguard_migration`. That alone would make the new case-qualified foreign key pass without looking at any row (the owner has no tenant context under FORCE RLS), so 0042 also lifts FORCE ROW LEVEL SECURITY on `evidence_pack` and `evidence_pack_revision` for the one `ADD CONSTRAINT … FOREIGN KEY` statement, inside the same transaction, and restores it immediately afterwards. Existing rows are therefore genuinely validated: a 0041 revision whose case differs from its pack's case makes 0042 fail with 23503 and roll back, and the data must be corrected first. Absent context still admits no rows; ownership, policies and runtime grants are unchanged and FORCE is never off outside the migration. No business rows are rewritten. Proof: `packages/db/test/evidence-pack-upgrade.integration.test.ts` (real 0041 database, applied as `jobguard_migration`).

## 0053 — SH-1 shared money and origin

Adds immutable `job_commercial_track` and `extra_origin` tables with FORCE RLS,
qualified foreign keys, narrow grants and trigger-only binding/provenance paths.
Adds required track/origin columns to variations; a deferred reverse FK requires
one exact origin at commit. Backfills the previous synthetic small-builder schema
idempotently while retaining source identities/history and explicitly unknown
raising metadata. Existing activation/import routines bind inside their current
transaction through bounded triggers. No fee posting or external effect is added.

Expand compatibility: existing capture inserts can omit the new columns on bound
small-builder jobs, obtaining labelled legacy provenance. Existing pricing/state
UPDATE grants are unchanged; origin/track UPDATE is denied. Fresh quote jobs bind
at switch-live; adoption imports bind with their imported baseline. New contractor
imports will bind through their own future authorized routine.

Forward fix is preferred: append a migration preserving established bindings and
origin rows. Do not drop these tables or rewrite origins after deployment. If the
upgrade fails, its SQL transaction rolls back, leaving the preceding schema intact.
Before rollout run fresh, previous-schema upgrade, twice-replayed backfill, runtime
privilege/RLS/forgery tests and the existing Neon non-superuser bootstrap suite.
SH-1 adds real PostgreSQL tests in `test/shared-money-origin.integration.test.ts`;
local socket restrictions leave execution and earlier DB/browser regressions to CI.

### 0054 — ENT-1 contractor organisation

Expand-only after the supported schema through 0053 (0042 evidence-pack repair and 0053 SH-1 merged from main); 0043–0052 remain reserved by the dispatcher. Adds 12 tenant tables with FORCE RLS, migration ownership, SELECT-only runtime grants, immutable versions/events and qualified FKs. New identity/control-plane exception: `contractor_practice_session` maps a high-entropy bearer handle to its generated tenant/principal and is readable only through a narrowly scoped function. All fixture and admin routines refuse databases other than `jobguard_synthetic_demo`; the application independently requires `JOBGUARD_ENV=synthetic_demo`.

Operations-only `assign_commercial_track` has no runtime/infrastructure EXECUTE grant. It requires a generated synthetic agreement reference, expected assignment revision and a same-transaction audit event enforced by a deferred trigger. It never rewrites jobs. Pending D12/D16 approvals mean real track assignment remains disabled. Contractor admin writes use one bounded function, a tenant advisory lock, current membership/grants, expected organisation revision and the existing command receipt/audit tables; no commercial Decision, outbox or money effect occurs. The audit append is the final lock. Team moves append membership events and replace affected team grants with explicit revocation/new grant facts. A member may still belong to other teams.

Forward fix is preferred: revert application usage first, retain append-only data, then apply a separately reviewed corrective migration. Do not drop populated commercial history or rewrite versions. The preceding demo is unchanged apart from its expected migration count and expanded catalog assertions. Fresh install and Neon owner-role compatibility remain covered by existing migration/bootstrap tests; ENT-1 additionally tests upgrade from the previous schema. No seed modifies existing tenants.

## 0094 — SBOX-SESSION-1 practice ownership

Reserved by the §12.2 ledger amendment under Ben's 5 October 2026 merge-ahead ruling. Adds a restricted `control_plane.practice_session` registry of token digests, expiry/revocation and synthetic environment; it is a reviewed identity/control-plane exception, contains no business content, and grants runtime neither schema usage nor table access. Narrow fixed-search-path routines issue/authenticate the synthetic principal against current owner membership. New generated home scenarios are owned at insertion, rather than assigning legacy fixture jobs to the first viewer.

Adds nullable immutable creator-session digest and scenario to `app.job`, with a session FK and complete-pair check. Capture persists both in its creation transaction and verifies ownership before idempotent replay. Sandbox creation also binds both before writing run/audit records. FORCE RLS and existing job/runtime grants remain; runtime cannot update ownership and the trigger rejects owner-role attempts to transfer or backfill it. No legacy attribution or first-touch backfill. Legacy/unbound jobs are intentionally inaccessible through practice applications; the underlying existing non-practice fixture tests remain valid.

Forward fix: preserve bindings and revoke affected sessions; repair a routine or guard in a later reviewed migration. Do not drop the ownership check, rewrite owners or roll back application code to UUID-shape authorization. A destructive schema rollback is unsuitable after owned practice jobs exist. New synthetic authentication sessions have a seven-day server expiry and session-cookie lifetime; this does not establish a production identity or retention policy. Database fresh/upgrade/catalog/privilege and adversarial regressions must run in CI; they were not executed in the restricted builder sandbox.

Round-2 repair (7 October): the same unmerged 0094 also binds new practice
merchant, SKU, alias, pack-conversion and rate rows to the authenticated session
digest. Restrictive policies combine with the existing tenant policy; FORCE RLS,
`jobguard_migration` ownership and runtime SELECT/INSERT-only grants are unchanged.
Invoker triggers prohibit ownership changes and mismatched parent/requirement
links. Existing unbound rows are not attributed or copied. Non-practice material
repositories keep their original tenant-wide catalogue and revision behavior.
Practice material transactions install the digest locally before business SQL;
purchase-order pricing and evidence-pack supplier agreements use the same scope.
The existing forward-fix/revocation strategy applies. CI must run the two-session
regression, preceding-schema upgrade and earlier real-tenant material tests.

### 0096 — CH-2 live-only watchdog inputs

Adds `app.require_watchdog_live(uuid)` (migration owned, fixed search path,
runtime-only EXECUTE) and BEFORE INSERT guards on watchdog input tables. The
helper checks the transaction tenant before taking a job SHARE lock; lifecycle
transitions take UPDATE locks, so writes cannot commit after exit from live.
Repositories call it before other business locks or audit appends. Trigger
rechecks take the same already-held job lock. No existing row, money record, status or historical evidence is changed.
Adds job-qualified order/proof foreign keys and narrows upload UPDATE to the
existing lifecycle columns; identity edits are denied. Upload finalisation also
has an UPDATE guard. Existing cleanup/rejection remains available. The shared
evidence tables retain the exact generated bank-evidence class written by the
existing migration-owned recovery routine; a runtime insert cannot forge this
exception. Reads remain available.

Command identity and stored results: 0096 also adds two append-only tables. `app.watchdog_command_identity`
is one tenant-wide namespace for every `watchdog_live_only` command, keyed by `(tenant_id, command_id)`, with
the job, the command kind and a request hash covering the job id, the kind and the input. The kinds are
`readiness.record|advance`, `things_to_check.evaluate|review|supersede`, `supplier_match.create|correct`,
`inbox.seed|dismiss`, `purchase_order.revise|place`, `supplier_document.intake|receipt|confirm`,
`evidence.begin_upload|finalize` and `proof.complete`. Whatever store holds a command's result (its
command receipt, its upload or evidence row, or `app.watchdog_command_result`), it claims its id in the
identity table first, in the transaction that completes it and before any audit lock. The same id can
never be reused for a changed payload, another job or another kind of command, and a claim racing in another
transaction waits on the primary key and then conflicts, so the 17 commands cannot split their identity
across stores. `app.watchdog_command_result` holds the exact first result (`result jsonb`) for commands that
have no receipt or row of their own, keyed to the identity.

Every `watchdog_live_only` command follows one contract: a replayed id returns the first result (never the
job's current state); a successful no-op keeps its identity; a changed payload, another job or another kind
is refused (`IDEMPOTENCY_CONFLICT` or `COMMAND_CONFLICT`). `runStoredCommand` applies it behind the live guard
and a per-job advisory lock: claim the identity, replay a stored result, else replay a row written before
results existed when it can be derived, else run and store the result in the same transaction.
Purchase-order revisions, document intake and goods receipts had no command id in their boundary: each now
accepts an optional `commandId` (compatible; omit it and a stable id is derived from the request, so an
exact retry replays). `evidence.finalize` claims its identity where it completes (registering the object, or
answering from the object already registered, a successful no-op that is recorded too), stores only the evidence id
and replays the immutable evidence object; an object already registered must match the requested version and type.
`evidence.begin_upload` binds the client's capture time to the identity (the server-generated expiry is not part
of the request), and reads every replayed field, including the first expiry, back from the stored upload row.

Rows written before these tables existed replay from their own tables, on their own job only, and
return what they first returned where it can be derived: a match correction as of its revision, an
inbox dismissal and the things-to-check findings, outcomes and supersessions as of their place in
the audit chain, and the fact candidates of an earlier evaluation by the audit event that confirmed each
fact (never by `created_at`, which is the start time of the writing transaction: a confirmation that began
earlier but committed later would look older than an evaluation it could not have been part of; audit
appends serialise on the tenant's audit head and hold it to commit, so audit order is commit order); a legacy
evaluation is validated against the original, immutable sources of its match revision, not today's. Only new
commands get a stored result.

An id the previous schema persisted is reserved for the command that persisted it. The identity table starts
empty, so every claim also consults the stores that held command ids before 0096 (`LEGACY_COMMAND_OWNERS` in
`packages/db/src/watchdog.ts`): an id found there can be claimed only by its own kind on its own job (its
replay); any other kind, or the same kind on another job, is refused with `IDEMPOTENCY_CONFLICT`, before the
original command has replayed, and the refused claim leaves nothing behind. The stores are the planned work
revision (`readiness.record`), readiness decision (`advance`), discrepancy finding, review outcome and bill
supersession (`evaluate`, `review`, `supersede`), supplier match revision (a creation's revision carries the audit event `supplier_match.confirmed`, a correction's `supplier_match.corrected`), supplier fact revision (`confirm`), the dismissed inbox events (`inbox.dismiss`), the `inbox.seed`
command receipt, the purchase order placement (`place`), the stage completion (`proof.complete`) and the evidence
upload, whose id is the begin-upload command id (`evidence.begin_upload`). Order revisions, document intake, goods
receipts and finalisation had no command id before 0096, so there is nothing to reserve for them. Random ids a command
writes for its own internal rows (a readiness snapshot's, an inbox "created" event's) are not command ids and are not
listed. An id persisted by two kinds, or for two jobs, in the previous schema belongs to nobody: every claim of it is
refused, so no winner is picked among commands that already had their effects. The consult runs inside the claiming
transaction, behind the live guard and the per-job lock; the stores are append-only, so what it reads cannot change under
it. The reverse holds at the database boundary for writers that never claim: during a mixed-version rollout, or after the
documented application rollback, the previous application still inserts into those stores. Each of them has a
`b_watchdog_command_id_before_insert` trigger (`app.reserve_watchdog_command_id`) that tries the same per-id transaction lock
the claim takes first, using `pg_try_advisory_xact_lock`. If held by another transaction, it immediately raises
`23505 IDEMPOTENCY_CONFLICT`; it never waits after a previous writer has appended audit. Once acquired, it refuses (`23505 IDEMPOTENCY_CONFLICT`) an id already claimed for another kind or another job, and
any row under a claimed id that does not come from the transaction that claimed it: a claimed command has its effects in its
claiming transaction, so a later row is a second effect of a completed command. Whether this transaction made the claim is read
from the database itself (the identity row's `claimed_xact`, the full 64-bit id of the claiming transaction, which never wraps,
equals this transaction's; a trigger stamps it on every claim, whatever the insert supplies), never from anything a session can
set; claims are made outside savepoints. A store that holds at most one row per command id may still see a replay re-run its idempotent insert
(`ON CONFLICT DO NOTHING/UPDATE`); when the command's row is already there that insert can add nothing, so it is admitted. A
claim can safely wait for a previous-schema write, then recheck its committed ownership. A previous-schema write
racing a claim conflicts immediately; it must roll back before retrying. This avoids the audit-first versus claim-first
lock cycle while retaining database enforcement (Ben: "keep triggers", Command Center, 7 October 2026).
Any previous-schema write that meets another open writer of the same id, including another previous-schema retry such as a concurrent begin-upload retry, conflicts immediately instead of waiting, fails safe, and must be retried after that writer ends.

**Isolation assumption:** supported previous and current application transactions use PostgreSQL READ COMMITTED
(plain `BEGIN` in `withTenant`). The trigger ownership lookup needs a fresh statement snapshot after acquiring the
id lock. Hand-written REPEATABLE READ or SERIALIZABLE transactions are outside this guarantee: a stale snapshot
can miss a claim committed by another transaction. Do not use those isolation levels for watchdog writes.

A supplier match revision is a creation's or a correction's only by its audit event, which may be
appended later in the same transaction, so a deferred constraint trigger (`app.reserve_supplier_match_kind`) also requires, at
commit, the claim's kind to be exactly the one that event names; a revision citing any event other than `supplier_match.confirmed`
or `supplier_match.corrected` about its own proposal is refused outright, and the claim-time lookup treats such a previous-schema
row as owned by no claimable kind. 0096 also refuses to apply (`23514`) while any existing revision fails that rule; it scans with
FORCE suspended on the two tables for its own transaction, as for the foreign keys, and each event may stand behind only one
revision (`supplier_match_revision_audit_event_uq`), so a revision cannot borrow an earlier event of its own proposal. A
correction's event must also carry the revision's own payload hash; a creation's event hashes the creation request instead,
so it is bound by its subject and that uniqueness. The
read-only pre-deploy query lists both kinds of offender:

```sql
-- 0096 pre-deploy supplier-match revision check (read-only): revisions that do not cite their own proposal's confirmed or corrected
-- event, or that share their event with another revision.
SELECT r.tenant_id, r.id, r.command_id FROM app.supplier_match_revision r WHERE NOT EXISTS(SELECT 1 FROM app.audit_event ae
  WHERE (ae.tenant_id,ae.id)=(r.tenant_id,r.audit_event_id) AND ae.event_type IN('supplier_match.confirmed','supplier_match.corrected')
    AND ae.subject_type='supplier_match' AND ae.subject_ref=r.proposal_id::text
    AND (ae.event_type='supplier_match.confirmed' OR ae.payload->'hashes'->>'payloadHash'=rtrim(r.payload_hash)))
  OR EXISTS(SELECT 1 FROM app.supplier_match_revision o WHERE (o.tenant_id,o.audit_event_id)=(r.tenant_id,r.audit_event_id) AND o.id<>r.id);
```
 Pre-deploy check, run like the one below (a role that bypasses row-level security; the suite runs this exact text against
a database holding a known collision): it lists every such ambiguous id, which must be none.

```sql
-- 0096 pre-deploy collision check (read-only): command ids the previous schema persisted for more than one watchdog command kind or job.
WITH owners(tenant_id, command_id, kind, job_id) AS (
  SELECT tenant_id, command_id, 'readiness.record', job_id FROM app.planned_work_revision
  UNION ALL SELECT tenant_id, command_id, 'readiness.advance', job_id FROM app.readiness_decision
  UNION ALL SELECT tenant_id, command_id, 'things_to_check.evaluate', job_id FROM app.discrepancy_finding_revision
  UNION ALL SELECT tenant_id, command_id, 'things_to_check.review', job_id FROM app.discrepancy_review_outcome
  UNION ALL SELECT tenant_id, command_id, 'things_to_check.supersede', job_id FROM app.supplier_bill_supersession
  UNION ALL SELECT r.tenant_id, r.command_id, CASE ae.event_type WHEN 'supplier_match.confirmed' THEN 'supplier_match.create' WHEN 'supplier_match.corrected' THEN 'supplier_match.correct' ELSE 'supplier_match.unrecognised' END, r.job_id FROM app.supplier_match_revision r JOIN app.audit_event ae ON(ae.tenant_id,ae.id)=(r.tenant_id,r.audit_event_id)
  UNION ALL SELECT tenant_id, command_id, 'supplier_document.confirm', job_id FROM app.supplier_fact_revision
  UNION ALL SELECT tenant_id, command_id, 'inbox.dismiss', job_id FROM app.inbox_outcome_event WHERE event_kind='dismissed'
  UNION ALL SELECT tenant_id, command_id, 'inbox.seed', nullif(split_part(semantic_key,':',2),'')::uuid FROM app.command_receipt WHERE command_type='inbox.seed'
  UNION ALL SELECT tenant_id, command_id, 'purchase_order.place', job_id FROM app.purchase_order_placement
  UNION ALL SELECT tenant_id, command_id, 'proof.complete', job_id FROM app.stage_completion
  UNION ALL SELECT tenant_id, id, 'evidence.begin_upload', job_id FROM app.evidence_upload)
SELECT tenant_id, command_id, count(DISTINCT kind) AS kinds, count(DISTINCT job_id) AS jobs
  FROM owners GROUP BY tenant_id, command_id HAVING count(DISTINCT kind) > 1 OR count(DISTINCT job_id) > 1;
```

The proof application's first answer to each of its three live-only commands (select a generated file, finalise
it, complete the stage) is recorded in `app.proof_application_response`: the answer is a projection of the job that
changes as the job moves on, so it is stored once with the request it answered, bound by composite foreign key to the
command's claimed identity (`(tenant, command id, job, kind)`, which is why the identity table also carries
`UNIQUE(tenant_id,command_id,job_id,command_type)`), and a replay returns it as recorded, after re-checking the
actor's membership (active and unexpired). It is append-only (runtime SELECT/INSERT), tenant-keyed, `FORCE`-RLS and owned
by `jobguard_migration`. It is the replay record of a command that already succeeded, not a watchdog input, so it has no
live-job insert guard: a job that has just left live must still be able to give the first answer back. When the
application asks the server to derive the Decision for stage completion (`deriveDecision`), the Decision it finds is
recorded in the command's first result, so a Decision opened later cannot change a replay. Both tables are tenant-keyed, `FORCE`-RLS, owned by `jobguard_migration`, runtime
SELECT/INSERT only, and the identity table is guarded by the same live-job insert trigger. They add no data
to existing rows.

The new foreign keys are validated by the migration owner (`jobguard_migration`:
not a superuser, no BYPASSRLS, no tenant context), exactly as deployments and the
e2e bootstrap apply it. Their tables FORCE row-level security, so that scan would
otherwise evaluate the tenant policies without a tenant: a strict policy raises
"unrecognized configuration parameter app.tenant_id" and a lenient one hides
every row, letting a legacy cross-job link pass unseen. The migration therefore
suspends FORCE on exactly the nine tables involved (`job`, `scope_identity`,
`material_requirement`, `purchase_order_draft`, `evidence_upload`,
`evidence_object`, `evidence_link`, `stage_completion`,
`synthetic_evidence_original`), validates across all tenants, restores FORCE and
asserts it was restored, all inside the migration transaction. The ALTER TABLE
locks are ACCESS EXCLUSIVE and held to commit, so no runtime session can read
these tables while FORCE is suspended; the runtime role is never exempt. The
cost is a brief exclusive lock on those tables, so apply it in a quiet window.
A legacy mislink makes the whole migration fail and roll back (SQLSTATE 23503);
repair the named row with a forward-fix update, never by weakening a constraint.

Pre-deploy check: run this read-only query before applying 0096 to any database
that holds real rows, so the deploy does not stop on a legacy mislink. Run it as
a role that bypasses row-level security (a superuser or BYPASSRLS owner): FORCE
RLS hides every row from an ordinary role that has no tenant. Every `violations`
value must be 0; a non-zero row names the constraint that 0096 would refuse. The
owner-role test suite runs this exact text against a database with a known
mislink (it reports one) and again after the forward-fix (it reports none).

```sql
-- 0096 pre-deploy check (read-only): rows the new job-qualified foreign keys would refuse.
SELECT 'purchase_order_requirement_job_fk' AS constraint_name, count(*) AS violations FROM app.purchase_order_draft c
  WHERE NOT EXISTS (SELECT 1 FROM app.material_requirement p WHERE (p.tenant_id,p.job_id,p.id)=(c.tenant_id,c.job_id,c.requirement_id))
UNION ALL SELECT 'evidence_upload_job_fk', count(*) FROM app.evidence_upload c
  WHERE NOT EXISTS (SELECT 1 FROM app.job p WHERE (p.tenant_id,p.id)=(c.tenant_id,c.job_id))
UNION ALL SELECT 'evidence_upload_scope_job_fk', count(*) FROM app.evidence_upload c
  WHERE c.scope_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app.scope_identity p WHERE (p.tenant_id,p.job_id,p.id)=(c.tenant_id,c.job_id,c.scope_item_id))
UNION ALL SELECT 'evidence_object_job_fk', count(*) FROM app.evidence_object c
  WHERE NOT EXISTS (SELECT 1 FROM app.job p WHERE (p.tenant_id,p.id)=(c.tenant_id,c.job_id))
UNION ALL SELECT 'evidence_object_scope_job_fk', count(*) FROM app.evidence_object c
  WHERE c.scope_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app.scope_identity p WHERE (p.tenant_id,p.job_id,p.id)=(c.tenant_id,c.job_id,c.scope_item_id))
UNION ALL SELECT 'evidence_object_upload_job_fk', count(*) FROM app.evidence_object c
  WHERE c.upload_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app.evidence_upload p WHERE (p.tenant_id,p.job_id,p.id)=(c.tenant_id,c.job_id,c.upload_id))
UNION ALL SELECT 'evidence_object_original_job_fk', count(*) FROM app.evidence_object c
  WHERE c.original_evidence_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app.evidence_object p WHERE (p.tenant_id,p.job_id,p.id)=(c.tenant_id,c.job_id,c.original_evidence_id))
UNION ALL SELECT 'evidence_link_evidence_job_fk', count(*) FROM app.evidence_link c
  WHERE NOT EXISTS (SELECT 1 FROM app.evidence_object p WHERE (p.tenant_id,p.job_id,p.id)=(c.tenant_id,c.job_id,c.evidence_id))
UNION ALL SELECT 'stage_completion_evidence_job_fk', count(*) FROM app.stage_completion c
  WHERE NOT EXISTS (SELECT 1 FROM app.evidence_link p WHERE (p.tenant_id,p.job_id,p.scope_item_id,p.id)=(c.tenant_id,c.job_id,c.scope_item_id,c.evidence_link_id))
UNION ALL SELECT 'synthetic_original_upload_job_fk', count(*) FROM app.synthetic_evidence_original c
  WHERE NOT EXISTS (SELECT 1 FROM app.evidence_upload p WHERE (p.tenant_id,p.job_id,p.id)=(c.tenant_id,c.job_id,c.upload_id));
```

The runtime role's UPDATE on `evidence_upload` is limited to `id` and the lifecycle
columns (`state`, `rejection_code`, `object_version_id`, `server_verified_at`).
`id` stays granted only because `EvidenceService.beginUpload` retries with
`ON CONFLICT (tenant_id,id) DO UPDATE SET id=EXCLUDED.id` (a no-op that returns the
existing row); the BEFORE UPDATE guard refuses any real change of `id` or of the
job, scope, key, hash, type or size columns, and the suite proves it. Removing the
grant would first need that upsert rewritten, which is outside CH-2.

Expand-compatible upgrade from the immediately preceding registered schema (through 0053); no backfill.
0096 is registered last, after 0053. The file count remains 45. Unmerged synthetic CH-2 installs previously
labelled 0050 must be rebuilt from synthetic fixtures; renaming is not a deployed-database upgrade or a second
application of the same DDL. No production schema-migration receipt should be relabelled by this repair.

**Known pre-0096 proof replay limit:** a completion receipt issued by the preceding proof application hashes
`decisionId: current.decisionId`; the current application sends `deriveDecision: true`, included in its request hash.
Replaying that old completion through the current proof application therefore returns HTTP 409 (`IDEMPOTENCY_CONFLICT`)
instead of its original answer. It fails closed and creates no second completion. Direct repository replay with the
original request/hash remains supported; there is no authenticated replay-by-original-hash application path in
this repair. Preserve the original receipt and reconcile the already-recorded completion; do not retry with a new
command id to recreate its effect. This limit concerns receipts historically described as pre-0050 before renumbering. The CH-2 PostgreSQL suite
constructs previous-schema uploads, applies 0096, verifies preservation and
idempotent migration, all non-live failures, actual runtime grants and race
orders. A second suite (`watchdog-migration-owner.integration.test.ts`) applies
0096 as `jobguard_migration` to a previous-schema database holding a legacy
cross-job link in another tenant: the link is found, nothing is half-applied,
FORCE RLS is intact, and after a forward-fix the same migration applies with
every constraint validated. Existing fresh-schema PostgreSQL suites apply 0096
too, including the owner-role synthetic bootstrap.

Forward-fix: retain the guards and repair affected fixtures/commands through
normal lifecycle commands; never directly set status or disable a guard to
resume watchdog writes. If a deployment rollback is required, keep 0096 and
roll back application code (the preceding application can still read all data).
Removing the migration would reopen prohibited writes and requires a separate
reviewed change. No new operational alerts or provider routes.
