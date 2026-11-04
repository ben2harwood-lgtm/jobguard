# 0871_accounting_export_route_change — dark stored accounting route confirmation

M5-2 partial slice; RED (money records and tenant isolation), NOPR.
Adds one private append-only FORCE-RLS table, a session-checked route operation,
and one private route validator used by the existing export routine. No role or
table grant is added. Runtime gains EXECUTE only on the checked route routine.
No existing table shape changes. Existing routine ownership, ACL and operation
behavior are retained, with route validation for new exports and prevention of
Decision reuse between the two approval boundaries.

Destination authority reuses the administrator-owned synthetic fixture rather
than adding connection administration or a provider interface. Exact scoped
route/mapping proposals and persisted historic entries are hashed with the
existing canonical database hash. New source fixtures must match the confirmed
route and mapping; existing ledger rows bypass new-route selection and keep
normal stale-source, actor, consent, reconciliation and no-repost checks.

Forward fix: keep history and issue a new exact-scope preview/Decision after
reconciliation. Never delete a change or edit an existing mapping/ledger entry.
A schema rollback requires stopping this dark capability and a separately
reviewed migration; no destructive down migration is provided.

Verification and handoff evidence are recorded in the router commit-message
file requested for this run and the eventual PR description. CI must execute
accounting-export-route-change.integration.test.ts, existing accounting export
and upgrade suites, migration/catalogue/RLS/privilege/audit suites, and all
required repository checks. The integration test covers populated predecessor
preservation, exact old dispatcher body preservation except two named additions,
repeat migrations, concurrent confirms, command replay, Decision reuse,
expiration, stale consent/connection/mapping, tenant/company/job boundaries,
actor injection, pending/unknown holds, append-only grants and historic IDs.
No database, browser or provider was run locally. This does not finish M5-2.

LATER / SIMPLICITY — `packages/db/src/accounting-export-repository.ts` and
`apps/api/src/accounting-export.contracts.ts`: a later contract slice could move
the shared mapping/scope schemas into a common contract package. That would
reduce drift between the two boundaries. This bounded slice keeps the API and
sandbox untouched as instructed; the suggestion does not block it.
