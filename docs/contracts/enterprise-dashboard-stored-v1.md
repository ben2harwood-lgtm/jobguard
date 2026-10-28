# ENT-9C — stored historical baseline and billed/paid reads

This adds internal synthetic storage/read applications to merged ENT-9A/ENT-9B. It supersedes their persistence and ENT-6B prerequisite holds for these seams only. No routes, screens, advisory signals, fee figures, providers or release capability are added. RED: tenant/scope and money figures. Real-history method/DPA approvals remain separate.

## Historical import

`baseline-store.v1` carries JSON/CSV content and explicit `{sourceTeamId, teamId}` bindings. The ENT-9A parser still enforces `baseline-history.v1`, 6–12 months, source uniqueness, zero-extra jobs, unknown values, input limits and synthetic data. Each declared source team maps once to a distinct existing team of the authenticated tenant. History is an observation, never a live job or commercial fact.

`EnterpriseBaselineApplication` resolves tenant and actor from the session. Import reuses tenant `data.import` (finance). Migration 0285 stores immutable normalized history/hash and tenant-qualified team mappings through a checked routine. The database serializes `(tenant, source namespace, batch ID)` imports. Identical source and bindings replay the original ID without another audit event. Changed content/revision/bindings conflict; corrections use a new batch identity. The import and its audit event commit atomically. Runtime has no raw table read/write access.

`baseline-read.v1` carries batch ID, explicit disjoint pilot/rest cohorts, method version and output format. Every read requires active session and current `dashboard.read` coverage of **all** mapped teams, including teams outside the requested cohorts; missing/foreign/out-of-scope batches produce the same typed `NOT_FOUND`. Historical data has no operative dimension. No source slug grants authority. Organization changes/revocations serialize against the same tenant gate as dashboard reads.

Reports and JSON/CSV bytes use ENT-9A's unchanged `baseline-method.reference.v1`. The input hash binds normalized history, cohorts and method; identical input hash and method produce identical output hash/bytes after a new repository instance. Both exports contain method text and all hashes. Totals are sums of full job/extra drill-downs; exact fractions and unknown-value status are preserved. Unsupported methods refuse. No computed totals are stored separately from their source.

## Stored billed/paid balances

`EnterpriseDashboardApplication.readBilling` and repository `readBilling` are internal read seams, separate from the existing captured/approved report. They return `enterprise-dashboard-stored-billing.v1`, with method, input/output hashes, exact totals, paged dimension groups and complete job/extra/immutable-source contributions. Existing ENT-9B reads retain their prior response shape.

The same SQL CTEs determine current session, tenant, active dashboard grants, jobs and attributed operatives. One covering grant must cover both the job and **all** current teams of the operative. Unrelated roles/grants cannot fill that gap. Filters only narrow this set. No raw invoice composition, free text, unrelated line IDs or other operatives' IDs are returned.

The query joins immutable ENT-6 exports, valid invoice line matches, and latest stored allocation-run line summaries in one SELECT snapshot. It never reallocates a scoped invoice subset: original-order and out-of-scope lines already participated in ENT-6's full denominator. A matched line may belong to a different job from the invoice's import job; authorization follows the exported line's job/operative. Stable run/input-hash, fact, export/revision and receipt-allocation IDs support drill-down.

Billed = invoiced net minus credited net. Paid = ENT-6 matched-extra net, including reversals. Rejected/nonpositive balances contribute zero and counts mean distinct positive-balance extras. Held allocation runs remain explicitly incomplete, including runs with no usable summary. Unmatched status facts cannot contribute. Completeness concerns matched visible invoice families, not every import or undiscovered extra. No fee engine or receipt eligibility is inferred.

The versioned method uses a **capture cohort**: the half-open query interval selects canonical capture dates; the figures show latest imported balances for that cohort, not cash movements during that interval. Dimensions are current authorized region/team/operative/client/contract, or the query period. Exact fraction sums conserve totals; whole-penny displays round their aggregate once half-even, so adding independently rounded group displays may differ by a penny. Full contributions remain available alongside paged groups. Reading unchanged stored sources produces the same hashes despite a later wall-clock cutoff.

## Verification boundary

Local focused core/application tests and TypeScript checks are recorded in the commit handoff. Real PostgreSQL tests cover stored replay, audit uniqueness, restart reproducibility, source conflicts, current/foreign team scopes, operative reassignment and revocation, catalog restrictions, fresh install and populated upgrade. They are supplied for GitHub CI; the builder sandbox cannot run PostgreSQL. CI and one independent RED review against the exact head remain required before merge.
