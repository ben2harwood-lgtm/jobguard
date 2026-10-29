# M4-9-S — synthetic success fee boundary (0302)

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
