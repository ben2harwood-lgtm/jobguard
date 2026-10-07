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

### 0095 — CH-3a job parties

Renumbered from reserved 0051 under the 7 October merge-ahead ledger amendment
(BUILD_PLAN §12.2). SQL is unchanged; the runner applies it last, after merged
0053. There are still 45 registered migrations (0000–0042, 0053, 0095).

Expand-only customer/site identities and revisions, append-only party bindings,
a unique current pointer, tenant/job-qualified activation/import references, and
nullable document snapshot columns. Existing quote/invoice snapshots, bytes and
hashes are untouched. New quote PDFs and synthetic invoices include the exact
party revisions. Customer/site/binding mutations are denied to runtime; only the
narrow binding routine can advance the current pointer and job revision.

Each of the one-to-four address-line strings rejects CR/LF in the versioned
schema before trimming (`INVALID_PARTIES`) and in the named database constraint
`site_revision_address_lines_no_cr_lf`. This preserves the editor's one-row-per-line
round trip and unchanged-save identity. The unapplied 0095 migration is amended
in place; no existing party history is rewritten. After rollout, forward-fix a
constraint under review rather than dropping immutable revisions or bindings.

Encoding: site revision writes and synthetic party backfill need a UTF8 database.
0095 can be installed on an empty SQL_ASCII database: the text validator uses
ASCII dollar-quoted regex escapes, interpreted at execution rather than Unicode
SQL literals converted at CREATE FUNCTION time. In UTF8 these preserve the
JavaScript trim set and UTF-16 length rule. Site match keys apply NFKC `normalize()`,
which PostgreSQL only allows when the server encoding is UTF8 (otherwise every
site revision insert fails with "Unicode normalization can only be performed if
server encoding is UTF8"). Neon and the standard PostgreSQL images are UTF8; the
embedded test clusters that write site revisions pass `--encoding=UTF8` to `initdb`
because `embedded-postgres` starts `initdb` with no locale environment, which would
otherwise create SQL_ASCII. The party suite also installs the complete migration
chain in an explicitly SQL_ASCII database; the six earlier non-UTF8 suites retain
their original encoding flags.

The runner sets the backfill mode inside 0095's transaction. Only an explicit
`JOBGUARD_ENV=synthetic_demo` uses the generated recipe (Practice Customer,
14 Fictional Street, London, SW1A 1AA), preserving the latest issued quote's
customer name when present. All other modes create details-needed Decisions and
invent no parties. Backfill iterates control-plane tenant IDs and sets tenant
context before reading each tenant's jobs, including under the Neon migration
role and FORCE RLS. The migration registry makes reruns idempotent.

The existing 13-argument adoption routine now refuses missing parties. The
18-argument routine accepts verified customer/site revision references and binds
before entering live. It is a controlled write: inside the routine it requires a
current owner membership for the actor, a `processing` `job.adopt_in_flight`
command receipt for that actor, and an unexpired, unrevoked, approved
authorization bound to the same job, actor, content hash, amount, policy version
and zero aggregate revision (`FORBIDDEN` / `AUTHORIZATION_INVALID`, SQLSTATE
42501). The command dispatcher supplies the command and authorization ids and
appends the audit events in the same transaction, so a refusal leaves no receipt,
decision, job or audit row.

The receipt must be the adoption's own (`semantic_key = import:<job>`). A
deferred constraint trigger on `app.imported_job_baseline` makes the record
mandatory at commit: a succeeded adoption receipt for that job and actor, a
`command.succeeded` audit event naming that receipt and an authorization bound to
the same job, actor, baseline hash, amount and terms, and the adoption's own
`job.imported_baseline_attested` event. A direct call that does not complete the
receipt and append both events cannot commit (`ADOPTION_RECORD_REQUIRED`,
SQLSTATE 23514).

Binding changes: `bind_job_parties` stores the exact `job.parties` receipt on the
binding (`command_id`, unique per tenant, so one receipt authorizes one binding
effect). A deferred constraint trigger requires, at commit, a succeeded receipt
that is that command and names the binding in its result, and an audit event for
the job naming that command and binding (`job.parties.bind`, or
`job.parties.correct` when a correction reason was given); otherwise the
transaction fails (`BINDING_RECORD_REQUIRED`, SQLSTATE 23514). Generated backfill
and adoption bindings carry no command and are covered by their own rules.

Post-live correction: for a `live`, `invoiced` or `paid` job `bind_job_parties`
refuses unless the correction flag `IS TRUE` and the reason is non-blank
(`CORRECTION_REASON_REQUIRED`, SQLSTATE 22023). The test is null-safe: a null flag
with a reason cannot skip the refusal and be stored as a plain binding with no reason.

Quote send: `IssueQuoteMutation` takes the job lock (`require_current_job_parties`,
`FOR SHARE`, which `bind_job_parties`' `FOR UPDATE` waits on) and compares the
binding the document froze with the current binding before creating any send
effect; a mismatch raises `QUOTE_CHANGED` and the whole transaction rolls back. Update the application before using adoption. The previous
synthetic demo's fixture bootstrap remains supported; fresh bootstrap explicitly
seeds generated parties before marking its example job live.

Forward fix only after any new binding/document is recorded: retain immutable
revisions and issued artifacts; append a corrective binding with a reason.
Do not drop these tables/columns or rewrite historical documents as rollback.
Database execution, fresh/upgrade, runtime catalog, Neon bootstrap and restore
checks remain mandatory in CI; local collection/type checks are not DB evidence.

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
