# M4-9-S — synthetic success-fee posting

## 30 October 2026: migration 0489 (recovery qualification and compensation)

This slice extends 0392/0393. Approved builder-opened withheld-payment case
receipts from the existing M4-8-S `recovery_case_allocation` writer join catch
sources in the same cumulative calculation. Each source retains its allocation,
case, authorization and a hash of current proof, eligibility, terms, movement
and reversals. Current approved case eligibility, settled identified money
received after opening and terms approval, matching finalized evidence and
unrevoked allocator authority are required. Insurer proceeds stay excluded.
Missing reversal allocations, invalidated proof and changed approvals fail
closed. Supplier qualification and catch reassessment remain outside this slice.

The exact statement and hash now support a signed `deltaPence` and, only for a
negative delta, `compensationLinks` containing original journal IDs and positive
amounts to reverse. Authorization records bind the absolute magnitude under the
existing nonnegative authorization contract; the signed amount and original
journals are bound by the exact statement hash. Balanced negative journals link
to earlier positive journals of the same tenant/job, newest first, with an
aggregate reversal limit on each original. A reversal spanning two postings
creates two journals; result `journalId` identifies the first, while the statement
lists every original. Zero still retains its derivation without any journal.
Historical statements remain valid under the extended strict schema.

F10/F11: 32,000p qualifying principal gives 3,200p; 282,000p gives a cumulative
28,200p and a 25,000p delta; returning to 32,000p posts −25,000p against the
original 25,000p journal. Exact approval, revision checks, replay and the same
synthetic source fence apply to every direction. No external refund is executed.

No table/routine ACL, role, RLS policy or runtime INSERT grant changes. The same
six private tables and existing checked entrypoint signatures are retained, so
LP-0, entitlement and SERIOUS-B5 expectation identities are unchanged; inventory
call metadata includes the existing payer-type helper. The source ledger adds a
nullable, job-qualified recovery allocation reference alongside the existing
catch references, with an exclusive shape constraint and per-derivation source
uniqueness. Posted predecessor facts are preserved. Deploy by forward migration;
roll back behavior by disabling the route or a reviewed forward fix, never by
removing financial history. PostgreSQL migration/behavior tests and independent
RED review remain required; this is synthetic principal only, without fee VAT,
providers, collection or production activation.


## 29 October 2026: migrations 0392–0393 (predecessor slice)

The current stacked SV-6 review and M4-8-S v1 producer replace the historical
source dependency described below for **catch-only positive/zero posting**.
The reference policy remains synthetic; this is not production approval.

The existing strict review/approve intents are unchanged. GET remains a constant
availability projection: before lock it is dependency-bound; after lock its state
is `catch_review_available`, without a count or qualification claim. POST review
reconstructs every latest attribution from its real stored sources and requires
its exact, current, unrevoked `approve_review` Decision/resolution/authorization.
No client amount, proposal or eligibility flag participates.

Review saves `success-fee-statement.v1`: exact rational Q, cumulative F, prior J,
nonnegative delta, posting revision, assessment IDs/source hashes, SV-6 review
authorizations and immutable case-allocation IDs. F uses the existing SQL
`ef_round_half_even(Q.numerator, Q.denominator * 10)` and repository output
validation uses the unchanged core cumulative-fee kernel. Both use
`commercial_half_even.v1`. F13 is Q 80,000p -> F 8,000p. No second allocator exists.

Approve requires the saved statement hash, actor, unexpired review and identical
current source composition/revision. It creates the exact fee Decision resolution
and authorization bound to the statement, ledger recipient, delta, GBP and v3
policy. Derivation, source links, journal, paired lines, command receipt and audit
commit together. Zero retains a derivation and has no journal. Concurrent approvals
serialize; a different command at a stale revision refuses. Durable command replay
returns the original result with `replayed: true` after current owner/session access.
It authorizes no new effect, even if the old sources subsequently change.

All six tables are immutable and FORCE RLS with owner-only DML. Composite FKs bind
sources to the exact job, assessment subject and stored receipt allocation. Deferred
checks require exact derivation arithmetic/authorization, contributing sources,
one positive journal or none for zero, and a balanced two-line journal. The
runtime retains only the two existing checked EXECUTE grants. The journal links
its derivation; a negative journal also requires an original journal reference.

The synthetic writer deliberately uses coarse table locks before its existing
case/receipt/job locks to exclude phantom refunds, credits, feed changes, evidence
invalidation, disclosures and source/review writes. Authorization writes serialize
first. Source writers can deadlock; the whole fee command rolls back and returns
`SUCCESS_FEE_SOURCE_CHANGED` (409), requiring re-review. This trades synthetic
throughput for a simple source-race fence and makes no production capacity claim.
Audit is appended last; no business lock is acquired afterwards.

Q2 non-catch qualification and Q3 negative/reassessment/compensation execution
remain dependency-bound. In particular, this change does **not** execute a
linked reversal: that would contradict the explicit Q3 hold. It never edits an
old journal. Unknown/non-contract actions retain `INVALID_SUCCESS_FEE_COMMAND`.
Missing source/lock stays `SUCCESS_FEE_DEPENDENCY_BOUND`; missing SV-6 review is
`SUCCESS_FEE_REVIEW_REQUIRED`; changed proof is `SUCCESS_FEE_SOURCE_CHANGED`;
stale statements/revisions are `SUCCESS_FEE_STALE`. These last three and command
identity conflicts return 409. Existing access and invalid-command codes remain.

Rollback strategy: forward fix only. Do not remove facts, edit old migrations,
or rewrite issued statements or journals. No provider, collection or production
activation is installed. PostgreSQL, populated-upgrade and browser execution
remain GitHub CI gates; local compilation and unit tests are not that evidence.

## Historical boundary (0302; superseded only for the current slice)


28 October 2026 catch-up: the migration is now `0302_success_fee_v3.sql`
(previously 0218, then 0251), with unchanged SQL bytes. The 0218 references
below describe its original number; deploy 0302 for this branch. Existing
dependency refusals and release gates remain unchanged.

24 October 2026. Reference policy remains proposed. This is an incomplete,
dependency-bound implementation, not a fee-posting capability or acceptance of
M4-9-S. The dispatch permits building ahead on `dc9dbfba` (decision 74).

The inspected SV-6 implementation has immutable attribution storage/history;
`app.assess_recovery_attribution(uuid,text,jsonb)` always raises
`RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND`. Its private append routine accepts
storage documents, not authoritative source-backed qualification. Neither an
administratively inserted document nor passing storage tests closes that gap.
No accepted source adapter is callable from this slice. SV-5's completed source
chain and SV-6's qualification/review/audit seam remain dependency-bound.

## Built boundaries

`success-fee-command.v1` is a strict intent union:

- `review`: `commandId`, `expectedPostingRevision` (safe nonnegative integer).
- `approve`: those fields plus `reviewId` and lowercase SHA-256 `statementHash`.

Both require `version` and `action`. Neither accepts tenant, actor, mode, rate,
Q, J, qualification, approval facts or money. The approval intent does not
create or approve a Decision, reserve an identity or authorize execution.
Reassessment and compensation actions are absent.

The pure `success-fee-proposal.v1` calculation consumes already established
exact Q, prior posted principal and a compensation derivation ID when needed.
It calls the existing cumulative kernel with the fixed v3 1/10 rate, rounds
once half-even and returns F and F−J. It is labelled `synthetic_reference`,
`proposed: true`, `productionEnabled: false`, `realExternalActions: 0`.
It performs no receipt allocation, eligibility assessment, source gathering,
authorization, posting or compensation. No proposal enters the HTTP boundary.
Pure F1–F23 arithmetic is not persisted fixture qualification.

`GET /jobs/:id/success-fees` (Nest) and
`GET /api/jobs/[id]/success-fees` (Next) share the application/repository path.
The strict `success-fee-availability.v1` response contains only job identity,
synthetic mode, `state: dependency_bound`,
`dependency: accepted_attribution_source_adapter`, `productionEnabled: false`
and `realExternalActions: 0`. It contains no source manifest, statement,
history, counts or money. It does not represent Q as zero.

POST validates review/approval intent after access and returns 503
`SUCCESS_FEE_DEPENDENCY_BOUND`. It never reports an approval or posting as
successful. Next defers JSON parsing until access succeeds; Nest uses its
normal body parser before controller entry. Neither transport exposes sources
on parse failure. Both reject query fields and tenant-selection headers
`x-tenant-id` / `x-jobguard-tenant-id`, and use `Cache-Control: no-store`.
Errors are bounded codes: invalid command 400, unauthenticated 401, forbidden
or wrong mode 403, unknown/unowned application job 404, dependency 503.
Unknown infrastructure failures are not misrepresented as business refusals.

## Database boundary and privilege inventory

0218 adds exactly two migration-owned SECURITY DEFINER routines with fixed
`search_path=pg_catalog`:

- `app.read_success_fee_v3(uuid,text)`
- `app.write_success_fee_v3(uuid,text,jsonb,jsonb)`

Runtime receives only EXECUTE on these exact signatures. PUBLIC,
infrastructure and shadow receive no new privilege. No table, policy, role,
existing function, row, backfill or existing grant changes. Consequently there
are no new tenancy or contractor-upgrade table rows to catalogue. LP-0 adds
the four exact ACL/owner keys and two routine records; its existing recovery
money authority path documents both entrypoints. The serious-B5 snapshot adds
only the two exact routine identities. No freeze is loosened.

The reader checks the synthetic database, valid transaction-local tenant,
persisted current session, active unexpired owner, exact owned job, small-builder synthetic track and v3 fee policy. The writer calls that same
checked reader before its unconditional dependency refusal, including direct
SQL and repeated-command attempts. There is no business lookup/replay before
access, no source read, no business lock, no audit-head acquisition and no
network action. Repository code passes the existing context whole to
`withTenant` and the existing practice-material pool boundary.

RLS only protects queries within a correctly authenticated tenant context;
this does not protect against stolen privileged credentials. No new business
row exists to which FORCE RLS could apply in this migration.

## Unbuilt work and acceptance

The six review/derivation/source/journal/line/command tables, relational proof
links, canonical statement hash, exact Decision/action authorization, durable
source-event identity, replay, cumulative posting locks, source drill-down,
balanced journals, deferred validation and audit atomicity are dependency-bound.
They must bind to the actual accepted proof/attribution seam before construction;
no guessed SQL signature, JSON UUID or private fixture replaces it. Refusal
coverage here is not successful positive/zero posting, persistence, race or
compensation acceptance. An unchanged proposal can calculate delta zero;
no retained zero derivation is claimed.

Q2 remains held: no non-catch qualification bridge, supplier-credit consumption
authority, v1 eligibility workaround or omission of unresolved Q. Q3 remains
held: no negative executor, reassessment command, worker, schedule, trigger,
standing financial authority or refund. Arithmetic of negative deltas remains
covered. UI is parked: no screen, CSS, component, browser fixture or browser
assertion is changed. Fee VAT, numbered statements, real charging, payment
rails, subscriptions, contractor fees and AI changes remain excluded.

## Deployment and forward fix

The migration is discovered automatically; do not edit the closed historical
migration list. Deploy 0218 before the new route. Disable the route if needed;
append a reviewed migration to evolve it. Never enable posting merely by
removing the dependency refusal. Preserve all future financial history and
use authorized linked corrections once their authority is issued. No existing
v1 behavior or disabled generic fee-posting port is changed.

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

PostgreSQL tests are authored for reviewer/CI execution; local scripted SQL
boundary and schema tests are not PostgreSQL proof. Full acceptance requires
the dependency work, issued held authority, CI database/browser suites,
independent verdict on the dispatcher's exact commit and separate acceptance.
