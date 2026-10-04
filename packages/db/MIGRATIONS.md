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

### 0050 — CH-2 live-only watchdog inputs

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

Stored command results: 0050 also adds `app.watchdog_command_result`, keyed by
`(tenant_id, command_id)` with the job, the command kind, a request hash covering the job
id, the kind and the input, and the exact result the command first returned. The kinds are
`readiness.record`, `readiness.advance`, `things_to_check.evaluate|review|supersede`,
`supplier_match.create|correct`, `inbox.dismiss`, `purchase_order.revise|place`,
`supplier_document.intake|receipt|confirm` and `evidence.finalize`. Together with the
command receipts used by `inbox.seed` and `proof.complete`, and the upload id that is
`beginUpload`'s identity, every `watchdog_live_only` command now follows one contract:
a replayed id returns the first result (never the job's current state), and the same id with
a changed payload, on another job or as another kind is refused (`IDEMPOTENCY_CONFLICT` or
`COMMAND_CONFLICT`). A successful no-op keeps its identity.

How: behind the live guard and a per-job advisory lock (`runStoredCommand`), the stored row is
replayed or refused; otherwise a row written before results existed is replayed from its own
table; otherwise the command runs and its result is stored in the same transaction, whether or
not it changed anything. A concurrent reuse of an id on another job loses on the primary key and
reports `IDEMPOTENCY_CONFLICT`. Purchase-order revisions, document intake and goods receipts had no
command id in their boundary: each now accepts an optional `commandId` (compatible; omit it and a
stable id is derived from the request, so an exact retry replays). `evidence.finalize` stores only
the evidence id and replays the immutable evidence object itself; an object already registered for
the upload must match the requested version and type. A placement answered by the first command's
result (the dispatcher's semantic de-duplication) records the second id too.

Rows written before the table existed replay from their own tables, on their own job only, and
return what they first returned where it can be derived: a match correction as of its revision, an
inbox dismissal and the things-to-check findings, outcomes and supersessions as of their place in
the audit chain (fact candidates by creation time, which carry no audit link). Only new commands get a
stored result. The table is tenant-keyed, `FORCE`-RLS, owned by `jobguard_migration`, guarded by the same
live-job insert trigger, and runtime SELECT/INSERT only. It adds no data to existing rows.

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

Pre-deploy check: run this read-only query before applying 0050 to any database
that holds real rows, so the deploy does not stop on a legacy mislink. Run it as
a role that bypasses row-level security (a superuser or BYPASSRLS owner): FORCE
RLS hides every row from an ordinary role that has no tenant. Every `violations`
value must be 0; a non-zero row names the constraint that 0050 would refuse. The
owner-role test suite runs this exact text against a database with a known
mislink (it reports one) and again after the forward-fix (it reports none).

```sql
-- 0050 pre-deploy check (read-only): rows the new job-qualified foreign keys would refuse.
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

Expand-compatible upgrade from 0041; no backfill. The CH-2 PostgreSQL suite
constructs previous-schema uploads, applies 0050, verifies preservation and
idempotent migration, all non-live failures, actual runtime grants and race
orders. A second suite (`watchdog-migration-owner.integration.test.ts`) applies
0050 as `jobguard_migration` to a previous-schema database holding a legacy
cross-job link in another tenant: the link is found, nothing is half-applied,
FORCE RLS is intact, and after a forward-fix the same migration applies with
every constraint validated. Existing fresh-schema PostgreSQL suites apply 0050
too, including the owner-role synthetic bootstrap.

Forward-fix: retain the guards and repair affected fixtures/commands through
normal lifecycle commands; never directly set status or disable a guard to
resume watchdog writes. If a deployment rollback is required, keep 0050 and
roll back application code (the preceding application can still read all data).
Removing the migration would reopen prohibited writes and requires a separate
reviewed change. No new operational alerts or provider routes.
