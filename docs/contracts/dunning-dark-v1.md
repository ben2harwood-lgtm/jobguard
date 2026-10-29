# M4-16 dark dunning core v1

This is a synthetic-only domain seam for BUILD_PLAN §11.5 M4-16. D05 remains
proposed; M4-15 and the applicable G4 gate remain release dependencies. Nothing
here approves terms, sends messages, retries a payment, suspends a real account,
or adds a scheduling owner. No migration or dependency is needed.

`dunning-reference.v1` uses fixture ticks (1, 3, 7) and a three-attempt ceiling.
These are test values, not approved commercial deadlines. Retry evaluation
advises the existing payment owner only after definite failure, within a scoped,
versioned fixture authority and its remaining limit. Pending and unknown outcomes
require reconciliation. Provider-owned retries conflict with application ownership.
All results are non-executable. `executeDunning` unconditionally refuses.

The unpaid workbench projects only invoice identity, revision, outstanding GBP,
category and suppression. Every balance must be nonnegative integer pence, at
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
invalidate approval. Cancelled collection stays cancelled across later facts;
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
terms; durable DB/RLS/command/audit/outbox wiring; real account service mutations;
provider reservation and standing-authority execution; a workbench UI; Temporal or
Graphile scheduling; deployment. Those need merged upstream contracts and gates.
The pure seam adds no database/browser workflow; CI still owes repository checks,
and one independent Claude RED review is required before merging.
