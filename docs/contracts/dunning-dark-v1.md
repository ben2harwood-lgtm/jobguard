# M4-16 dark dunning core v1

This is a synthetic-only domain seam for BUILD_PLAN §11.5 M4-16. D05 remains
proposed; M4-15 and the applicable G4 gate remain release dependencies. Nothing
here approves terms, sends messages, retries a payment, suspends a real account,
or adds a scheduling owner. The pure core itself needs no migration; the durable preview seam below uses migration 0480.

`dunning-reference.v1` uses fixture ticks (1, 3, 7) and a three-attempt ceiling.
These are test values, not approved commercial deadlines. Retry evaluation
advises the existing payment owner only after definite failure, within a scoped,
versioned fixture authority and its remaining limit. Pending and unknown outcomes
require reconciliation. Provider-owned retries conflict with application ownership.
All results are non-executable. `executeDunning` unconditionally refuses.

The unpaid workbench projects only invoice identity, revision, outstanding GBP,
category and suppression in `invoices`. Malformed invoice rows are skipped individually;
`skippedCount` and `skipped` report each rejected row's zero-based input `rowIndex`
and fixed `INVALID_DUNNING_INPUT` reason code, without row data, field names or
validation messages. Valid foreign-scope and paid rows are filtered without skip
diagnostics. This seam accepts only server-loaded invoice projections, never hidden
findings. Invalid scope or tick still fails the request. Every balance must be nonnegative integer pence, at
most its original amount and the shared money limit. Paid, disputed, refunded
(pending refund), reversed, cancelled and no-charge pilot facts suppress drafting
and retry advice. Before-due, pending/unknown attempts and draft/superseded final
accounts also suppress. A locked final account can be referenced through its
immutable lock, revision and source hash; it is never changed by this module.

The server integration must load authenticated scope and authoritative, current,
immutable invoice/source facts. These schemas do not establish authenticity,
settlement or PostgreSQL tenant isolation. Inputs cannot contain shadow fields,
free text or provider credentials; parse errors contain only fixed codes. Recipients
must be fictional `.invalid` mailboxes. Messages explicitly distinguish customer,
supplier and platform-to-builder categories and bind recipient, fixed factual
content, amount/currency, source, invoice revision and policy in an exact hash.
Only exact reminder Decisions are modelled; standing-authority message execution
and template variable authority are intentionally absent.

The in-memory `DunningFixtureWorkbench` produces pending Decisions, deduplicating
by both command ID and idempotency key per tenant. Different input conflicts.
Different commands for the same current invoice share one pending Decision.
Replacements require increasing invoice revision, invalidate the pending Decision,
and regenerate content on the next request. Approval checks always rebuild from
current facts, so changed amounts, source revisions, recipients or categories
invalidate approval. Approval validation also requires a server-supplied resolver
for a stored Decision matching every approval field, including decision identity,
status and expiry. Missing or malformed stored Decisions fail closed; the resolver
must never echo the caller's approval as its lookup result. Cancelled collection stays cancelled across later facts;
replaying an obsolete request cannot return an actionable stale draft. This fake
is not a durable command store, approval store, audit chain or execution outbox.
There is no HTTP endpoint and no registration into a production runtime.

The reference service policy preserves ledger, evidence and export access even
when service/collection is cancelled or suspended. It evaluates access only;
ordinary authentication and tenant authorization remain required. No deletion or
historical money mutation is provided. Production terms are still unapproved.

## Provider-automation inventory

`DUNNING_PROVIDER_AUTOMATION` enumerates the seam's disabled automation surface:

| Provider | Automation |
| --- | --- |
| Stripe | Smart retries; subscription retry schedule; invoice reminders; payment failure emails; receipts; refunds; subscription lifecycle emails |
| GoCardless | Payment retries; mandate emails; advance notices; failure, cancellation and refund emails |

Disabled means absent from this dark seam, **not** disabled in a real provider
account. There are no provider accounts/adapters/endpoints in this slice. Mandatory
provider notifications are not suppressed by this inventory: before any future
live integration, reconcile the full account-specific inventory (including new
provider features), verify settings and required notices against D04/D05 and
approved recipient/content bounds, and account for every enabled message or retry.
An unknown automation is not implicitly authorized.

## Validation and remaining work

`dunning.test.ts` exercises duplicate/replayed commands, changed-payload conflicts,
cancel-before/after and late facts, changed balances and approval expiry/revocation,
wrong tenant/job/authority references, amount boundaries and pennies, locked and
superseded final-account references, hidden/secret field rejection, no-charge and
refund/dispute/reversal suppression, retry ownership and preservation of access.

NOT built: live integrations/settings verification; approved D05/retry/access
terms; live invoice projection ingestion and execution outbox wiring; real account service mutations;
provider reservation and standing-authority execution; a workbench UI; Temporal or
Graphile scheduling; deployment. Those need merged upstream contracts and gates.
The pure seam adds no database/browser workflow; CI still owes repository checks,
and one independent Claude RED review is required before merging.

## M4-16-persist: durable practice workbench and reminder Decisions

Migration `0480_dunning_workbench.sql` adds exactly two private tenant-owned tables:
`dunning_invoice` holds administrative synthetic invoice projections, and
`dunning_reminder` preserves immutable snapshots bound to real `app.decision` rows.
Both tables have tenant-qualified job/source keys and FORCE RLS. Runtime has no
direct table grants. The sole runtime entry point is
`app.dunning_workbench(uuid,text,uuid,text,jsonb)`, owned by the migration role
with a fixed search path. It refuses outside `jobguard_synthetic_demo`, and
reuses the existing company-session/membership verifier before reads, commands
and replay. Company locking and source row locking precede the audit-head lock.
There is no production registration, HTTP route, scheduler or provider adapter.

`DunningRepository.read` loads these stored projections, reuses the core schema,
suppression and exact reminder rendering, and skips malformed or incorrectly
bound rows with the existing data-free diagnostics. Valid projections come only
from administrative fixture setup in this slice. No client can supply or replace
invoice facts, balances, a tenant or an actor through the repository command.
Actual invoice/settlement ingestion is a separate upstream integration requirement.

A request stores at most one live (pending/approved) Decision per invoice snapshot and the fixed
`dunning-reference.v1` preview policy. Its `snapshotHash` is the existing canonical
SQL hash of the entire stored invoice projection, binding balance, revision,
recipient, category, source hash, final-account lock and suppression facts.
The rendered reminder's `contentHash` remains the existing core hash; it is
separate from this storage fingerprint. An approval must name the stored Decision
and current snapshot, and appends an approved `decision_resolution`. Preview
Decisions expire after one practice hour. A dismissed or expired Decision cannot
be approved or replayed as usable. A new command can create a fresh Decision for
the same still-unpaid snapshot after expiry, dismissal or rejection. Under the
company lock, request retires terminal lifecycle statuses before looking up a
live Decision; a partial unique index enforces one pending/approved draft per
snapshot. Expiry is checked against server time on every command, including
replay; lifecycle status is a projection updated lazily, not expiry authority.
Only lifecycle status can change; snapshot fields, expiry, Decisions and
resolutions retain their immutable history. Changed source facts require a fresh
snapshot/Decision. Historical snapshots and approvals remain immutable, while
current validity is checked again on every command, including replay.

Each request/approval uses a durable command receipt and appends a hash/reference
only audit event in the same transaction. Exact command replays do not repeat
approval or audit; changed command payloads conflict. Distinct request commands
for the same snapshot reuse its live Decision. Suppressed amounts cannot create or
approve reminder Decisions. No `action_authorization`, financial posting or
outbound work is created: an approved preview always returns `executable:false`.
There is no delivery claim and no second retry owner.

The database dispatch routine is deliberately bounded to read/request/approve;
keeping checks, immutable Decision writes, command replay and audit in one
transaction requires this SQL seam. It reuses existing session, hash, receipt,
Decision and audit infrastructure rather than introducing another worker/store.
Rollback is forward-only: revoke its EXECUTE grant to disable the seam and apply
a follow-up migration preserving snapshots, Decisions, receipts and audit history.
Do not drop business evidence or edit an already merged migration.

Local validation uses `dunning.test.ts`, `dunning-repository.test.ts` and the
LP-0 catalogue comparator. `dunning-upgrade.integration.test.ts` preserves populated predecessors and existing
routine bodies/grants across 0480 and repeated migration runs.
`dunning.integration.test.ts` covers real PostgreSQL
persistence/recreation, concurrent/replayed commands, suppression, changed
balances, wrong Decision/tenant/session, expiry/dismissal, RLS/grants and audit
chain verification. PostgreSQL/migration and browser suites require CI in this
sandbox; local unit tests do not prove PostgreSQL controls. Exact-head independent
Claude RED review remains required. No live money, provider or release is enabled.
