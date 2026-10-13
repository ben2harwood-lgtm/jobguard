# CH-4 work facts v1 — partial synthetic contract

Issued 13 October 2026. Base `269874640468a6e1dfdfed63edd4ce187d1d9dbb`.
Migration `0144_job_work_state.sql`. The issued main includes 0140 site-extra
pricing, contrary to the draft's statement that the runner ends at 0138.
The migration appends after 0140; its other reservations are unchanged. During
the build, origin/main advanced to `6659fb58791ec22588948f005b2bd4f6b299fa48`
with merged ENT-3b/0139 and additive contractor/shared registrations. CH-4 does
not consume those visit contracts. The dispatcher must retain those current-main
registrations while merging this uncommitted diff; no rebase was attempted here.

This slice supplies immutable source facts, event/link/photo-purpose storage,
existing-source guards and authenticated persisted reads. It supplies no work
interval, counting day, capacity check, billing period or monetary correction.
Storage support for lifecycle events grants no command permission.

## Issued technical dispositions

- Q-02: site facts remain `watchdog_live_only`. There is no new CH-4 mutation
  command, registry key or public mutation routine in this slice. Existing
  commands produce facts through transaction-bound triggers. A future new key
  needs the coordinator's separately reviewed shared-harness prerequisite.
- Q-07: the refusal is an offer to use the ordinary job path, with the exact copy
  `Start a linked job for this customer and site`. It creates no successor.
- Q-08: merged CH-2/CH-3a/SV-4 foundations only; no open ENT branch dependency.
- Q-09: no invented times, history backfill or retrospective reconstruction.
- Q-10: the issued number is 0144. The dispatcher owns the build-plan ledger.
- Post-lock mapping: a separate HTTP 422 for
  `POST_LOCK_WORK_REQUIRES_LINKED_JOB`; the existing 409 enum is unchanged.

## Held scope

Q-01 holds reopening, earlier-lock and already-running/completed-check
consequences, including use/completion/reveal/fee implications. Only new lock and
new pending-check admission while currently closed are guarded here.
Q-03 holds new snagging admission, its authority and any post-live exception.
Q-04 holds deadline/DST/endpoint semantics and complete interval projections.
Q-05 holds cancellation's effect on an already-ended interval and billed days.
Q-06 holds finish/cancel/close/reopen/resume/link command permissions and their
execution, runtime receipts, replay and transports. No such routine or route is
created. Pure schemas and explicitly labelled fixture storage prove structure
only. Safety disclosure/reveal routines are unchanged.

## Facts and ordering

All timestamps at the domain/read boundary are canonical UTC strings with six
fractional digits. Facts are ordered by original server fact time and deterministic
identity, independently of processing time. No Date roundtrip supplies a stored
fact timestamp. Photo receipts use the upload's original PostgreSQL timestamp,
including microseconds that an existing evidence adapter's Date value can lose.

Every qualifying immutable photo, ready original delivery version or goods
receipt is a first-evidence **candidate** and one site-activity effect. The first
result is the earliest candidate ordered by `(fact_at,id)`. Later arrival of an
earlier source does not require rewriting a chosen historical event. A delivery
version and goods receipt naming the same supplier document share a received-fact
key, so they produce one effect. Builder captures and stage completion create
site-activity events only; `final_review` and `jobguard_catch` do not.

Photo classification uses stored original identity, verified upload, exact hash
and object version and an explicit stored evidence type (`pre_cover_photo`, `completion_photo`,
`excavation_photo`, `electrical_certificate`; source: `packages/core/src/proof.ts`
`proofEvidenceTypeSchema`). MIME alone is never a photo classifier.
Pending/rejected/preview/invalidated-at-processing sources do not qualify.
Photo-purpose metadata is immutable and cannot relabel a recorded progress source
as snagging. Its admission mechanism remains held.

Cancellation references an outstanding finish marker. Source-driven cancellation
appends before the source's activity candidate, preserving the marker. An older
received fact processed later does not cancel a marker later in original fact
order. This says nothing about past intervals or monetary correction. Close
requires exactly an issued reason and a nonblank note; audit records identities
and hashes only. Reopening references the current close record. These constraints
are fixture-tested storage, never new runtime command authority.

## Storage and trust

Four new business tables are migration-owned, FORCE RLS and SELECT-only to
runtime. No new direct write privilege is granted. Private trigger/helpers have
no public/runtime/infrastructure/shadow execution grant. The sole new public
routine is a read that rechecks the persisted practice session, membership,
owned-job boundary (including the existing adoption semantics), track and mode.
It receives the existing stamped context per call, not a recreated or saved one.

The migration owner has an additional tenant-bound SELECT policy on the older
`stage_completion` table, allowing source validation under FORCE RLS. Its existing
runtime policy and grants remain intact. The lock admission trigger dispatches
by table before reading `status`, which exists only on `final_account_lock_check`.
Held signal/link writes produce no CH-4 receipt, event, purpose, link or audit
write. Source processing does not consult shadow content; otherwise-identical
source facts produce identical CH-4 facts regardless of private signal links.

Existing source commands retain their existing authority, hashes and replay
stores. Added triggers check tenant context, serialize on the job row and recheck
an owned practice job's persisted session after a wait. RLS and these seams rely
on the existing authenticated context/source boundary; they do not establish
safety against a compromised login or a false tenant selection by the application.
Excluded billing/catch facts return before the site-source lock helper. Source
audit is deferred to transaction end; it acquires only the audit head,
with business locks already held. A plain-read source-authority recheck after
audit insertion covers waits through audit append without adding a business lock.
Source receipts, events and audit roll back
with their source effects. Source events do not schedule work or create money.

Links preserve exact party bindings and common customer/site/payer identities,
require a locked predecessor, reject self-links/cycles and differing direct
practice-session bindings, and serialize graph inserts. Link admission and the
full adopted-job authorization journey remain held under Q-06. They never copy
baselines or activate jobs. Linked reads reveal only both directly session-owned
endpoints; extending link admission to adoption awaits the held command contract.

`GET /jobs/:id/work-state` and the matching Next route read persisted events,
locks and links using the shared application. Reads are synthetic and no-store;
no provider adapter is initialized. New source failures map separately to 422.
No UI or held mutation appears in the transport or OpenAPI.

## Upgrade contract (verbatim)

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

The comparator uses `row_to_json(t)::text`, snapshots named columns and their full
`format_type` values, requires pre-existing rows and primary keys, and matches
only original identities. Rolled-back controls exercise a microsecond mutation,
a retype, a later nullable column/function replacement and a later insert.
Repairs use additive forward fixes, preserving all immutable history.

## Coordinator-owned prerequisite

The existing `tenancy.integration.test.ts` catalog/owner lists require four new
rows each. This slice leaves that merged file unchanged under rule G. The exact
before/after lines are in the builder receipt. PostgreSQL/browser and umbrella
suite execution, independent verdict and separate acceptance remain outstanding.

OpenAPI source metadata is additive (one read and source 422 responses). Generation
was refused by the sandbox's tsx IPC `listen EPERM`; the JSON artifact is unchanged
and the dispatcher must regenerate it and run `openapi:check`. The root lane gate
also refused the initial no-commit self-comparison. Neither gate was bypassed.
