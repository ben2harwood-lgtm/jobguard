# M4-22 durable CIS fixture records v1 (RED)

This adds dark persistence to the pure fixture contract in
`cis-deductions-dark-v1.md`; its statements about no persistence describe that
original module. All arithmetic, supported cases and refusal rules still come
from `appendCisFixtureStatement` and `reconcileCisFixtures`.

`CisFixtureRepository.command(context, actor, raw)` accepts strict
`cis.persist-fixture.v1` inputs: commandId, jobId and fixture. Fixture has the core
book fields except tenantId/jobId, exactly one statement, and only the verification
and payment records added by that statement. Nested tenant/job IDs are fixture
lineage validated by core against the verified context. The actor is a separate
server-supplied membershipId/identityUserId pair; SQL requires a current owner
membership. The synthetic-only session application and HTTP adapter described below reach this dark repository API.
LP-5 lifecycle dispatch remains on hold for this dark fixture operation.
It creates no commercial authorization or command receipt.

The first row contains the fixed book fields and the complete supplied VAT and
retention books as labelled fixture snapshots. Later rows contain a null fixed
snapshot and append their statement and new verification/payment lineage.
Supplying different fixed fields or source snapshots fails. There are no joins
to VAT/retention storage, customer invoices, receipts, fees or collection tables.
Evidence IDs, status records, humanApproval, certification and Decision IDs prove
no evidence verification, HMRC verification or human approval occurred.

`read(context, jobId)` reconstructs the book exclusively from stored rows and
reruns the core reconciliation. It returns separate invoice net, supplier VAT,
reverse-charge VAT, retention, CIS deduction, actual cash and remaining cash
figures; the deduction never becomes unpaid debt. Fee-eligible recovery remains
zero. Every record and read carries the synthetic environment and
`CIS_FIXTURE_LABEL`; records carry the policy version and explicit numerator/100.
Read refuses malformed/hash-altered records or rates inconsistent with core.

One transaction-scoped job lock serializes load/validate/append. A command ID is
unique per tenant, changed payload or actor conflicts, and exact replay adds no
record. Roots, successors and document references have unique indexes; core
rejects reused payments and unsupported corrections. Corrections append against
the preceding statement; immutable triggers reject update/delete/truncate.
The migration-owned routine is the only runtime entry point, operating under
FORCE RLS with saved/restored caller tenant context. Runtime has no table grants.
Wrong-job and foreign-tenant reads return the same not-found error. RLS assumes
the server minted the correct authenticated tenant context; the routine does not
independently authenticate a session. The database guards storage lineage and
status presence/validity, while the repository runs the complete core rules; this
is not a financial posting routine or an issued-document ledger. A database hash
is an integrity check, not independent evidence against a privileged rewrite.

Only the synthetic demo database is accepted. `CIS_ENABLED` remains false and
`assertCisIssueAllowed()` still refuses. No statutory work, revised-status
segmentation, provider, worker, document issue or production capability
is introduced. M4-22 stays open for adviser-approved fixtures, D02, D06 v2,
demand after the pilot, independent exact-head RED review, CI and release gates.

## Synthetic session route and practice screen

`CisFixtureApplication` binds the verified tenant context directly and supplies the
session membership/user actor separately to the repository. GET/POST
`/api/jobs/[id]/cis-fixtures` are session-only and no-store; POST requires the
trusted browser Origin and CSRF. Other environments and the page return not-found.
POST accepts the strict `cis.persist-fixture.v1` shape, with no top-level tenant,
actor or enable fields. It is a dark fixture append, not a new dispatched business
command; no command registry row, migration, grant or role is introduced. The job
mutation route is classified as post-live billing in `jobMutationRegistry`.

The first statement can use only the labelled fictional starting VAT/retention
book in `cis-fixture-server.ts`. Its source IDs, dates, amounts and fictional
approval fields are fixed. Existing stored books are preserved and remain the
source for later statements. The adapter compares the fixed source snapshot;
the client cannot supply arbitrary VAT/retention books. A GET with no readable
stored statement retains the repository's not-found response (including unknown
and foreign jobs) and supplies an identically scoped fictional starting form,
without claiming that a job exists or a statement was stored. POST still checks
the actual job and current owner through the repository routine.

The page enters one structured statement, fixture status/validity and payment
record, or an append-only correction against the preceding statement. The exact
command payload/ID is retained in browser session storage across uncertain retries
and reloads. Explicit rejection releases it for correction; uncertain responses
require the same command. Stored figures, rates and policy versions come only
from server reconciliation. CIS deductions are separately labelled, never unpaid
debt, and fee-eligible recovery is zero. Evidence, status, certification and
approval-shaped fields are fictional values proving nothing. Issue is disabled
with the reason from `assertCisIssueAllowed`. No adviser approval or HMRC submission
is claimed. Real-database route isolation and mobile-360/desktop headless browser
journeys are CI obligations; this sandbox cannot execute them. M4-22 remains open.
