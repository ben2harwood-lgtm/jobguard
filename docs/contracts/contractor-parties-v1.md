# Contractor parties v1 — CH-3b

Synthetic only. D12 v4 and D04 are proposed; G1 and ENT-14 stay closed. The
contractor is controller of client and resident contacts; JobGuard is processor.
No contact is used for JobGuard's own purposes, training or cross-tenant analytics.

`contractor-customer-link.v1` links an ENT-1 client identity to one CH-3a customer
identity. `organisation.manage` on that persisted client
is required, checked under ENT-1's tenant advisory lock. All other roles/scopes
receive the same `NOT_FOUND` as an absent client. Types must be identical:
`person`, `landlord_or_agent`, `local_authority`, `housing_association`, `insurer`
and `main_contractor`. `business` matches none. The immutable link cannot be
replaced by editing a customer or retrying with another command.

**Current revision only (integrator decision, 7 Oct 2026, CH-3b round 2).** The
revision supplied to the link command must be the customer's latest revision; an
older one is refused with `STALE_REVISION` before its type is looked at, and the
latest revision's type must equal the client's kind (`CUSTOMER_TYPE_MISMATCH`).
The revision seen at link time is kept as evidence only. Every import re-resolves
the linked customer's latest revision and re-checks its type against the client
kind: a customer later revised to another type (for example an insurer revised to
a person) refuses the import with `CUSTOMER_TYPE_MISMATCH`, writes nothing, and
the stale revision is never pinned on a job. Once the customer is revised back to
the client's kind, imports pin the then-latest revision.

`contractor-party-import.v1` binds a job and opaque work-order UUID, client,
contract, site revision, optional distinct paying-party revision, and exactly one
of a resident contact or no-resident reason. It rejects caller tenant, role,
provenance and `isIndividual` fields at every level. Contact requires a nonblank
name and phone or `.invalid` email; both are permitted. No-resident reasons are
exactly `void_property | communal_area | client_withheld`. This leaf's APIs and
SQL routines operate only in the synthetic database; no real-data route exists.

`app.bind_contractor_parties(actor, payload)` is the controlled import seam.
ENT-2 calls it in its own transaction before live entry. It requires an active
contractor membership and `organisation.manage` on the client or ENT-1's existing
`data.import` on the tenant. It does not require work-order provenance: ENT-2 owns
that provenance, work-order records, job assignment and live entry. A missing
client, contract, site or resident/reason raises `CONTRACTOR_PARTIES_REQUIRED`;
a client without its immutable customer link also raises that code. "Missing"
means absent or JSON null. For the resident it also covers a no-resident entry
without its reason, a contact entry without a contact, and a contact that lacks
a name or lacks both a phone and an email (decision recorded in CH-3b round 2:
the card requires a name plus at least one of phone or email, so anything less is
not a resident contact). Present but malformed values (blank text, a malformed or
non-`.invalid` email, an unknown reason, extra keys) raise `INVALID_COMMAND`.
The order of refusal is: active contractor membership, then completeness, then
role authority. Completeness precedes authority because a missing client leaves
no client scope to authorise against; it reveals only the shape of the caller's
own payload. Unknown revisions raise `PARTY_NOT_FOUND`.
`ContractorPartyRepository.bindInTransaction` and `.bind` accept a nullish client,
contract, site or resident at their boundary (`contractorPartyImportBoundaryV1`,
the strict import schema with those fields nullable) so that the same
`CONTRACTOR_PARTIES_REQUIRED` comes back through them, which is what
`assertContractorPartiesRequired` expects. A refusal aborts the caller's
PostgreSQL transaction; ENT-2 must roll back.
The client/tenant-qualified contract and contract-version FKs reject foreign
contracts independently of application filtering. The latest immutable contract
version is pinned under ENT-1's lock; later contract revisions leave it unchanged.

Customer is the linked customer's latest CH-3a revision at the moment of import
(see "Current revision only"); payer defaults to it; a work-order-named payer must
be another verified revision in the same tenant (that revision is not yet required
to be its customer's latest; recorded as a follow-up).
Site comes from the supplied CH-3a site revision. The routine appends a CH-3a
binding with server-written `work_order_import`, the contractor binding and its
separate resident row, replaces only CH-3a's current pointer and advances job
revision. One tenant/job and one tenant/work-order uniqueness rule enforce one
binding. Same command/actor/payload replays its exact result; changed payload
conflicts. Another command for an already-bound order returns `STALE_REVISION`.
An initial import requires a draft/quoting job at the expected revision; it cannot
rewrite an accepted/live job. No financial record or outbound action is created.

The routine creates a succeeded receipt containing identifiers only. Its request
hash is calculated by PostgreSQL from the actual JSONB payload and, for links,
the target client. It accepts no caller-supplied hash. Deferred constraint triggers
require the exact actor, effect, receipt, subject and audit hash at commit, and a
resident row for every contractor binding. CH-3a's older command guard remains
unchanged; the new contractor guard records its CH-3a binding through the
contractor binding's tenant/job-qualified FK.

For ENT-2: acquire tenant advisory lock seed 54 before any job/receipt locks;
call `ContractorPartyRepository.bindInTransaction` or the SQL routine inside the
import transaction; finish all work-order/job/state writes; then append all audit
events as the final business lock. `ContractorPartyRepository.audit` supplies the
required `contractor.parties.bound` event. The standalone `bind` wrapper is for
this leaf's direct synthetic command tests. Do not call it from inside an import
transaction, and do not take later business locks after its audit append. The
exported `assertContractorPartiesRequired` test helper is available from
`@jobguard/db` (`contractor-party-repository.ts`); importing it does not register
CH-3b's test suite. Its callback can invoke ENT-2's import refusal. Its existence is not an ENT-2 test run.

The three new tables are migration-owned, tenant-qualified, FORCE RLS and
append-only. Runtime has no raw INSERT/UPDATE/DELETE/TRUNCATE on them; it writes
through only the named controlled routines. For the restricted resident table,
runtime can SELECT only identities, timestamps and retention label, never contact
or no-resident reason. The sole content read is `app.read_contractor_resident`,
which checks persisted job access using ENT-1's existing `resident.read`.

**Held job scope:** ENT-1 cannot resolve job IDs to teams. The resident routine
therefore returns `NOT_FOUND` for unresolved scopes, including tenant-level
readers. A client/unit/team UUID cannot be substituted for a job UUID, even if
identifiers collide. ENT-2 must extend the existing persisted scoped resolver
with its job assignment, retain this denial boundary, and prove the operative on
that job and that team's supervisor cases before ENT-2 acceptance. No permission
or job-to-team table is added here. Owner, admin, finance, read_only and client
approver have no resident permission; operative/supervisor/surveyor/commercial
manager still require resolved job access. Unknown and out-of-scope IDs have
identical versioned 404 bodies. No resident count or existence hint is returned.

Next `/api/contractor/clients/:clientId/customer-link` POST and
`/api/contractor/jobs/:id/resident-contact` GET call the same server-only
`ContractorPartiesApplication` as Nest `/contractor/...`. Composition follows
ENT-1's persisted contractor session, `syntheticPool()` and browser-origin gate;
it does not route contractor principals through the small-builder PracticeAccess.
All read successes/failures use `no-store` in Next. There is no new screen or
Playwright spec; all existing e2e suites remain mandatory.

`contractor.parties.customer_linked` and `contractor.parties.bound` audit payloads
use a strict allowlist: command/effect/environment references, request hash and
operational classification. No name, phone, email, resident object, reason, free
text or raw payload. Receipts contain identifiers only. Errors expose closed
codes and never PostgreSQL DETAIL or input. No routine/service logs contacts.
Existing jobs/parties/contractor/workspace projections do not join the restricted
table; their privacy tests form the allowlist for later ENT-6/ENT-9 projections.
Existing AI capture constructs requests solely from reviewed work-source text,
never a contractor party/resident object; the API-side test captures the actual
request handed to the fixture gateway. No model/prompt/parser change or live AI
run occurs in this leaf. This is not a redaction guarantee for a human who types
contacts into another source-text workflow.

Retention label `contractor_resident_contact_d07_d12_pending` is independent of
CH-3a's client-contact/site pending labels. No period, deletion authority, legal
hold or real-data approval is invented. RLS protects within the authenticated
tenant context; it does not protect against stolen privileged credentials or an
application allowed to select a false authenticated principal.

Held by Ben, 7 October 2026, card
`jobguard-ch3b-held-clauses-2026-10-07`, exact answer "hold the two checks": DW1's
ENT-2 import-test clause and DW3's job-team positive cases. ENT-2 must prove both
before its acceptance. Independent verdict and separate acceptance remain owed.
