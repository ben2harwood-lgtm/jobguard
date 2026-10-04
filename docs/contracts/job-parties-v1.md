# CH-3a structured job parties

Implementation contract; synthetic construction only. D04/D07/D12 and the
real-data release gates remain proposed/held. No approval is recorded here.

`customer.v1` has one of the seven task-card types. `isIndividual(customer)` is
computed solely from `type === 'person'`. Client `isIndividual`, tenant and
provenance fields are discarded. Optional contacts/company number belong to the
private revision, never an audit payload. `site.v1` normalizes UK postcodes to
uppercase with one space, accepts digits-only UPRNs, and records an explicit
optional unit. Its deterministic JSON match key normalizes case/spacing and
uses UPRN when present, retaining the unit; the database recomputes this key on
INSERT. Exact and near matches propose reuse, which requires a human confirmation.
Different or unresolved units cannot be reused through a claimed match.

`job-parties.v1` references customer/site revisions; a null paying-party revision
means the same exact revision as the customer. Identities may span several jobs
in one tenant. Tenant-qualified revision FKs prevent foreign identity links.
One current pointer per tenant/job references one immutable binding. Binding
increments the existing job revision under its row lock; concurrent expected
revisions conflict. After live/invoiced/paid, the correction action needs a reason.
Old bindings, activation/import references, quote artifacts and issued invoice
bytes/hashes remain immutable. Revising a customer never silently changes a job.

The operational `job-parties-command.v1` accepts create/revise customer, create
site (with optional explicit reuse), bind and correct. Commands authenticate the
persisted owner membership, claim the existing durable command receipt, persist
domain/result changes, and append identities/request hashes to the audit chain as
the last business lock. Replay is one result; changed payload conflicts. These
edits create no Decision approval, outbox work, obligation or financial posting.
The import button uses the existing M1-17 synthetic consequential dispatcher;
its exact generated baseline has no historic billing or external action. No
commercial-policy decision record is approved by either path.

Next and Nest use `JobPartiesApplication` through the shared workspace seam:

- GET/POST `/api/jobs/:id/parties` maps to Nest `/jobs/:id/parties` (workspace and
  command schemas; versioned command result).
- POST `/api/jobs/:id/parties/import` maps to Nest `/jobs/:id/parties/import`
  (`job-parties-import.v1` / `job-parties-import-result.v1`). It adopts the supplied
  fictional £1,000.00 job using the saved binding. Missing details/stale binding
  refuse; source binding is checked again under a share lock in the command
  transaction. Replay retains the same job/baseline identities.
- The authenticated existing Next `/api/jobs` adapter composes
  `job-parties-list.v1`; Nest exposes `/job-parties/jobs`. The earlier filtered
  fixture reader keeps its old semantics. List customer/site labels come from
  current bindings, including captured jobs. For newly listed jobs, document/payment
  details not supplied by the existing shell projection are labelled unknown,
  rather than asserted to be absent or not due.

The workspace response also carries `currentIds` (binding, customer, paying party
and site identities behind `current`) so an editor can reload its draft from what
is saved. The Customer and site panel records what it was edited against and, when
saving, re-reads the server first. Unrelated job progress (scope confirmed, quote
saved) only refreshes the expected job revision. If the binding, the job's
live/not-live phase, or a customer or site revision the draft uses has changed,
nothing is written: the panel shows a typed conflict message, reloads the draft
from the saved details, and the user chooses again. A server-side
`REVISION_CONFLICT` (two writers on one revision) takes the same path. A quote
preview shows the customer frozen into its own document; sending a preview whose
binding is no longer current is refused (`QUOTE_CHANGED`) until it is previewed
and approved again.

The PostgreSQL live guard and switch-live/adoption routines reject missing
parties with `JOB_PARTIES_REQUIRED`. The adoption routine is also a controlled
write that validates the actor, command receipt and exact approved authorization
inside the routine. Quote preview requires a binding and locks
the job while creating the snapshot. New quote PDFs and synthetic invoice bytes
contain the party snapshot before hashing. Older artifacts have nullable new
snapshot columns and their original bytes/hashes.

Recognition uses current customer/site identity equality within the tenant.
Start timestamps come from server-recorded activation/import timestamps; known
ends come from the first server-recorded invoice. Absent historical timestamps
remain null; a correction's `updated_at` is not treated as a lifecycle interval.
This is a recognition input, not a new subscription meter or billing policy.

Retention classes are pending labels on the identity tables, inherited by their
revisions/bindings/artifact references; this task establishes no retention period
or deletion approval. Names, addresses, contacts and correction reasons stay out
of audit payloads. The audit holds only command/identity references and hashes.
RLS assumes an authenticated tenant context; it does not prove safety against a
compromised application that can select a false context or privileged credentials.

Earlier DB suites explicitly install generated party fixtures in their isolated
test databases before existing lifecycle/document commands. Only superuser test
setup can bridge missing context; runtime context and RLS attacks are unchanged.
The CH-3a integration suite never installs that fixture trigger and exercises
missing parties, upgrade/backfill, constraints, grants, replay and races directly.
No existing assertion is removed or weakened.
