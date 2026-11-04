# M4-21 durable VAT fixture records v1 (RED)

This bounded addition stores synthetic calculation documents only. M4-21 remains
open: adviser-approved fixtures, D02/D06 v2 templates, tax/credit-method decisions,
real issue and release gates remain held. M1 and live VAT calculations are unchanged.
A session-only synthetic HTTP route and screen now reach these stored records, as
described below. No worker or provider is registered.

`VatFixtureRepository.command(context, actor, raw)` takes a verified tenant context
and a trusted owner membership ID separately from strict `vat.fixture-append.v1`
input: `commandId`, `jobId`, `book` (the core book's fixed fields without tenant,
job or documents), and one core `document`. There is no tenant, authorization actor
or activation flag in the command body. Eligibility's human-fixture actor/evidence
references describe fictional assertions, not authorization or verified tax facts.
This is a fixture-local idempotency command, not a dispatcher/commercial command;
it creates no command receipt, Decision or financial authorization. Its fixture-storage
HTTP mutation is classified as post-live billing in the web mutation registry; this
classification grants no commercial issue authority.

One private FORCE-RLS table stores each document, its complete fixed book fields,
actor, command identity, support matrix version, synthetic environment, fixture
label and canonical SHA-256. The single runtime routine accepts read, lock and append
operations only in `jobguard_synthetic_demo`, checks the supplied tenant against
transaction context, and checks current owner membership for writes. The repository
holds its transaction-scoped tenant/job advisory lock while loading history,
validating the complete proposed book through `reconcileVatTreatmentFixtures`,
and appending. No arithmetic or tax policy is reimplemented in SQL. The routine
is the storage boundary (fixed fields, hashes, uniqueness and linear history);
the repository is the domain-validation boundary. As with existing
verified-context repositories, this does not protect against a compromised runtime
that can select a false tenant context, or a privileged database administrator.

A refused core calculation stores nothing. No default treatment or 20% fallback
exists. Fixed book fields must equal the first row. Database uniqueness protects
command IDs per tenant and references, ordinals and previous IDs per job, including
competing appends to an empty book. Exact normalized command replay reuses its row;
changed content, actor or job conflicts. A replay returns current stored history,
which may include later appends; it does not create another row. SQL checks the
stored hash before returning rows. Runtime has no direct table privileges; update,
delete and truncate triggers reject changes even through owner fixture credentials.

`read(context, jobId)` rebuilds the book from stored rows and recalculates through
core. Foreign, absent and empty books return the same typed not-found. Every record
and read has `VAT_FIXTURE_LABEL` and environment `synthetic`. Net, VAT treatment,
supplier VAT, customer-accounted reverse-charge VAT, gross, retained principal and
expected cash remain separate. DRC never becomes a discount or waived debt.
`interimCertificationId`, `retentionProfileId` and `retentionReleaseId` are explicitly
**fixture lineage, never authority**. No join authenticates them, and
`reconcileVatRetentionFixtures` is not called. Core's existing candidate cumulative
credit method is stored without choosing the pending legal method.

`VAT_TREATMENTS_ENABLED` remains false and `assertVatTreatmentIssueAllowed` still
refuses. No invoice, receipt, fee, collection or ledger table is touched. No tax,
security, adviser or release approval is claimed by these synthetic records.

Local unit/protocol tests cover DRC outputs, credits, replay conflicts, changed fixed
fields, missing/unsupported/conflicting eligibility, strict inputs and corrupt reads.
The real PostgreSQL integration suite covers persistence, races, replay, immutability,
tenant visibility and the synthetic database gate; it must run in CI, together with
fresh/upgrade migration proofs, LP-0 catalog, tenancy and existing mandatory suites.

## Session entry and read screen (bounded continuation, 4 Nov 2026)

`/jobs/[id]/vat-fixtures` and GET/POST `/api/jobs/[id]/vat-fixtures` are
synthetic_demo-only (not-found elsewhere), with no-store responses. Server-only
composition uses the workspace export. The application binds the verified session
context directly and passes the current session membership ID, never an eligibility
actor, to the repository's owner check. The identity bridge checks origin, CSRF and
membership; POST requires an explicit trusted browser origin. GET preserves the
repository's read permissions; non-owner writes preserve its typed refusal. Foreign,
unknown and empty books share not-found. POST still proves the job/current owner in SQL.

The structured form requires explicit treatment, eligibility and candidate tax basis.
The first document supplies book fields; later documents display fixed fields read-only
and send them unchanged. Existing multi-treatment histories retain their group count.
Core alone calculates/validates; the screen renders its separate document movement and
cumulative figures in GBP pence, matrix version and draft wording. Core's issue assertion
supplies the disabled issue reason. Credit method, interim/retention lineage and all
eligibility remain fictional, unapproved fixtures. No invoice or credit note is issued.
The complete command is saved before POST in per-job/company-membership session storage.
Network/5xx uncertainty, including reload, retries that identical command and payload;
a definite 4xx refusal permits correction with a new command ID.

Local evidence is in the router commit message. CI must run the new PostgreSQL route
test (persisted sessions, tenant/role refusals, no new financial or outbox rows) and
headless mobile-360/desktop spec (repository-seeded job, form refusal, lost response,
unchanged replay, reload, 44px controls and no sideways scroll). Neither was run in
this sandbox. Green CI and independent exact-head RED review remain required;
adviser fixtures, templates, legal credit method and issue stay held. M4-21 stays open.
