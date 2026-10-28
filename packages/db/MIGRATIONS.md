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
otherwise create SQL_ASCII. Practice-session issuance now writes a generated site
revision, so the practice-session suite (`practice-session.integration.test.ts`) passes
`--encoding=UTF8` too. The CH-2 watchdog suites also write site revisions through
the shared fictional-site fixture, so the watchdog command harness
(`watchdog-command-harness.ts`, used by the command-replay, proof and lock-order
suites) and the `watchdog`, `watchdog-migration-owner`, `things-replay` and
`match-inbox-replay` integration suites pass `--encoding=UTF8` too. The party suite also installs the complete migration
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
Round 12 amends only the two reason checks in unapplied 0095: the routine explicitly
rejects null, and both routine and binding constraint use
`valid_party_revision_text(to_jsonb(reason),1,500)` for the versioned schema's
JavaScript trim set and UTF-16 length. Tab, LF, CR, NBSP and BOM alone are refused.
The existing ASCII-only regex patterns and SQL_ASCII installation path are unchanged.
Fresh/upgrade and runtime-role rollback cases remain CI requirements. If already
applied outside this unmerged task, use a reviewed forward-fix migration; do not
rewrite recorded party history or weaken the constraint.

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


### 0095 round 13 — practice-session compatibility

0094 remains byte-identical, including its issuer. The unapplied 0095 adds an
invoker-only BEFORE INSERT trigger ordered before the existing live party guard.
Only the trusted migration-role creation path, with the fixed synthetic tenant,
home/live recipe and a valid persisted session, supplies generated customer,
payer and site parties before the live job insert. The existing deferred job FK
allows that ordering. Client row fields/GUCs cannot forge the invoking role;
runtime cannot assume it. The original live guard and SH-1's live INSERT track
hook still execute. Quoting/capture jobs remain unbound until user details exist.
Earlier explicit test fixture bindings are retained. No guard exemption, new
caller argument, session-ownership transfer, privileged helper EXECUTE grant or
merged routine/migration change. Round 10's ASCII-only validator patterns and
round 12 reason checks are unchanged.

Run the entire practice-session, sandbox and job-parties integration suites,
plus fresh/upgrade/catalog/restore and both browser projects in CI. The builder
sandbox cannot start PostgreSQL or bind localhost. Use a reviewed forward-fix
migration if 0095 has been applied elsewhere; never edit merged 0000–0094 or
rewrite existing bindings, ownership, issued documents or audit history.

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
0096 is registered after 0095 and before 0097; `packages/db/src/migrate.ts` is the authority for order and count, and the suites compare against `MIGRATION_URLS.length`. Unmerged synthetic CH-2 installs previously
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

## 0097_recovery_case_current.sql — M4-1-S retrospective repair

Expand-compatible: keeps immutable `recovery_case` creation columns for existing
writers and foreign keys, and documents them as legacy snapshots. The
`security_invoker` view `recovery_case_current` is the single current-state read
contract: latest immutable claim + latest event + claim/event revision count.
Only cases with no workbench history fall back to the 0018 legacy row; incomplete
workbench history is excluded. No data backfill or historical rewrite is needed.
Runtime gets SELECT on the view and retains forced RLS on its source tables.

Replaces the existing narrowly granted `approve_synthetic_landing(jsonb)` body to
read that projection after taking locks in this order: case advisory key, job row,
case row. The workbench command (runtime role, no UPDATE privilege on `app.job`, so
it cannot take a job-row lock) holds only the case advisory key, before its
foreign-key share locks and audit append; because the landing routine also takes the
advisory key first, the two paths cannot wait on each other. Existing
function ownership, search path and EXECUTE grants are retained; no new SECURITY
DEFINER function or runtime mutation grant. Repository, eligibility, demo and
pack readers use the same projection. Deploy migration before the new readers;
preceding code can still write/read its original tables during rollout.

Received principal in the projection is the LARGER of the manually recorded landings
(workbench events, net of manual reversals) and the principal approved through
`approve_synthetic_landing` (allocations net of approved reversals), never their sum:
a builder may record by hand the same money that is later approved, and approving it
must not count it twice. Claim amendment, write-off and the outstanding figure all use
that received principal; the workbench may reverse only its own manual records, and
approved landings are reversed through the approved reversal routine. The case state
remains the workflow stage set by workbench events (an approved landing does not move
it). Legacy cases with no workbench history are unchanged. The landing routine bounds a new
allocation by the NET approved principal (allocations less approved reversals), so a reversal
restores claim capacity even when part of the claim was written off. The reference fee is a job-level figure
(one cap and one plan-fee credit shared by every case): the workbench reports the job's current
fee liability separately from the signed obligation and compensation postings made because of the case.

Tests cover upgrade from the preceding schema with existing event/claim history,
repeat migration, legacy landing behavior, amended claim/revision in the landing
routine, prevention, runtime read isolation and forbidden updates. Forward-fix
only; do not delete immutable history or restore the stale landing routine.

Renumbered from reserved 0043 to 0097 under Ben's 5 October merge-ahead ruling
(recorded 7 October): 0053 is already merged. Registered last after 0053; SQL bytes
are unchanged. Fresh installs still apply 45 files; the upgrade regression installs
all registered migrations preceding 0097, seeds earlier history, then applies 0097.
No data backfill or new grant is added by renumbering. This changes an unmerged
reservation; no deployed database is altered here. An environment already tracking
0043 needs a separately reviewed forward fix before reusing it with 0097; historical
receipts retain their original migration names. Merge after
any lower-numbered PR that lands first, or renumber again. Forward-fix only as above.

## 0107_recovery_messages.sql

M4-5-S (renumbered from reserved 0045 under Ben’s merge-ahead ruling, 5 October; integrator assigned 0099 on 7 October and renumbered it to 0107 on 8 October after 0102 (CH-3b), 0103 (MON-7a) and 0106 (M4-7-S) merged first; CH-1 and ENT-2 later merged as 0109 and 0110. 0053, 0054, 0094, 0095 (CH-3a), 0096 (CH-2) and 0097 (M4-1-S-R) have merged and 0107 is registered after 0106). Adds four append-only, forced-RLS, `jobguard_migration`-owned tables with runtime SELECT/INSERT only: immutable canonical `recovery_message`, exact Decision/outbox `recovery_message_approval`, fact-bound gap-free `recovery_message_event`, and unique practice-provider `recovery_message_sink`. Invoker-only guards enforce canonical bytes/hash, current case and attachment, one outstanding approval, valid history transitions backed by authorization/attempt/outcome, and live authority at the effect boundary. No SECURITY DEFINER function or runtime grant elevation is introduced.

The case figures a message states and every guard compares come from one place: `app.recovery_message_case_snapshot` is a thin invoker reading of `app.recovery_case_current` (0097, M4-1-S-R), the single contract for a case's live revision, claim and received money. Revision is the latest claim revision plus the event count; outstanding is claim − landed − written off, where landed is the larger of the hand-recorded landings (net of reversals) and the landings approved through `app.approve_synthetic_landing`, never their sum. A message therefore states exactly what the workbench shows, and the sink guard refuses a message that was previewed before an approved landing moved the outstanding amount (an approved landing does not move the case revision, only the money outstanding). A case with no claim revision (a legacy 0018 creation snapshot) has no snapshot row and so cannot be previewed, approved or delivered; a partly written history is not returned by the view either. The approved-landing routine takes `pg_advisory_xact_lock(hashtext(tenant),hashtext(case))`, the same key every message guard takes, so a landing and a delivery for one case serialize and the second sees the first (proved in both orders in `recovery-messages.integration.test.ts`).

The sink serializes with all case/pack/source writes through a tenant-scoped advisory lock, including raw runtime SQL. Migration 0107 adds BEFORE write triggers to the 19 source tables read by the evidence-pack mapper. Existing records, table grants and RLS policies remain unchanged. Source writes take the source lock before audit; delivery takes case → source → authorization/membership/outbox row locks, rebuilds the pack, then inserts the sink. Its SQL guard independently compares the complete saved source set and JSON records to current database facts, including proof invalidation, original-byte hashes, supplier readiness and quote identity. This prevents direct-executor and validation/insertion races without pretending the repository's earlier check is sufficient.

An exhausted fifth retryable delivery is backed by `action_attempt.outcome=failed` and `action_outbox.status=dead_letter`; the history guard accepts that terminal failed fact and the panel displays “Delivery failed repeatedly — nothing sent”.

Outbox attempt facts and original message intents durably reconstruct interrupted terminal history and its audit atomically on reads/replays. A stale executing claim projects uncertainty; the authorized checking command records that uncertainty before reconciliation and never resends it. A check that began more than five minutes ago (the same window as an abandoned executing claim) and never recorded the provider's answer is likewise abandoned: a fresh authorized check records the answer as still unknown and starts the next check in one transaction, with no resend and no migration change, so a failed check never jams the message; a check inside the window is still refused as in progress, and the original command id still resumes its own check. Historical source projections use the saved pack's content and hashes even after rebuilding or invalidation.

Forward-fix only. Nothing is deleted or updated: a wrong preview is superseded by a new one, a wrong approval is revoked (an authorization revocation plus a cancelled outbox action), and history, sink and audit are kept. No backfill: cases that existed before the upgrade have no message until someone previews one, and an older evidence-pack approval does not carry across a rebuilt pack. Proof: `packages/db/test/recovery-message-upgrade.integration.test.ts` (real database at the previous schema, through 0106, holding approved packs, 0107 applied as `jobguard_migration`, existing records and the `recovery_case_current` projection byte-identical afterwards) and `packages/db/test/recovery-messages.integration.test.ts`. The migration list has numbering gaps; the runner applies by list order and records names, so the gaps are harmless.

## 0102 — contractor parties (CH-3b)

Expand-only, after 0095 and 0054. Adds immutable `contractor_client_customer`,
`contractor_party_binding` and restricted `contractor_resident_contact`, all
migration-owned with tenant-qualified FKs and FORCE RLS. Adds a composite unique
key to the existing client-contract-version table without changing its rows.
A client links only to its customer's latest revision, and every import re-resolves and
re-checks that latest revision's type against the client kind. Named synthetic
controlled routines link a client, bind an import inside its caller transaction,
and read resident contact through persisted job scope. No runtime direct writes;
resident payload columns have no runtime SELECT grant. Deferred guards require
matching succeeded receipts and audit records before commit. No data backfill,
provider action, retention period or production enablement.

ENT-1 cannot yet resolve job IDs; reads deny until ENT-2 supplies authoritative
job assignment scope and proves held positive cases. ENT-2 must call the binding
routine before live entry and append audit after all domain writes. Migration
0102 is issued by the integrator; BUILD_PLAN §12.2 amendment is integrator-owned.

Validation: new PostgreSQL suite runs fresh preceding-schema install plus tracked
upgrade/idempotence; global tenancy/bootstrap suites exercise fresh install,
privilege/catalog inspection and preceding demo compatibility. Exact observed
results, including sandbox restrictions, are in the CH-3b receipt. Roll forward
for deployed repair; no rollback destroys resident/binding/audit history. Before
any destructive rollback, stop callers and obtain the approved retention/export
plan. Previous application code remains compatible with the additive tables.

### 0103 — MON-7a synthetic prevention facts

Additive `property_constraint_fact` and `counterparty_check`, tenant/job/binding-qualified
FKs and invoker subject guards, strict cited result validation, reference-only
staleness, indexes, immutable triggers, ENABLE/FORCE RLS, migration ownership and
runtime SELECT/INSERT only. Watches append explicit start/stop commands and
revision-scoped feed evaluations; no default watch, provider route, scheduling,
Decision, outbox or financial effect. No data backfill. The prior application
remains compatible. Audit FKs are deferred; audit head is the final command lock.
The counterparty guard fails closed on the customer's LATEST revision: the binding's
pinned revision must still be the latest and the latest must be a business with a
valid company number, else `NOT_REGISTERED_COMPANY` (23514). 0103 is unmerged, so
this is part of the same migration, not a new one.

Fresh install and upgrade are covered by the PostgreSQL tests; the upgrade test
applies every registered migration before 0103 (now including 0096 and 0097),
seeds a quoting job, then applies 0103. They need embedded PostgreSQL or CI.
0103 writes no table that 0096 guards, so 0096's live-only guards neither block
nor are blocked by it. After application, use a reviewed
forward-fix migration and retain historical facts/audit; disable affected commands
while fixing a validator or projection rather than rewriting history. No schema
rollback with data deletion is proposed. See `docs/contracts/prevention-checks-v1.md`.
B4 is parked as MON-7b; MON-7 is not fully accepted while it is parked.

## 0106_practice_feed.sql (M4-7-S)

Adds the provider-neutral synthetic practice feed: `practice_feed_job_owner` (the session that owns a job for this feed), `practice_feed_account` (fake account and its read-only consent), `practice_feed_command` (append-only commands, one revision each), `practice_feed_event` (validated generated adapter events) and `practice_feed_receipt_match` (a builder-attested customer receipt matched to one settled movement). Number history: reserved as 0046, renumbered to 0101 under Ben's 5 October merge-ahead ruling (merged main then ended at 0094, 0095–0099 were held by open PRs and 0100 by SV-2), then renumbered again to 0106 on 8 October because CH-3b's 0102 merged first (0103 is allocated to MON-7a, 0104 to CH-1 and 0105 to ENT-2). The file is `0106_practice_feed.sql`; its SQL is byte-identical to the 0101 version. The registry is in filename order and grows as later migrations merge; nothing in this section or in the feed suite depends on 0106 being the last entry.

All five tables are tenant-owned: non-null `tenant_id`, tenant/job-qualified foreign keys (the match's payment FK is `(tenant_id, job_id, payment_id)`, so a receipt from another job cannot be linked; an account's session FK points at the job's owner row), `jobguard_migration` ownership, ENABLE + FORCE RLS with a policy for both roles, and runtime SELECT/INSERT only. There is no SECURITY DEFINER function and no routine grant: two SECURITY INVOKER trigger functions (`guard_practice_feed`, `require_practice_feed_effect`) have EXECUTE revoked from the runtime role. The catalogue amounts (£384, £3,000, £41,280, £24,000, £17,280, £960 and the £540 supplier refund) are also table CHECK constraints, so no runtime SQL can insert another amount for a movement, a state that does not match its event kind, or a non-synthetic `environment` value.

What the database does and does not enforce, stated exactly:
- **Ownership.** The application uses SBOX's `PracticeAccess` before any repository call: missing/unissued/expired sessions receive 401; another creator's job, a nonexistent job and an old unbound job receive the same 404. The repository rechecks the immutable `app.job.practice_session_digest` and live server-issued session before snapshot, registration or connect. The SQL trigger checks that binding and authenticates the session before every feed insert, including direct owner/account insertion. `practice_feed_job_owner` and its claim audit register existing creation-time ownership only; insertion order cannot select an owner. No legacy backfill or first-touch assignment is permitted. The `jg_session` cookie is a 7-day bearer token, so the feed never stores it: `session_digest` on the owner and account rows, the transaction setting `app.practice_feed_session_digest` and the `sessionDigest` audit references all carry only SBOX's sha256 digest (the same value as `app.job.practice_session_digest`); the repository takes the digest from `PracticeAccess` and never receives the token.
- **Environment.** The application and the repository refuse every `JOBGUARD_ENV` other than `synthetic_demo`. The trigger additionally requires the transaction setting `app.practice_feed_environment = 'synthetic_demo'` and the session-digest setting. Those settings are written by the repository, so the database alone cannot tell a pilot deployment from a synthetic one; physical separation of pilot and production databases (BUILD_PLAN §3) is the real boundary. The trigger does **not** look at a job's activation mode: the practice sandbox starts jobs as `pilot_no_charge` in its no-charge scenario, so that mode cannot be the discriminator.
- **Effects.** Events must belong to the account's latest, matching `advance` command (exact kind, movement and an integrity hash that is not a signature); receipt matches must belong to a matching `match_receipt` command with a builder-attested, unreversed payment of exactly the movement amount, a settled identified movement and no unreconciled duplicate. Deferred constraint triggers require the claim and connect commands' audit events, the match row for a match command, and every event identity an advance step generates (an identity stored by an earlier command satisfies a replay), so a half-written effect cannot commit.
- A movement never touches allocation, landing, fee, journal or ledger tables, and a match never sets `qualifying_recovery_proof`. A matched receipt qualifies only while its movement is currently settled and unheld, and stops qualifying if the receipt is reversed; the saved match is history and is never edited. One movement verifies one receipt for life: a reversed receipt's match keeps its movement used (the UI says so); a correction path belongs with M4-8-S's reversal work.

Expand-compatible: new tables only; the preceding application ignores them. The integration suite exercises upgrade from the schema just before 0106 (currently through 0102) on a database carrying an unbound prior job, as well as fresh install in demo-bootstrap; execution is required in CI. Roll forward to correct: movement facts, commands, matches, ownership and audit are history and are never rolled back destructively. Disconnect appends a command and keeps every fact.

The feed is deliberately unavailable for CH-3a-adopted (imported) jobs and for SBOX-2 generated jobs without a capture record: they have no customer payments and no receipts screen, so there is nothing for the feed to match. Extending it to them would be a separately reviewed change (Opus P2-1/P2-2, rated P3 at e8892c1).

## 0109 — CH-1 job activation terms

Expand-compatible v3 synthetic activation: immutable tenant/job terms with FORCE RLS, qualified quote/document/track keys and controlled inserts, no historic financial effects, existing parties/track/watchdog transition guards. Existing v1 rows and activation routines are untouched. The job baseline shape additionally permits v3 with a null recovery cap. A new session-owned saved v1 sample supports historic regressions; its marker cannot be selected or changed by runtime SQL. No data backfill is required.

Upgrade from the schema just before this migration (every earlier registered migration, including 0102, 0103 and 0106) applies only additive objects and expanded checks; re-running the migration runner is idempotent. Forward-fix is preferred. Rollback requires disabling v3 entry first and confirming there are no v3 activations or saved v1 samples before removing new triggers/functions/table/columns and restoring the previous checks. Never delete activated commercial history to roll back. No production fees are enabled.

## 0110_work_orders.sql (ENT-2)

Registered after `0109_job_activation_terms.sql`. The merged registration order is `0106_practice_feed.sql`, `0107_recovery_messages.sql`, `0109_job_activation_terms.sql`, `0110_work_orders.sql`, `0111_persisted_identity.sql`, then `0112_recovery_follow_up.sql`; 0108 is not registered. The 0110 number was assigned under Ben's 5 October merge-ahead ruling. Adds `schedule_of_rates`, immutable `sor_version` and `sor_item`, `import_batch`, `import_row_receipt`, `work_order`, immutable `work_order_revision` and `work_order_line`, the `work_order_current` pointer, `job_assignment` and `site_visit`. Every table is tenant-owned (non-null `tenant_id`, tenant-qualified composite keys), owned by `jobguard_migration`, FORCE RLS, runtime `SELECT` only. All writes go through five controlled `SECURITY DEFINER` routines (begin, commit, batch record, SoR import and party comparison) with a pinned `search_path`; revisions, lines, batches, receipts and SoR rows are immutable by trigger even for the owner.

Existing objects it touches, each based on its current definition: `job_provenance_check` (0020) keeps `system_generated_quote` and `imported` and adds `work_order`; `app.read_contractor_resident` (0102) is identical except that job scope is resolved by `app.contractor_job_allowed`. Nothing else an earlier migration defines is altered, and no merged migration file is edited. New job-level guards: a `work_order` job can only be inserted by the migration role as a draft, its provenance is immutable, and it can only enter `live` through the import routine.

Expand-compatible: new tables and a widened CHECK only; the preceding application ignores them. Corrections ship as a new migration: revisions, lines and audit are historical facts, so there is no destructive rollback. Authority for the two imports follows the 9 October "Existing roles" answer; see `docs/contracts/work-order-import-v1.md`.

## 0111 — persisted entered-code identity (M0-6L)

Expands the existing restricted `identity` control plane with keyed challenge/session
hashes, rate windows, immutable invitation grants, a membership discovery index and
append-only security events. `jobguard_identity` is a separate NOLOGIN group/credential
boundary: no business table access, owner status, superuser, BYPASSRLS, role inheritance,
role creation, DDL or truncate permission. Business/worker roles cannot read these tables
or execute the three narrow identity routines. Identity updates are column-scoped to
challenge counters/consumption/delivery and session revocation; issued token/user bindings
and challenge email/digest cannot be rewritten by the identity credential. The operator provisions a separate login;
Neon bootstrap creates the group before switching to `jobguard_migration` (which cannot
create roles). The fixture browser harness enables LOGIN only in its disposable database.

Provisioning takes a verified, consumed challenge, never arbitrary tenant/role parameters.
Signup always creates a new tenant and owner. Acceptance uses the invitation's immutable
email/tenant/account/role, with tenant-qualified account/membership FKs. The membership locator outlives
revocation and expiry, so it never blocks acceptance by itself: under row locks on the locator
and its membership, only a currently active membership refuses a fresh invitation (which then
stays unused). For a revoked or expired one, acceptance inserts a new invitation-bound membership
and repoints the locator in the same transaction; the old membership row is kept as history. FORCE RLS remains
on `app.account`/`app.membership`; additional migration-owner policies retain the same
transaction-local tenant predicate. The discovery routine visits only the identity's
locator rows and rechecks canonical membership revocation/expiry. Identity credentials
are part of the authentication trust boundary; possession of them is not protected by
business RLS. SQL privileges and migration-owner-only routines require independent review.

Existing users need no backfill: legacy synthetic users stay in their existing demo path.
Do not auto-link email addresses to pre-existing identities. Under Ben’s merge-ahead ruling,
0111 replaces this PR’s earlier reservations (0052, then 0098, then 0108): 0102, 0103, 0106, 0107
(M4-5-S, `recovery_messages`), 0109 (CH-1) and 0110 (ENT-2) merged ahead of this PR, so 0111 is the next
free number at merge. 0112 (M4-6-S) and 0113 (CH-7) are allocated after it, and 0100 (SV-2) later merged as
0128. The runner places 0111 after 0110_work_orders.sql (currently last);
0102_contractor_parties.sql, 0103_prevention_checks.sql, 0106_practice_feed.sql,
0107_recovery_messages.sql, 0109_job_activation_terms.sql and 0110_work_orders.sql therefore apply before
0111. The SQL bytes are unchanged by the renumber (SHA-256 9779d3f6…59e0).
Fresh-install coverage remains in the tenancy/Neon suites; `identity.integration.test.ts`
executes upgrade from the state immediately before 0111 (everything listed ahead of it, merged through 0110),
checks the complete applied list against MIGRATION_URLS, and covers repeat migration,
races, privilege/catalog checks and rollback.
These are PostgreSQL tests, not claimed executed in the restricted builder sandbox.

Forward fix: disable identity endpoints/credential, preserve existing tables and add a
reviewed corrective migration. Rollback of application code is expand compatible: the
preceding demo ignores these tables. Never drop enrolled identities or tenants to roll
back; restore rehearsal and real-data retention remain separate release gates.

## 0112_recovery_follow_up.sql (M4-6-S)

Registered after `0110_work_orders.sql`: it takes the number the integrator allocated on 9 October (0111 is M0-6L's at its renumber). Adds the persisted practice recovery follow-up: `recovery_follow_up` (the intent), `recovery_follow_up_owner` (exactly one persisted scheduling owner per intent, required at commit), append-only `recovery_follow_up_event`, `recovery_follow_up_due` (one due Decision per intent and period, unique), `recovery_follow_up_reminder` (the M4-5-S messages previewed as the reminder) and `recovery_follow_up_advance` (the ledger of `Advance practice time` commands). All six are tenant-owned with a non-null tenant id, tenant/job/case-qualified foreign keys, ENABLE and FORCE row security, migration ownership, and runtime SELECT and INSERT only. Every row carries `environment='synthetic_demo'`; the one owner kind is `practice_fake_clock` (a workflow engine is a later owner and cannot be represented).

The clock is SBOX-2's own per-run fake clock (the number of `sandbox_adapter_receipt` rows, its `fakeClockTick`), never wall time. An `AFTER INSERT` trigger on `app.sandbox_run_event` (kind `advanced`) calls `app.evaluate_recovery_follow_ups`, which runs inside the very transaction of SBOX-2's advance: the due Decision commits with the advance or rolls back with it (SBOX-2's code, tables and behaviour are untouched, and a run with no follow-up does what it did before). The evaluation writes a PENDING Decision (no resolution, authorization or outbox row), the due row and an event, at most once per intent and period; it is idempotent, takes the intent's lock, and `signalDue` can call it any number of times. The due interval is the versioned fixture `recovery-follow-up-fixture.v1`: one practice tick after scheduling (a follow-up whose due tick the bounded clock, 0 to 3, can never reach is refused).

Case facts (Q3): dispute = `dispute`; settlement = `close_recovered`; cancel = `close_no_recovery`, `write_off`, `prevent`; reopened = `resume_pursuit` or `reverse_landing` after one of those. `app.recovery_follow_up_case_facts` mirrors `followUpCaseFacts` in packages/core, and a test runs both on every event type at every review point.

Existing objects it touches: the three M4-5-S guards (`guard_recovery_message`, `guard_recovery_message_approval`, `guard_recovery_message_sink`) are restated with `CREATE OR REPLACE`, bodies exactly as in 0107 plus one exception each. (1) The one-effect rule still stops any new preview or approval while a message effect stands, except while an open follow-up's reminder is due and every effect on the case is a DELIVERED message from before the follow-up was scheduled (`app.recovery_follow_up_reminder_window`). (2) The approval guard accepts the follow-up's own due Decision as the Decision of the first approval of its newest linked reminder, and nothing else. (3) The sink guard refuses to record a reminder whose follow-up has stopped. Without a follow-up row each guard behaves as before. No other object is altered.

Expand-compatible: new tables, functions and one trigger; the preceding application ignores them. Corrections ship as a new migration: events, due rows and links are historical facts, so there is no destructive rollback. Proof: `packages/db/test/recovery-follow-up.integration.test.ts` (including the same-transaction proof by `xmin` and by injected failure).

## 0115_recovery_follow_up_repair.sql (M4-6-S-R1)

Allocated by the integrator on 11 October 2026; registered in numeric order after 0112, leaving the reserved 0113/0114 slots alone. Fix-forward only: `CREATE OR REPLACE` of 0112's `guard_recovery_follow_up` and `evaluate_recovery_follow_ups`. No table, column, policy, grant, role, trigger or existing row changes. Existing function ownership, invoker rights and EXECUTE privileges remain intact. The three M4-5-S guards restated in 0112 remain byte-identical.

The source-message selection accepts the newest delivered message (sink plus succeeded outbox) only when every later approved attempt has a cancelled outbox action. Revoked/blocked history therefore permits a fresh reviewed follow-up after reopening. A later preview without an approval is ignored, as in 0112; a queued, executing, retryable, failed, unknown or succeeded-but-not-recorded-as-delivered action continues to refuse. All other scheduling checks stay as in 0112.

Due evaluation now finishes every intent mutation and business lock before taking the existing follow-up audit serialization key and audit head. It appends the due row's persisted `audit_event_id` using the same canonical SHA-256/UTC millisecond representation as `audit.ts`, within SBOX-2's own advance transaction. Where a persisted clock event caused the transition, its identifier-only `time_advanced` fact precedes `became_due`, preserving the existing history order. These clock facts name the system actor and hash the persisted clock payload; they do not imply human consent. The repository suppresses a later duplicate `time_advanced` append for that command. Its existing catch-up remains for old 0112 due rows and becomes a no-op for newly audited transitions. No SBOX-2 code or routine changes; no new privileged helper. Audit writes or head failures roll back the clock and due records together.

Upgrade coverage: `test/recovery-follow-up-upgrade.integration.test.ts` installs through 0111, populates approved, queued, revoked, delivered and unknown messages via M4-5-S, compares the complete textual row representation of every pre-existing table after 0112 and 0115, compares catalog privileges/policies/owners, verifies audit hashes, then exercises preview/approve/revoke/deliver/reconcile on that upgraded history. `test/recovery-follow-up.integration.test.ts` adds direct SBOX-2 transaction-ID and late-failure rollback proofs, exact reviewed continuation after revocation/reopening, and raw-SQL/application refusals. **PostgreSQL suites NOT RUN in the builder sandbox (cannot start PostgreSQL); CI and the integrator must execute them.**

Forward fix: preserve immutable history and replace only the affected routines in another reviewed migration. Application rollback remains schema-compatible, but must not be treated as a rollback of the atomic audit guarantee; the old application may still append its additional clock audit. Do not revert to 0112's delayed due-audit routine, drop history, or rewrite audit rows. Release/acceptance requires green database/migration/browser suites, fresh Claude Opus review and a separate Sol check on the exact dispatcher commit.

## 0119 — CH-7 recovery eligibility v3

Renumbered from 0113 to 0119 on 11 October 2026 under the merge-ahead ruling because 0115 merged first.

The new `practice_feed_event_job_identity` unique key on `app.practice_feed_event` covers `(tenant_id,job_id,id)`.
The new `recovery_eligibility_v1_duplicate_payment_refusal` trigger on `app.recovery_eligibility_revision` calls `app.refuse_v1_eligibility_for_duplicate_payment()` to refuse new v1 review rows for a `duplicate_supplier_payment` case.

Expand-only synthetic candidate reviews, tenant/job/case-qualified claim components and a typed supplier-credit link; adds `duplicate_supplier_payment` without changing old cases/reviews. Runtime tables are FORCE RLS, owned by `jobguard_migration`, SELECT/INSERT only, with invoker write guards and deferred audit/component completeness. No fee/posting, terms or pursuit routine changes. The consumed-credit positive path fails closed because merged 0106 has no supplier-invoice payment movement; see `docs/contracts/recovery-eligibility-v3.md`. Keep v1 data byte-for-byte. Forward fix with a new migration; any application rollback must retain a reader compatible with the new category after such cases exist. Never drop populated history or narrow a used category. PostgreSQL fresh/upgrade/catalog tests are written but NOT RUN in the builder sandbox. Round 1 (11 October 2026) adds, inside 0119 only, a new trigger `recovery_eligibility_v1_duplicate_payment_refusal` (function `app.refuse_v1_eligibility_for_duplicate_payment`, invoker rights) that refuses any new v1 review or approval row for a `duplicate_supplier_payment` case, and makes the stored v3 result guard require every result key with the right JSON type (an absent `reason` is no longer accepted as null). No merged routine is replaced and no merged column, policy or grant changes.

## 0120 — ENT-10a synthetic SAML identity

Renumbered 0114 → 0120 on 11 October 2026 under the merge-ahead ruling because 0115 merged first.

Adds only new identity/control-plane tables and narrowly scoped routines. Eight
scoped tables have tenant-qualified keys, enabled/FORCE RLS and migration ownership;
`identity.sso_refusal_event` is an INSERT-only global identity-bootstrap exception.
Business runtime/infrastructure gain no identity privileges. Existing schemas,
tables, policies, roles, grants and auth/session routines are unchanged. Sessions
and JIT memberships are inserted through the existing persisted mechanism, with
an additional 900-second bound; SSO-derived grant/session revocations retain history.

Upgrade is additive with no data backfill. `migrate` registers 0120 after the merged
0115 (0116–0119 reserved by other pieces); tests compare migration names and increasing order.
Fresh bootstrap and upgrade suites plus the new PostgreSQL identity tests are required
in CI; they were NOT RUN in the socket-restricted builder sandbox.

Rollback strategy: disable SSO and allow issued sessions to expire; preserve tables,
request/assertion identities, links, revocations and audit records. Repair forward
with a separately numbered migration. Do not drop identity/audit history or rewrite
an already applied migration. No real-provider rollout or D04/G5 approval follows
from migration success.

## 0121 — audit export (ENT-10b)

Renumbered 0116 → 0121 on 11 October under the merge-ahead ruling.

Adds `app.audit_export` and `app.audit_export_checkpoint`, tenant-qualified audit/membership/checkpoint FKs, FORCE RLS, migration ownership and append-only triggers. Runtime gets SELECT/INSERT on the new export table and SELECT only on the new checkpoint handoff; existing objects and privileges are unchanged. Existing restricted assurance credentials copy existing checkpoints; no runtime access to `audit_control` or new elevated routine. No backfill. Previous application remains compatible. Disable new routes and fix forward on failure; never rewrite/delete audit history or exports as rollback. Live signing/rotation remains HELD. Fresh install is covered by the existing migration/bootstrap suites; upgrade and catalogue/runtime attacks by `test/audit-export.integration.test.ts`. Database suites were NOT RUN in the builder sandbox.

## 0122 — ENT-4b origin persistence and audit

Renumbered 0117 → 0122 on 11 October 2026 under the merge-ahead ruling.

Adds `app.extra_event`, `app.extra_duplicate_link` and `app.extra_order_line_link`, owned by `jobguard_migration`, with enabled/FORCE RLS, tenant policy, SELECT/INSERT-only runtime grants and immutable UPDATE/DELETE guards. Adds four SECURITY INVOKER trigger functions, all revoked from PUBLIC/runtime; no callable helper or SECURITY DEFINER routine.

Existing objects extended by addition only: `app.extra_origin` (ten nullable provenance columns, six composite FKs, two CHECKs, partial capture-ID unique index, insert provenance trigger and deferred audit trigger); `app.variation` (four nullable reference columns, two FKs, one CHECK). B5 pricing basis is HELD: a column on a fingerprinted table would change approved evidence packs and needs its own decision. No fingerprinted table is extended. SH-1's command-receipt FK, command map, immutability and `variation_requires_origin` are reused unchanged. Every pre-existing row retains its old values; no backfill, defaults, policy/grant changes or routine replacement.

References existing keys on command receipts, memberships, role grants, work orders/revisions/lines, visits, SoR items, evidence, variations and revisions without altering those objects. Fixture contractor origins retain all-NULL new columns and are exempt from the new audit/logged requirement. Work-order contractor origins require structural provenance and the exact raised audit plus logged event at commit. Prompt provenance and unlink command/authorization remain held.

Forward fix: disable callers of this new repository, preserve all appended records and deploy an additive corrective migration after review. Do not drop populated history or rewrite origins. No destructive rollback SQL is supplied. Database fresh/upgrade/catalog checks were written; sandbox execution is NOT RUN (sandbox cannot start PostgreSQL / a browser). Dispatcher/CI must execute them before acceptance.

## 0130_recovery_eligibility_v3_f17_timing.sql (CH-7-F17-BEFORE-OPEN)

Renumbered from 0125 to 0123 on 11 October 2026 under the merge-ahead ruling because 0120 merged first and 0121 and 0122 were taken by open pull requests (0124 was reserved by PRACTICE-FACTS-1), and renumbered from 0123 to 0130 on 12 October under Ben's 5 October merge-ahead ruling because 0127 (STORED-TIMES-1) and 0128 (SV-2) merged ahead of it and 0129 is reserved by ENT-10d; the SQL bytes are unchanged (sha256 recorded in the builder receipt). Registered last in numeric order, after 0128. Restates only 0119's `app.guard_recovery_eligibility_v3` with `CREATE OR REPLACE`: the existing `paid_before` exclusion now also applies to `duplicate_supplier_payment`. The stored original settlement timestamp at or before (`<=`) case opening gives an excluded F17 candidate, 0p and exactly `Paid before you opened this case`. After opening, settled F17 remains 45,000p with a null reason. No second timing comparison, table/column/policy/grant/trigger change, backfill or row rewrite; function ownership, invoker rights and EXECUTE privileges remain intact. No routine from another migration is replaced.

Upgrade coverage is appended to `test/recovery-eligibility-v3.integration.test.ts`: a separate database is installed through every migration registered before 0130 (the file is found by name, so this includes 0127 and 0128) and saves an F17 candidate for already-settled cash (the 0119 guard accepts it). Migration 0130 is then applied alone and the complete textual review, claim-line and audit rows are compared byte-for-byte straight away. The migration runner then runs twice (it applies anything registered after 0130, which today is nothing, and both runs must succeed), and the rows that existed before 0130 are found again by primary key and compared as canonical database text over their pre-existing column names and full types. A column, row, trigger or function added or replaced by a later migration is not looked at; rolled-back controls using the same comparison show that a one-microsecond change, a retype or a lost row fail it, and that an added column, a replaced function (including one whose body contains `$function$`), a later claim line and a later review pass it. The corrected review is appended against the review revision read from the database at that point. Fresh-install coverage, microsecond boundaries, equal-instant exclusion, complete raw runtime refusal transactions and an after-opening raw-write control are in that same file. **NOT RUN (sandbox cannot start PostgreSQL / a browser).**

Forward fix only: retain immutable saved candidates and audit history, replace the affected routine in a reviewed later migration. An application rollback must keep the timing rule or fail closed against this guard; do not revert the guard to 0119 or rewrite historical Q. CI database/browser execution, fresh Claude Opus review and a separate Sol check on the exact dispatcher commit remain required before acceptance. Synthetic only; no new fee derivation, posting, statement, provider or operational alert.

## 0127 — STORED-TIMES-1 recovery timing pin

Adds one SECURITY INVOKER function, `app.pin_recovery_timing_created_at()`, owned by `jobguard_migration`, `search_path=pg_catalog`, EXECUTE revoked from PUBLIC/runtime, and ordinary BEFORE INSERT row triggers named `a_recovery_timing_pin` on `app.recovery_case` and `app.practice_feed_event`. Every role's insert stores `transaction_timestamp()` instead of a chosen time; the pin fires before the existing source/feed guards. A raw writer's back-dating attempt cannot supply either stored time. No existing routine/hash, column, default, grant, policy or constraint changes; no backfill. Earlier stored times and all history remain unchanged. `CREATE TRIGGER` takes a short table lock.

Runtime UPDATE/DELETE remains denied by 0018/0034 (case) and 0106 (feed), SQLSTATE 42501. The case's merged append-only trigger also refuses owner UPDATE/DELETE with 55000. Infrastructure/identity lack app-schema access (0000/0111). The feed's privilege-only guard suffices at the non-owner business-runtime boundary: runtime cannot grant itself rights, and the merged catalog test pins SELECT/INSERT-only grants. The owner CAN update feed rows; privileged actors can remove triggers. No UPDATE guard is added. Ordinary triggers permit the existing superuser replica-mode UPDATE fixtures; cold whole-cluster restore retains the stored times.

After this pin a raw writer can still back-date by as long as it keeps its own transaction open, because the stored time is the transaction's start. That is bounded, needs raw database access, and is not closed by this order.

Forward fix: never drop or rewrite history; correct by a later reviewed migration. Prior product paths omit these times and retain the same transaction clock. `extra-origin-upgrade.integration.test.ts` must still pass unedited for this change: 0127 only CREATES a new function and preserves every earlier definition. Fresh/upgrade, privilege and F18/F19 coverage is in `test/recovery-timing-pin.integration.test.ts`; database/browser execution is NOT RUN (sandbox cannot start PostgreSQL / a browser). See `docs/contracts/recovery-timing-pin-v1.md` and the builder receipt. Independent RED-lane reviews and acceptance remain pending.

## 0128 — SV-2 shadow persistence and isolation

Renumbered from 0100 to 0118 on 11 October and from 0118 to 0128 on 12 October under Ben's 5 October merge-ahead ruling. 0119 (CH-7), 0120 (ENT-10a), 0121 (ENT-10b), 0122 (ENT-4b) and everything lower have merged; 0123 (CH-7-F17-BEFORE-OPEN), 0124 (PRACTICE-FACTS-1), 0125 (ENT-10d) and 0126 (ENT-3a) are reserved and 0127 (STORED-TIMES-1, PR #142) precedes it in this branch's base, so 0128 is the next free number. The SQL bytes are unchanged by both renumberings (sha256 recorded in the refresh receipt); the runner lists it last.

Expand-only after 0094. Adds eight restricted shadow tables and one append-only
variation-withdrawal fact, qualified evidence/version/hash/receive-time identity,
small-builder catch-source enforcement, bounded reveal/disclosure/emergency read
routines, and a private audit implementation using the existing serialized chain.
No backfill: SH-1's completed origins and source labels remain unchanged. The
existing application capture path starts issuing `LogBuilderExtra`; the legacy
synthetic insert compatibility remains for earlier demos and fixtures.

Fresh superuser installs create the two NOLOGIN shadow roles idempotently. The
non-superuser Neon bootstrap creates/checks them before migration; migration owner
remains NOCREATEROLE. PostgreSQL 16 gives that CREATEROLE bootstrap owner an
automatic ADMIN-only membership in each role it creates (no INHERIT, no SET,
granted by the bootstrap superuser). The owner cannot revoke it, so it stays; the
bootstrap accepts exactly that shape, fails closed on any other holder, and the
support route checks `USAGE` (not `MEMBER`) so the leftover membership grants no
support authority. No support holder is appointed. Because the schema `app` is
now usable by these two roles, 0128 revokes PUBLIC EXECUTE from the four older
SECURITY DEFINER routines that never had it revoked (`advance_final_account_draft`,
`invalidate_stale_final_account_authorizations`, `reserve_customer_invoice_number`,
`issue_practice_customer_invoice`); `jobguard_runtime` keeps its explicit grants.
Runtime has no shadow-table privilege; catch-source probes
are denied before PostgreSQL's RLS-bypassing FK checks. Emergency reads and every
disclosure append audit atomically. New facts reject UPDATE/DELETE/TRUNCATE;
signal source fields and disclosure provenance are immutable/monotonic.

The reveal routine fails closed when SV-4's lock relation is absent. It checks
only a matching tenant/job lock when present. SV-4 owes positive reveal tests and
must acquire the job lock before recording the lock/audit; SV-5 adds exact locked
line/disposition bindings. Neither dependency is simulated with a new lock table.

Forward fix: disable application use of affected routines first, retain evidence,
origin, disclosure and audit history, then append a reviewed corrective migration.
Do not down-migrate populated history or weaken the probe barrier. A migration
failure rolls its SQL transaction back, leaving the predecessor schema intact.
Before acceptance CI must execute real PostgreSQL fresh/upgrade, least-privilege
catalog, support disclosure, rollback, immutable metadata, source-FK/probe and
non-superuser twice-run bootstrap tests, plus unchanged variation/final-account
and browser regressions. Local sandbox initialization errors are not DB passes.

## 0129 — Single sign-on required (ENT-10d)

Renumbered 0126 → 0125 on 11 October under the merge-ahead ruling (merged numbers end at 0121; 0122, 0123 and 0124 are taken by open pieces). Renumbered from 0125 on 12 October under Ben's 5 October merge-ahead ruling; the SQL bytes are unchanged.

Additive identity/control-plane switch revisions, held emergency rule and approval/use/log records; gated identity routines. Default OFF, no backfill. No object from 0111 or 0120 altered or restated. Deploy this migration before application code. Forward-fix only: retain immutable switch/audit history; an authorized bound admin may append OFF before disabling the feature. Emergency approver latch is not lifted. The private append helper has no identity execute grant.

## 0131 — PRACTICE-FACTS-1 part A

Renumbered from 0124 on 12 October under Ben's 5 October merge-ahead ruling; the SQL bytes are unchanged.

`0131_practice_feed_facts.sql` replaces exactly six catalogue CHECK constraints on
`practice_feed_command`, `practice_feed_event` and `practice_feed_receipt_match`.
It retains every existing allowed value and adds **six movement keys** from
`practiceFactsCatalogueV1` to the command/event movement checks:
`receipt-12000`, `receipt-14640`, `supplier-payment-600`, `supplier-payment-840`,
`receipt-interest-120` and `receipt-compensation-70`.
The receipt-only checks (command match action and receipt-match keys/amounts)
add **four receipt keys**: `receipt-12000`, `receipt-14640`,
`receipt-interest-120` and `receipt-compensation-70`.
Supplier payments cannot match customer receipts. Constraint discovery uses table identity
and `pg_get_constraintdef` containing `receipt-384`, requiring exactly two matches
per table; any mismatch aborts the transaction. Each widened replacement keeps
its discovered original constraint name and validates existing rows, in the
same transaction. The upgrade test compares all six names, validation flags
and every old allowed literal before and after 0131.

Creates NO table, column, role, grant, policy, trigger or function. Updates,
rewrites and deletes NO existing row. Both feed routines remain unchanged.
The access-exclusive lock and validation scan are the operational migration cost.
The populated upgrade, row bytes, no-op rerun and unchanged security/routine
catalogue probes are in `test/practice-facts.integration.test.ts`; they are
NOT RUN in the builder sandbox (cannot start PostgreSQL). They were later run on the Mac
(the whole suite once, as part of merge train B) and in GitHub's CI on the merged head
(pull request #139; acceptance comment 6132008864).

Forward-fix: retain the expanded checks and disable the new route if a defect is
found. Narrowing the checks is unsafe once new rows exist; do not delete or edit
append-only facts to roll back. The integrator owns the BUILD_PLAN §12.2 ledger.

## 0132 — SV-4 final-account lock

Renumbered from 0130 to 0132 on 12 October 2026 under the merge-ahead ruling because ENT-10d (0129) and CH-7-F17-BEFORE-OPEN (0130) merged first and 0131 is reserved for PRACTICE-FACTS-1; the SQL bytes are unchanged (sha256 543977d99659b724f9f22ca23279c4b9e6210eb053f599ac3d9ffd8df16b7df7).

`0132_final_account_lock.sql`: SV-4 immutable lock, dispositions, synthetic terms, append-only check facts and invoice/line side bindings; only new lock-bound issue is guarded. No fingerprinted-table columns or existing grants change. Forward-fix by additive migration; do not delete locks or issued invoices.

## 0134 — CH-7-TERMS (proposed synthetic withheld-payment terms)

Adds one migration-owned forced-RLS approval table, the controlled `app.approve_recovery_case_terms` routine and the invoker `app.recovery_case_terms_approved` helper, a server time pin, immutable-row trigger and three ordinary pursuit insert triggers beside the merged guards. No existing column, routine, grant, policy or row is changed. Runtime has SELECT only on approvals and EXECUTE on the two callable functions. Active-owner authorization is checked inside the definer routine as well as by the merged dispatcher (coordinator's 12 October amendment). Decision/receipt/audit paths remain dispatcher-owned.

A builder's agreement to the proposed fee terms for a case is not approval of the fee policy and authorises no charge.

Chasing a withheld payment on a job that is not bound to the v3 fee policy is NOT guarded by this order.

Existing rows are not examined or backfilled. A guarded message approved before this migration but not yet delivered is refused at delivery without terms and follows the merged blocked path. The guard runs at message preview, exact approval and delivery-record insertion, including reminders. A due follow-up is used for the populated upgrade proof's new preview after its earlier delivered message; earlier delivery remains intact. Upgrade tests compare named pre-existing columns as canonical PostgreSQL JSON text and full types, by pre-existing primary-key identity. Rolled-back controls cover a microsecond, retyping, a later nullable column, replaced function and added row; subsequent migrations are applied twice. Database execution is still owed; T8 was ruled on 12 Oct by the coordinator and amended to prove ONE transaction identity with ordered times (never exact equality; the merged audit path takes a fresh `clock_timestamp()` per event while the approval requires `transaction_timestamp()`, so exact equality was never achievable).

Forward fix: preserve all approval and chase history and amend only through a separately reviewed later migration. Do not roll back by removing the guard while pursuits exist. New terms/policy versions and withdrawal require their own reviewed migration and product ruling. DW3, wording, the UI and live M4-5 helper integration remain owed. Real charging remains locked.

## 0135 — site extra authority (ENT-3a)

Renumbered from 0126 to 0135 on 12 October 2026 under the merge-ahead ruling because 0127 to 0129 merged first and 0130 to 0134 are reserved by open pull requests; the SQL bytes are unchanged (sha256 1e3119299e15572885633d5f892f2bc385756589e65a1b280d476f5c5cc74eab).

Additive: only `app.ent3a_extra_authority(uuid,text,uuid)` (STABLE) and
`app.ent3a_require_extra_authority(uuid,uuid)` (VOLATILE). Both PL/pgSQL,
SECURITY INVOKER, `search_path=pg_catalog`, owned by `jobguard_migration`.
PUBLIC and infrastructure EXECUTE revoked explicitly; runtime EXECUTE granted
only on these two signatures. No merged migration object altered or restated;
no table or column added, no row changed or backfilled. The founder's 11 October
raising rule applies through SiteExtraRepository and the ENT-4b seam; ordinary
ENT-4b writers remain structurally governed only (issued Q5).

The read-only decision selects the lowest covering, unrevoked grant of the
member's own role. The stored-origin guard holds the shared tenant administration
lock until commit. Refusals roll back the attempted command; their coalesced audit
record is appended separately. No business network action, price or fee.

Upgrade/catalogue and governed-path tests: `site-extra-authority.integration.test.ts`
and `site-extra.integration.test.ts`. NOT RUN in the builder sandbox (cannot start
PostgreSQL). Integrator must execute before acceptance. They were later executed
(83 of 83 database tests passing on the combined head, plus GitHub's CI run on that head)
before the merge (pull request #156, merge c84c6b3; acceptance comment 6136417276). Expand-compatible with
prior clients. Forward fix preferred: stop this route and issue a reviewed
additive correction; rollback of this leaf alone requires disabling the route
and removing its two routines and migration registration under a separate
operator change. No historical data rollback is needed.

## 0137 — synthetic SCIM deactivation (ENT-10a2)

Adds only `identity.scim_event` (immutable, tenant-qualified, FORCE RLS, no application table privileges) and `identity.scim_deactivate(uuid,jsonb)` (restricted identity EXECUTE only; SECURITY DEFINER with pg_catalog search path). No object from 0111, 0120 or 0129 altered or restated; no backfill; no existing row changed by the migration. No column, index, constraint, policy, trigger or grant added to any existing table. PostgreSQL creates the internal foreign-key enforcement triggers automatically as part of the new table's constraints.

The governed repository transaction writes existing one-way membership/session revocation facts, grant revocations and the record, then appends the audit event last. This is the first product code to set app.membership.revoked_at. Existing request gates remain unchanged. Synthetic database only, replay once, owner protected, no reactivation. Roll forward for any repair; removing the new objects is permissible only before any message has been accepted. Accepted history and revocation facts must never be cleared by rollback. Upgrade proof snapshots populated named columns, full types and primary-key identities before this migration, verifies this migration alone, then applies later migrations twice. Database tests are NOT RUN (sandbox cannot start PostgreSQL / a browser).

## 0136 — recovery allocations (M4-8-S)

Expand-only: adds immutable allocation reviews, line-source bindings, case allocations/reversals, receipt-line fractions and command identities. Runtime SELECT only; session-checked migration-owned `write_recovery_allocation` appends facts and Decision authorizations. No existing object or grant changes. All constraints remain immediate; the public repository transaction invokes the joined case event last and then appends caller audit before commit. Forward fix only after facts exist: disable the allocator, preserve original rows, add compensating facts in a reviewed follow-up migration; do not drop or edit commercial history. Saved deposit and supplementary-invoice fixtures remain Q2-held.

## 0138_practice_session_hardening.sql — contractor practice session boundary

Depends on 0054 and 0094. Converts contractor session values in place into canonical SHA-256 digests and independent random row numbers. Live home records supply the remaining deadline; ended or absent home records end converted rows. New starts with no home record retain a nonrenewable seven-day cap. Lookup reads the home record on every call. Adds holder-only contractor revoke with a deferred audit requirement, write-once guards, and the same owner refusal in grant.create as member.invite. No new direct table write grants; only the checked revoke routine gains runtime EXECUTE.

Forward fix preferred. A rollback restoring the three 0054 routines must also drop the three new NOT NULL requirements and the guard trigger, since the old start writes four columns. No current row retains its original session value, so restoring the old lookup ends every current session; each browser starts a new company. No rows are deleted. PostgreSQL upgrade and catalogue checks remain pending outside the sandbox.

## 0133 — SV-3 shadow detection

Renumbered from 0129 to 0133 on 12 October 2026 under the merge-ahead ruling because 0129 (ENT-10d), 0130 (CH-7-F17) and 0131 (PRACTICE-FACTS-1) merged first and 0132 is SV-4; the SQL bytes are unchanged (sha256 6d317e043790d4bb97acfb91d918b755a0e2ee9a08fdf6cbeefeb26fbdfe5aa6).

`0133_shadow_detection.sql`: SV-3: append-only FORCE-RLS `shadow_must_surface_firing`, shadow-only `surface_shadow_signal_early` EXECUTE, and the single `must_surface_signal` finding kind. Atomic Decision/disclosure/firing/audit; no new business-table grants. Forward fix only: retain immutable firings and disclosures; disable the worker to stop new detections. Database upgrade proof is in `shadow-detection.integration.test.ts`.

## 0139 — site visit start and complete, and the close-out answer (ENT-3b)

Additive: one table and six PL/pgSQL functions, all owned by `jobguard_migration` with `search_path=pg_catalog`. `app.closeout_answer` holds one immutable row per visit (forced row security, the merged `tenant_isolation` policy, runtime SELECT only, update and delete refused by the merged immutable trigger). `app.ent3b_visit_authority(uuid,uuid)` (STABLE, SECURITY INVOKER) is the one place the visit rule lives and calls merged routines only. `app.ent3b_start_visit(uuid,uuid,uuid)` and `app.ent3b_complete_visit(uuid,uuid,uuid,uuid,text)` are the only writers of `app.site_visit` and `app.closeout_answer` (SECURITY DEFINER; they re-decide the rule under the shared tenant administration lock, check the command receipt and take the visit locks 3101 and 3102). `app.ent3b_require_open_visit(uuid,uuid)` (SECURITY INVOKER) is called by the site-extra seam when an extra names a visit. `app.ent3b_closeout_guard()` and `app.ent3b_require_closeout_audit()` are trigger functions, not executable by the runtime role.

One deferred trigger is added to the merged `app.site_visit` table, so that a completed visit without exactly one matching answer (and a visit that has an answer but is not completed) cannot commit for any writer, the table owner included. No column, index, constraint, policy or grant is added to any existing table; no existing object is replaced or removed; no row is changed or backfilled. The application login gains SELECT on the new table and EXECUTE on four functions by an explicit list, and no write grant on any table.

Upgrade proof and catalogue: `site-visit-upgrade.integration.test.ts` and `site-visit-authority.integration.test.ts`. Forward fix preferred: stop the two routes and issue a reviewed correction; the answer table holds records that must be kept. Removing the new objects is permissible only before any visit has been completed through it. No historical data rollback is needed.

## 0140 — site extra pricing (ENT-3c)

Additive only: two new tables, `app.extra_sor_revision` (the server-priced first revision of a schedule-item site extra, one row at most per extra, `revision=1`) and
`app.extra_pricing_basis` (how a revision's price was reached, keyed by extra and revision number, only `server_sor` for revision 1 can be written here), five routines
(`app.ent3c_record_sor_revision(uuid,uuid,text,text)`, `app.ent3c_sor_revision_guard()`, `app.ent3c_require_sor_revision_audit()`, `app.ent3c_pricing_basis_guard()`,
`app.ent3c_require_pricing_basis()`) and triggers on the two new tables only. It needs 0110 and 0122 and calls no ENT-3a routine. No column, index, constraint, policy,
grant or trigger is added to any existing table, no row of `app.variation_revision` is written, no existing object is replaced or dropped, nothing is backfilled and no existing row changes.

Standard F: the application login holds SELECT only on both new tables. The only writer is the SECURITY DEFINER routine `app.ent3c_record_sor_revision`
(owner `jobguard_migration`, `search_path=pg_catalog`, EXECUTE granted to `jobguard_runtime` by exact signature, revoked from PUBLIC and infrastructure). It takes no actor,
rate, price, outcome or time: it reads the stored origin, receipt, variation, baseline revision, schedule item and order lines of the raising transaction, decides the
order check again, prices the extra quantity alone through the merged `app.sor_line_net_pence`, and runs only while the raising command's own receipt is still processing.
The two BEFORE INSERT guards bind every writer, the table owner included, and set `content_hash` and `server_recorded_at` themselves; two deferred constraint triggers require
the raising transaction's one audit event and the basis row at commit. Row security is enabled and forced with the merged two-role tenant policy; the merged immutability
trigger rejects UPDATE and DELETE.

Forward fix only. Removing the new objects is permissible only before any priced extra has been accepted; accepted history must never be cleared by rollback. Upgrade proof:
`packages/db/test/site-extra-pricing-upgrade.integration.test.ts` (rule 9 shape). Database tests are written and run on the Mac gate; see the builder receipt for what was run here.

## 0141 — site extra evidence (ENT-3d)

Adds exactly five routines in schema `app` and their EXECUTE grants to `jobguard_runtime` (explicit list, none to PUBLIC or `jobguard_infrastructure`): `ent3d_content_sha256`, `ent3d_confirmation_document`, `ent3d_site_extra_evidence`, `ent3d_record_resident_confirmation` and `ent3d_require_site_extra_evidence`. All are SECURITY INVOKER with a `pg_catalog` search path, owned by `jobguard_migration`. No table, column, index, trigger, constraint, policy or table grant; no existing row changed; no earlier routine replaced. The only writer of a confirmation object is `ent3d_record_resident_confirmation`; it runs with the application login's pre-existing INSERT rights on the two evidence tables (none added) and carries its own authority check (`ent3a_extra_authority`).

Forward fix preferred. A confirmation object is two ordinary evidence rows, so nothing is ever deleted: to stop the feature, stop the v3 body in the application; the five routines can be replaced by a reviewed forward migration. Upgrade proof (`site-extra-evidence.integration.test.ts`, rule 9) snapshots existing rows by named columns, full column types and primary keys before this migration, applies it alone, then applies everything after it twice. The two database files ran against embedded PostgreSQL on the builder's Mac (receipt lists counts); reviewers re-run them.

### 0142 — recovery insurer money (CH-7-INSURER Round 2)

Adds the shared current payer function and append-only, FORCE-RLS payment marks with exact evidence references, timestamp pinning, immutable history and deferred audit completeness. Standard F gives runtime SELECT only; the session-bound controlled writer and job-lock helper each check authority, check/set tenant context and fix search_path. No app.job grant or merged table/column/policy/grant change. Restates only the newest 0130 review guard and 0119 effect trigger, adding Part A's insurer exclusion after paid-before and its line reason, plus F19's individual-interest message and reasonHeld release. A6 derives a required payer fact after the exact payment and job locks and cites current insurer binding/mark IDs in audit. The insurer exclusion has its own reason; F21 remains null/held under the Round 2 ruling. 0142 never rewrites saved reviews or lines; forward-fix is the rollback strategy, retaining readers and mark history. The previous application ignores marks but its insurer review inserts now fail closed; coordinate the three coordinator-owned setup-only payer additions and CI evidence before rollout. PostgreSQL fresh, upgrade, catalog and concurrency checks are NOT RUN in the builder sandbox; rule-9 upgrade proof compares named original F19/F21 rows and full column types, with identity matching and rolled-back controls. No new external alert or provider.

## 0143 — ENT-10e owner emergency windows

Replaces the held rule with the single company-owner rule, adds immutable tenant-qualified emergency windows, derives effective SSO requirements from the database clock in the six existing gates/view, and adds the administrator detail projection. The owner command creates and consumes its approval in one transaction. No existing column, command/append primitive, 0111 or 0120 object changes. Only identity SELECT on the window and EXECUTE on the checked detail routine are granted; the state routine is private. Synthetic database name remains required.

Forward fix only: never remove consumed approvals/windows or rewrite history. Deploy repository/service/transport v2 together after 0143; the previous v1 emergency requests are refused. Existing administrative switch, state and ordinary sign-in contracts remain compatible. No worker or expiry migration runs when a window closes. Upgrade and rolled-back controls: sso-emergency-owner-upgrade.integration.test.ts [U1], NOT RUN in builder sandbox.

### 0144 — CH-4 immutable work facts (partial synthetic scope)

Creates `job_work_state_event`, `job_site_source_receipt`, `job_photo_purpose` and
`job_link`, with FORCE RLS, qualified references, immutable mutation/truncate
controls and runtime SELECT only. Adds the stage-completion job-qualified key
and a source key binding tenant/job/id/completed-at/evidence-link. Stage receipts
reference both keys and validate the source/link hash; no older table gains a
policy or grant. Existing rows, types and primary identities remain unchanged.
Existing photo finalization, ready delivery versions, goods receipts, builder
origins and stage completion produce normalized facts in the source transaction.
Original receipt timestamps retain PostgreSQL microseconds; no history is backfilled.
The deterministic earliest qualifying candidate supplies first site evidence.
Audit appends run as deferred constraint triggers, after source business locks.
Evidence finalization drains them after its completion callback and last business
write, while the transaction remains open. Exact PO placement command replays
retain their first result; a new identity cannot use semantic deduplication to
admit post-lock work.

New-work triggers serialize with the existing final-account lock through its job
row. A currently closed job refuses new lock and pending-check admission.
The authenticated read routine rechecks the persisted synthetic session and job
ownership. No held command receives an execution grant or transport.
Q-01/Q-03/Q-04/Q-05/Q-06 remain held; this does not complete CH-4 or unblock MON-1.

Forward-fix with a reviewed additive migration. Do not delete events or links,
rewrite documents/money/audit, or reconstruct unknown historical site times.
Database and upgrade proofs require the dispatcher's PostgreSQL environment.

## 0150 — membership authority repair (MIGFIX-1, repair r1)

Replaces three existing identity routines (`current_memberships(uuid)`,
`invite_member(char,uuid,varchar,varchar)`, `provision_verified_challenge(uuid)`)
to exclude tenant-qualified contractor revocations. Invitation authorization and
replacement provisioning serialize with the existing contractor tenant advisory
lock (seed 54). A fresh verified invitation creates a replacement membership and
repoints its locator without changing historical membership or revocation rows.
Existing routine signatures, owners, SECURITY DEFINER settings and EXECUTE ACLs
are retained. No business rows are rewritten or backfilled.

Repair r1 completes the previously partial direct-UPDATE defense under the
dispatcher's ruling: retains all table grants, including UPDATE needed for runtime
`FOR SHARE`, and adds `app.guard_membership_authority_update()` plus one BEFORE
UPDATE row trigger on `app.membership`. The function is SECURITY INVOKER, owned
by `jobguard_migration`, with `search_path=pg_catalog`; ALL is revoked from PUBLIC,
runtime, identity and infrastructure, with no new grant. It checks the effective
caller: only the table owner or a superuser may change membership identifiers or
role, or clear/later-date existing revoked/expiry timestamps. Other callers receive
`42501`. No-ops and earlier timestamps remain allowed. Migration-owned definer
writers retain authority; locks remain usable. No table, column, constraint or
policy changes; no grant changes on any pre-existing object.

Forward-fix only: keep migration history and issue a reviewed additive correction;
never rewrite membership, invitation or revocation history to roll back. Upgrade
proof: `migfix-1-upgrade.integration.test.ts` installs predecessors, snapshots
populated rows by named columns/full types/identity/canonical text, applies 0150
alone, compares pre-existing catalog objects, checks the new guard/trigger and
actual runtime/owner/superuser behavior, then runs later migrations twice. Existing
rolled-back sensitivity controls remain. `migfix-1.integration.test.ts` covers
authority refusals, retained locks, sessions, races and replacement history.
PostgreSQL and browser execution remain pending GitHub CI after dispatcher push;
this register records implementation, not independent acceptance or release approval.

## 0151 — ledger corrections fix (MIGFIX-2)

`0151_ledger_corrections_fix.sql` replaces only the bodies of `app.post_plan_obligation`, `app.post_plan_settlement` and `app.reverse_journal` introduced by `0004_ledger.sql`; the historical migration and callable signatures stay unchanged. Adds `journal_full_reversal_uq`, UNIQUE `(tenant_id, reverses_journal_id)`, on `app.journal` so an original journal can have only one full reversal per tenant. Installation fails with SQLSTATE `23505` if historical duplicate reversals exist; the transaction rolls back without rewriting or deleting commercial history. Stop installation and report the duplicate identities for a reviewed forward fix.

The replacement routines check current owner/finance approver membership and exact financial authorization, require distinct accounts with the correct classes in the same tenant/book/currency, refuse settlement of a reversed obligation, and count only unreversed settlement credits against receivable capacity. Corrections lock the parent obligation before the original settlement, refuse a second full reversal, refuse reversal of a reversal, and require active settlements to be reversed before their obligation. No new grants, policies or RLS changes; existing routine owners, ACLs, SECURITY DEFINER/search paths and deferred balance/audit triggers remain intact. These are existing synthetic ledger ports; D02 accounting-policy approval and production charging gates remain held.

Rollback strategy: roll back a failed installation transaction. After successful installation, retain the unique key and immutable journal history and correct defects through a reviewed forward migration; do not restore the unsafe routine bodies. No backfill or historical row changes. Regression/catalog proof is in `packages/db/test/migfix-2.integration.test.ts`; populated upgrade, historical duplicate refusal and upgrade-comparison controls are in `packages/db/test/migfix-2-upgrade.integration.test.ts`. PostgreSQL execution is NOT RUN in the builder sandbox; both files and the mandatory database/migration suites must pass in GitHub CI on the final head before merge.

## 0153 — quote supersession guard (MIGFIX-4)

`0153_quote_supersession_guard.sql` replaces only the two routines installed by
0011: `app.record_builder_attested_acceptance` and `app.record_quote_disposition`.
Acceptance refuses any exact document with an immutable supersession event,
including events recorded before this migration, under the existing job lock.
Supersession advances the job revision and server update time. Both routines
recheck the existing active-owner authority before inspecting job state; exact
document/hash/version/total/send checks and accepted commercial history remain.

No GRANT statements, new tables, columns or policies, data backfill or historical
row changes. CREATE OR REPLACE preserves the signatures, owners, existing EXECUTE
ACLs and pinned `search_path=pg_catalog,app`. Forward-fix only: retain immutable
acceptance/disposition history and issue a reviewed corrective migration; do not
restore obsolete acceptance routines. A failed application rolls back both
replacements in the migration transaction.

Regression and own-step upgrade coverage are in `migfix-4.integration.test.ts`
and `migfix-4-upgrade.integration.test.ts`. PostgreSQL and browser checks are NOT
RUN in the builder sandbox; GitHub CI must execute them after dispatcher push.
The merged quote regression's decline revision (2 to 3) and expected final revision
(3 to 4) were updated per Ben, 14 Oct, coordinator chat, decision 5.

## 0154 — recovery follow-up clock fence (MIGFIX-8)

Adds one private SECURITY INVOKER trigger helper, `app.recovery_follow_up_run_fence()`, owned by `jobguard_migration` with a pinned search path and EXECUTE revoked from PUBLIC, runtime and infrastructure. Two BEFORE INSERT triggers fence `app.sandbox_run_event` and `app.sandbox_adapter_receipt` on the same tenant/run advisory key. Restates `app.guard_recovery_follow_up()` and `app.evaluate_recovery_follow_ups(uuid,uuid)` from 0115 with one run-lock statement added to each, preserving their existing checks and effects. No table, column, policy or grant change; no row backfill. Lock order is run fence before case/intent locks, with catch-up serialization and audit head last. The three-step synthetic clock and exact reminder approval remain unchanged.

Upgrade proof: `packages/db/test/migfix-8-upgrade.integration.test.ts` (`MIGFIX-8.UPGRADE`) installs everything before 0154, snapshots populated named columns, full types and primary-key identities, applies 0154 alone, checks preservation and privileges, then runs later migrations twice with rolled-back comparison controls. Concurrency and private-helper catalog coverage are in `packages/db/test/migfix-8.integration.test.ts`. Database tests are NOT RUN in this sandbox, which cannot bind localhost or start PostgreSQL; execution remains required in GitHub CI after the dispatcher pushes.

Forward-fix rollback strategy: a failed installation rolls back its transaction. After installation, preserve all history and privileges and ship a separately reviewed later migration; do not edit an earlier migration or remove the fence without a reviewed replacement. Existing repository code remains schema compatible, while deployment of the updated repositories preserves the run-before-case lock order. No new external action, operational alert or commercial release is introduced.

## 0155 — quote re-acceptance after cancellation (AUDIT-FIX-API-QUOTE, finding 5)

Founder decisions 21-23 (Ben, 14 Oct, coordinator chat): the same unchanged quote may be accepted again after its acceptance was
cancelled; the re-acceptance records fresh customer details (who, how, when), nothing copied; it is refused once any customer invoice,
credit note or payment (receipt) exists on the job.

`0155_quote_reacceptance.sql` never edits 0011 or 0153. It drops the `UNIQUE(tenant_id,job_id,document_id)` key on
`app.quote_acceptance` and adds the new immutable, RLS-forced table `app.quote_acceptance_sequence` (owner `jobguard_migration`,
`SELECT` only to `jobguard_runtime`, immutability trigger) holding `acceptance_sequence` (>0) and `replaces_acceptance_id` per
acceptance, with UNIQUE `(tenant_id,job_id,document_id,acceptance_sequence)` and UNIQUE `(tenant_id,replaces_acceptance_id)`.
`app.quote_acceptance` keeps its exact column list on purpose: its whole rows are fingerprinted into evidence packs and
recovery-message sources (`fingerprinted-row-shape.integration.test.ts`). Existing acceptances have no side row and count as
sequence 1; no backfill, no historical row changes.

`CREATE OR REPLACE` (same signatures, owners, ACLs, `search_path`) of `app.record_builder_attested_acceptance` and
`app.record_quote_disposition`. Under the existing job `FOR UPDATE` lock and `quoting` status, a document with an earlier acceptance
may be accepted again only when that latest acceptance has an `acceptance_cancelled` event bound to its id and no
`customer_invoice`, `customer_credit_note` or `customer_payment` row exists for the job; `app.quote_version` is inserted only when
absent; the new acceptance gets sequence = previous + 1 and `replaces_acceptance_id`. The cancel branch binds `acceptance_id` to the
latest acceptance. The 0153 supersession refusal, exact-document checks and owner check are unchanged. `switch_job_live` is not
replaced: it already requires job status `accepted` with the pointer on the document, which only an uncancelled acceptance can set.

Repository (`acceptance-repository.ts`): the semantic key keeps its old form for the first acceptance/cancellation and gains
`:<n>` for later ones; a retry with a known command id reuses that command's recorded key so it still replays. The active-acceptance
view reads the latest row.

Rollback strategy: roll back a failed install transaction. After install keep the side table and history and fix forward; do not
restore the one-per-document key. Known, not in scope: `app.quote_version.status` stays `accepted` after a cancel (immutable table;
the job pointer is the truth); `0107` `recovery_message_sources_current` picks the latest acceptance by `accepted_at`, which could
prefer an earlier-stated time of a re-acceptance. Proof: `quote-reacceptance.integration.test.ts` and
`quote-reacceptance-upgrade.integration.test.ts`.

## 0166 — customer billing integrity (MIGFIX-5)

Restates two installed routines in place with `CREATE OR REPLACE` (owner `jobguard_migration`, SECURITY DEFINER, pinned `search_path` and ACL are preserved; no GRANT, table, column, policy or row change):

- `app.lock_final_account(...)` (0132): after the existing variation row locks it refuses with `STALE_OR_BLOCKED_FINAL_ACCOUNT` any account whose revision lacks a currently-approved variation revision of the job, so an account assembled before the latest approval cannot be locked. An approval that commits first is visible to the lock; one still in flight makes the lock wait; a lock that commits first makes the approval a post-lock source. No new lock edge is added.
- `app.issue_practice_customer_credit_note(...)` (0028): cumulative credited net can never pass the original invoice net (`CREDIT_EXCEEDS_AVAILABLE_AMOUNT`, in SQL as well as the repository), and each credit's VAT keeps the merged per-credit half-up rule but is capped at the VAT still remaining on the original invoice.

Held, not in this migration: the legacy `issue_practice_customer_invoice` guard (open #189 / 0147 already restates it), cumulative whole-invoice VAT rounding (changes a merged expectation), and real PDF bytes (Ben, 14 Oct, decision 7: later). `PracticeInvoiceRepository.previewCredit` applies the same VAT cap.

Upgrade proof: `packages/db/test/migfix-5-upgrade.integration.test.ts` (own step on a populated pre-0166 schema, ACL/owner kept, later migrations twice). Behaviour: `packages/db/test/migfix-5.integration.test.ts`. Forward-fix rollback only; do not edit an earlier migration.
## 0157 — ENT-5 extra approval foundation

Requires ENT-3b/3c/3d (0139–0141), and their merged interfaces before landing. Two new immutable containers: `extra_approval_revision_binding`, `extra_evidence_pack`. Runtime SELECT only; no callable business writer, backfill, approval/state transition or external effect. Two insert guards verify same-extra immutable source/positive price/predecessor structure and extra subject. Existing source prices, baseline, hashes, origin and recovery packs remain unchanged.

Upgrade proof: `test/extra-approval-upgrade.integration.test.ts`; install predecessors, populate actual source/pack rows, apply 0157 alone, compare canonical named-column text and full types by original primary keys, then later migrations and runner twice. Rolled-back microsecond/type controls fail; later nullable columns, replaced functions and inserted rows pass. Builder database runs NOT RUN: sandbox cannot start PostgreSQL. Coordinator must add the two catalogue rows to the merged tenancy test; builder cannot change that pinned list.

Old code ignores the added tables. New internal assembly/binding readers fail closed with a typed migration-required error when schema is missing. No rollout enables held commands or client access. Forward fix only through a later reviewed migration; never delete commercial/audit history. No data migration or rollback deletion. Complete approval, identity, timing, scheduling and sending behavior stays HELD (contract documents list Q01–Q16).

## 0158 — ENT-5b approval chain for contractor extras
`0158_extra_approval_chain.sql` is additive (built ahead on 0157). It creates `extra_approval_request`, `extra_approval_step_fact`, `extra_approval_outcome`, `extra_client_link`, `extra_client_link_closure` and `extra_escalation_fact`: owner `jobguard_migration`, forced RLS, one tenant policy, immutable-row trigger, and **SELECT only** for `jobguard_runtime`. Writers are SECURITY DEFINER routines `app.xa_submit`, `xa_price` (also ReviseExtra), `xa_approve` (also RejectExtra), `xa_withdraw`, `xa_mark_duplicate`, `xa_issue_link`, `xa_revoke_link`, `xa_client_decide` and `xa_escalate`, plus the read-only `xa_queue`/`xa_covers`/`xa_decision_id`; each re-checks the command receipt (still processing, same actor), the stored grants and the stored state. Helpers are not runtime-callable. Names avoid the `ent5_` prefix because the ENT-5 foundation test pins that no `ent5_%` function is runtime-executable. No predecessor object changes. Proof: `test/extra-approval-chain.integration.test.ts`; contract: `docs/contracts/extra-approval-chain-v1.md`.

## 0162 — LP-1 membership/account closure (implementation present; rollout pending)

The 13 October dispatch, updated 15 October, allocated 0162. Migration `0162_membership_account_closed.sql` and its runner registration now exist. Ben decisions 40/41 authorise the bounded Q1/Q3 fixture, bootstrap and inventory changes; decision 42 authorises the four setup/expectation-only compatibility repairs in the receipt's Repair r2 section. The integrated implementation is described below; database proof and acceptance remain pending.

The implemented integrated group withdraws account/membership table writes, rejects every created_at update (including no-op), retains only the immutable locking-column UPDATE, and converts all four bootstrap rows to the separately authenticated migration owner. No business table/column/backfill is added. Existing row locks, RLS boundaries, identity routines and audit ordering must survive; real-role verification remains required.

Rollout remains pending: grant protection, seed conversion and approved fixture/comparator/inventory changes land together, after real-role and populated upgrade proofs. Do not apply a standalone revoke. Forward fixes retain the withdrawal; never restore broad runtime writes. No current deployment or real-data authority follows from this note. See docs/contracts/least-privilege-membership-account-v1.md.

### 0162 continuation — integrated implementation, 15 October 2026

Ben decisions 40/41 release the bounded fixture/bootstrap/inventory changes recorded in the LP-1 receipt. `0162_membership_account_closed.sql` is now registered after 0158. It revokes table INSERT/UPDATE/DELETE and independent write-column privileges on account/membership, then retains UPDATE(created_at) only. A migration-owned SECURITY INVOKER trigger helper (fixed pg_catalog search path; no application/PUBLIC EXECUTE) unconditionally raises 42501 in two BEFORE UPDATE OF created_at statement triggers, including no-op/empty-set UPDATE. Existing SELECT, FORCE RLS, policies, row locks, owners, values, identity routes and timestamps remain unchanged. No new table, column, backfill or callable writer. Under §11.8 R1 and decision 41, the column ACL is a proven-only reduction of broad UPDATE; acceptance still requires the real-role tests.

The four bootstrap rows now use jobguard_migration on the separate owner connection; runtime is restored before job seeding. The four authorised tenancy callbacks select a disposable non-owner fixture role; all merged assertions are preserved. LP-0 inventory withdraws six table-write entries and records two retained column ACLs. Grant protection, seeds and these reviewed dispositions must land together. Q2's audit comparator and other LP-0 tests expecting withdrawn capabilities need coordinator changes before integration acceptance; this builder does not change them.

Upgrade proof: lp1-upgrade.integration.test.ts installs predecessors, snapshots populated authority/receipt/audit and commercial source/pack rows as canonical named-column text/full types with original PK identities, applies 0162 alone, compares declared security changes, then runs later migrations twice. Rolled-back microsecond/type controls fail comparison; later scratch columns/functions/rows pass. Real-role refusal, all four lock strengths, RLS UPDATE-policy, nontransactional trigger-effect and bootstrap proofs are separate. PostgreSQL/browser execution is NOT RUN in the builder sandbox. No source inspection or non-DB check establishes acceptance.

Rollout remains gated by coordinator repairs, real PostgreSQL fresh/populated upgrade/regression checks, exact-head RED verdicts and separate acceptance. On install failure, the migration transaction rolls back. After installation fix forward while retaining the withdrawal; do not restore broad runtime authority writes. Previous service binaries retain their unchanged lock SQL; run the updated explicit bootstrap for synthetic setup. No real-data or deployment authority follows.

## 0164 — SV-7A synthetic job source storage and reads

Installs three migration-owned, FORCE-RLS immutable tenant/job side tables, exact
evidence/original relationships, private integrity triggers and one persisted-session
authorized read routine. Runtime gains SELECT only and read EXECUTE. No earlier
rows, grants, routines or fingerprinted table columns change; no backfill.
Both executable source-intake routines remain held (Q3/Q4). No CH-4 event adapter
is installed. The catch-up base includes merged CH-4/0144; its diary key/adapter
and coordinator catalogue coverage remain prerequisites. Disable the new read entrypoints
on deployment failure and use a reviewed forward fix; preserve originals/history.
Own-step upgrade proof: `test/job-sources-upgrade.integration.test.ts`; PostgreSQL
execution remains required, with later migrations applied twice and rolled-back
canonical-row/type/identity comparator controls.

## Adding a migration after MERGE-CHURN-1 (founder decision 35, 14 October 2026)

`src/migrate.ts` lists the 85 migrations merged through `0155_quote_reacceptance.sql` explicitly and never changes again;
every newer `NNNN_lowercase_name.sql` in `migrations/` is discovered and run after them in name order. A piece adds only its
SQL file (numbered above the highest migration on main) and a note at `migration-notes/<file stem>.md`; it does not edit
`migrate.ts` or this file. The runner refuses to migrate if the directory holds anything else, a listed file is missing, a new
file is numbered at or below 0155, or two files share a number. The lane check refuses an added migration that is not numbered
above every migration on its base; `node tools/migration-renumber.mjs --write` fixes that at catch-up with SQL bytes unchanged.

## 0165 — practice worker switch (PRACTICE-WORKER-SWITCH)

Requires 0138 session hardening. Adds two private control-plane tables, ten routines,
and five refusal triggers on existing tables; replaces only `app.contractor_session(uuid)`.
No backfill or existing row changes. Decision 39 permits operative, supervisor,
surveyor and client_approver targets. No runtime table grants; only EXECUTE on the
three session-authorized switch routines. Audit events must commit with the switch.

Forward fix: leave immutable records and permanent markers intact. Restore the
hardened lookup and separately revoke switch-on EXECUTE using the two statements
in `docs/contracts/practice-worker-switch-v1.md`. This disables acting and new
switches while retaining switch-off/state access. PostgreSQL execution, catalogue,
upgrade and rollback proofs require dispatcher/CI verification; they were not run
in the builder sandbox.

### 0251 — M4-9-S dependency boundary (renumbered from 0218)

Adds only `app.read_success_fee_v3(uuid,text)` and
`app.write_success_fee_v3(uuid,text,jsonb,jsonb)`. Migration directory discovery
registers 0251; the closed historical list is unchanged. No table, row backfill,
existing routine, existing grant or ledger kind changes. Runtime receives only
these exact EXECUTE signatures; PUBLIC and infrastructure receive none. Both
calls reauthenticate the persisted session/current owner and require an owned,
synthetic small-builder v3 job. Reads expose constant dependency status;
writes always refuse without business effects. No source or hidden table is read.

Deploy before using the new server route. Source-backed reviews, approvals,
derivations, journal/source tables and posting remain DEPENDENCY-BOUND on the
accepted SV-6 source/proof seam; this is not a completed fee-posting migration.
Q2 non-catch authority and Q3 negative execution remain held. Forward fix:
disable the route and append a reviewed migration; preserve any future financial
history. Never enable posting by removing the refusal alone.
