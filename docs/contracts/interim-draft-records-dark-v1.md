# M4-18 durable interim draft records — dark v1

This is partial M4-18, synthetic storage only. `INTERIM_APPLICATIONS_ENABLED` remains
false and `assertInterimDocumentIssueAllowed` always refuses. No route, worker,
composition, provider, invoice issue, cash posting, fee or collection is enabled.
D06 templates, D02 tax and the remaining release gates stay held.

`InterimDraftRepository.command(context, actor, raw)` takes a genuine verified
context and an authentication caller's synthetic session digest as actor.
The strict `interim.persist-command.v1` payload contains commandId, jobId and one
core record without tenantId/jobId. Tenant identity is bound by the repository;
SQL resolves the current owner/admin membership from the persisted session.
No caller-supplied actor, cash fact or enablement option is accepted. An explicitly
synthetic receipt's amount is fixture data, never evidence of actual cash.

One transaction locks the tenant/job book, loads and validates every stored row,
runs `appendInterimDraftRecord`, then appends. The job lock survives the routine
return until commit. The sequence check prevents appending against an older book.
Commands have tenant-wide unique IDs; replay must bind the same job, actor and
normalized content, while a changed payload conflicts. Record IDs cannot be reused
with another command. Hashes use the existing canonicalJson/SHA-256 utility and are
checked on reads. The database stores the record kind and an independent sequential
book revision; any document revision remains in the core record.

`read(context, jobId)` returns the stored book, metadata and
`reconcileInterimDraftBook` result. The verified context is the read boundary;
commands additionally revalidate the persisted synthetic session. Runtime has no
direct table grants. The single fixed-search-path routine is synthetic-database
only, with FORCE RLS and tenant context restoration. SQL enforces storage identity,
source ownership, sequencing and immutability; the trusted server repository
performs the domain rules using core. Direct routine access is not a public API,
a source of commercial authority or a substitute for core validation. Reconciliation
fails closed on malformed or impossible stored histories.

Existing source mappings are deliberately narrow: baselineSnapshotId maps to
quote_version; baseline commercialRevisionId maps to scope_revision and the same
scope_identity; variation commercialRevisionId maps to variation_revision and its
variation/sourceDocumentId and scope_identity. Each must exist for this tenant/job.
These checks verify ownership, not approval or commercial value. Schedule IDs,
schedule-line IDs and approvalDecisionId references have no corresponding approved
interim-source contract; every row and read therefore carries
`fixture_lineage_not_authority`. Nothing promotes these references into authority.
Every row and read also carries `SYNTHETIC DRAFT - NOT FOR ISSUE`.

PostgreSQL CI must prove real concurrent serialization, source rejection, replay,
FORCE RLS, grants, immutability, fresh/upgrade migration catalogues and the proof
inventory. An independent exact-head RED review is required before landing.

## Session screen adapter (partial M4-18)

This extends the original no-route/no-composition boundary only for synthetic
session access. All commercial gates remain closed.

The synthetic-only `/jobs/[id]/interim-drafts` screen and session-only GET/POST
adapter expose the stored book without enabling issue. The first current membership
returned by the authenticated identity session selects the company; request tenant
headers and body authority fields cannot select it. The application binds the
verified context directly, and passes only the server session digest as actor.
POST checks the trusted origin and session CSRF token through the principal bridge.
The strict repository command remains the input boundary; its job must match the URL.
All replies are no-store, other environments return not-found, and typed repository
and domain refusals retain their codes with plain messages.

The screen separates every record kind and renders server reconciliation without
calculating value. Its synthetic JSON record editor preserves the exact pending
command in session storage across uncertain retries and reloads; definitive HTTP
refusals allow correction with a new command. The issue refusal comes from
`assertInterimDocumentIssueAllowed`. No Decision, grant, migration or commercial
posting is added. CI must run the new real-PostgreSQL isolation/side-effect test
and the headless mobile-360/desktop stored-book journey; neither can run in the
restricted builder sandbox. M4-18 remains open for issue, templates and tax.
