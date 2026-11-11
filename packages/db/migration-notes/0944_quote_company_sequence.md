# real-quote-firm-sequence — RED repair 2

0944 is a placeholder: renumber SQL, proof and notes together at landing if
reserved elsewhere. 0941 and its proof/notes are unchanged. Forward fix only;
never reset counters, rewrite owners or grandfathered documents/duplicates.

Only two routine definitions change. CREATE OR REPLACE preserves their owners,
ACLs, fixed search paths and SECURITY DEFINER posture. The private helper uses
lp6_bound_request to validate the binding and deadline. Ownerless jobs permit
unscoped real or contractor_practice authority for that tenant, including the
two shared tenants. Owned jobs still require the exact practice credential kind
and canonical owner/session_ref comparison. Both scope fields must be NULL.

The allocator retains binding → firm advisory lock → job lock ordering and
rechecks private binding/deadline and derived ownership after waiting. Changed
or ambiguous ownership is refused without switching firm locks. Replays also
check the assignment's firm. Authorization other than TRUE fails closed.
The existing company/practice namespaces, FORCE RLS, closed table grants,
private helper execution, immutable assignment and deferred persisted-preview
requirement remain unchanged. No request binder or practice route is changed.
Historical high water, latest actually sent preference and older accepted
artifact selection remain intact. No ownership repair/backfill is introduced.

## Known limits (already true on main, not changed here)

1. Runtime-readable app.quote_document_version.reference/snapshot and
   app.action_outbox.immutable_content have tenant-level protection that already
   allows reference disclosure across firms sharing a tenant.
2. Practice ownership digests are stored on runtime-readable jobs, and the
   practice request-binding path accepts that digest as its credential.

These existing request-binding/LP-6-and-after limitations gate real customer
data. Per-firm numbering is not a database-level confidentiality guarantee.
This repair does not close these limitations or assert their insecure behavior
as an expected test outcome. D04, G1–G5, real data and launch remain closed.

## Upgrade, validation and handoff

Both numbering suites construct historical artifacts with neither allocator
migration installed, then install 0941 before 0944. The company regression
uses actual JobRepository.create and runtime QuoteDeliveryRepository.preview;
the shared-tenant real company request is rejected at 0941 and succeeds after
0944. Existing historical artifacts, PDFs/hashes, sends/acceptances and legacy
duplicates are compared unchanged. Existing concurrency, rollback, failed-preview,
allocator-only-commit and imported-lineage tests continue to run.

The successor proof carries exact predecessor/successor entries for the two
routine identities, preserving every posture field, and appends authority-path
and group metadata. Definition hashes are derived with PostgreSQL's canonical
function formatting, validated against both existing 0941 hashes; this is source
evidence only. Actual catalogue comparison on PostgreSQL is still required.
No catalogue observation, global baseline refresh or fingerprint waiver is claimed.

Hosted demo-bootstrap.ts still inserts ownerless fixed example jobs. Legitimate
company-authorized quoting allocates new references from their tenant company
sequence; existing references stay grandfathered. Practice-owned jobs retain
practice-firm numbering. Unchanged practice routes still exclude ownerless
examples; no new browser route to those examples is supplied here.

The editor-heading defect remains separate. This repair does not deploy the
demo or connect the prepared tour to authenticated customer acceptance.

Local commands, results and every unrun command are recorded in the router's
commit-message handoff. PostgreSQL and browser execution are unavailable in this
sandbox. Required acceptance remains exact-head green CI, actual catalogue and
successor-proof comparison, affected browser journeys (including 390×844), and
one independent RED review. The precheck's original unnamed “6/6” manifest
cannot be reconstructed from its report; use the explicitly named suites in the
repair order without claiming that they identify that earlier manifest.

The only pre-existing environmental exception is lp6a-practice-restore's pg_dump
item, as reported in the f2ca389c precheck. It has not been reproduced here; it
cannot excuse any other failure or become a skip.

Phase two adds one owner-only historical SQL quote fixture to the existing
lp-legacy-sandbox-fixture.ts. It uses the installed predecessor's tables and
14-argument acceptance routine, with all guards enabled, and pure document,
rendering and arithmetic helpers. It refuses to run when the allocator exists.
The shared receipt fixture selects it only when that allocator is absent;
activation, final-account, invoice, receipt, allocation, attribution and fee
writers remain unchanged. Twelve of the fourteen upgrade files need no direct
edit because their quote setup reaches this shared helper. LP3 and pre-0109
activation retain their historical switch-live calls; recovery-terms upgrade
retains runtime quoting at head with its own authenticated practice session.
The other four setup fixes retain matching session/context/digest and material
scope. No existing assertion or expected value is changed.
