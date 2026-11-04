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
membership. This is a dark repository API, with no HTTP/application registration.
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
segmentation, provider, screen, worker, document issue or production capability
is introduced. M4-22 stays open for adviser-approved fixtures, D02, D06 v2,
demand after the pilot, independent exact-head RED review, CI and release gates.
