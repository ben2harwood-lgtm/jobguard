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

## 0104 — CH-1 job activation terms

Expand-compatible v3 synthetic activation: immutable tenant/job terms with FORCE RLS, qualified quote/document/track keys and controlled inserts, no historic financial effects, existing parties/track/watchdog transition guards. Existing v1 rows and activation routines are untouched. The job baseline shape additionally permits v3 with a null recovery cap. A new session-owned saved v1 sample supports historic regressions; its marker cannot be selected or changed by runtime SQL. No data backfill is required.

Upgrade from 0097 applies only additive objects and expanded checks; re-running the migration runner is idempotent. Forward-fix is preferred. Rollback requires disabling v3 entry first and confirming there are no v3 activations or saved v1 samples before removing new triggers/functions/table/columns and restoring the previous checks. Never delete activated commercial history to roll back. No production fees are enabled.
