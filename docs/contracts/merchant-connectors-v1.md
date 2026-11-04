# M5-4 merchant connector contract (dark)

The registry in `packages/core/src/merchant-connectors.ts` separates read, quote,
order and acknowledgment. Only fictional read is available. Each capability carries
fixture source, terms, access-route and regional-approval references; these are test
fixtures, not verified merchant terms, G5 approval or permission to connect live.
Unknown merchants, missing environment, and environments other than `synthetic_demo`
are refused. There are no endpoints, keys, scraping or credential-sharing fallbacks.
Quote/order/acknowledgment capabilities remain unavailable. Future M5-5 routes need
per-merchant verification and data approval; purchase authority must bind an exact
approved order through the existing command/outbox, regardless of read access.

The existing M2-2-S fixture-only input boundary remains the only transport. The new
`fixture_portal` channel and `merchant-*` fixtures require the server's synthetic-demo
environment. Existing picker/mail fixture behavior is retained; neither path accepts
arbitrary bytes, URLs, supplier identities or live account credentials. Mail aliases
must match the exact fictional mailbox; aliases are routing metadata, never identity
or authorization. Membership and job access remain the existing verified-context and
PracticeAccess boundaries. A future real mailbox needs a separately approved route.

Supplier identity resolves from the trusted connector's fictional account, not sender
names. Unknown account, schema version/shape or invalid amounts cause quarantine.
The existing unique tenant/job/supplier/type/content identity deduplicates bytes across
channels. Each fresh arrival retains its own intake row and channel, even when it
points to the same document. Replays return the stored command result without adding
an arrival; changed use of a command ID conflicts. Existing command serialization
protects concurrent arrivals.

Different bytes for a known document number create a held original with a tenant/job
qualified canonical link. No fact proposal is extracted from held sources. Review
reasons remain in the workspace and `merchant_document.review_required` audit events
provide an operational alert signal. Review does not automatically release quarantine.
Proposals display source text matched by hash, not by ambiguous document number.
Credits stay separate documents and never reverse a posting or create an allocation.
Acknowledgments are unsupported and cannot become delivery or settlement facts.

New merchant ingestion cannot update prices, order quantities, deliveries, ownership,
locked final accounts or hidden data. The pre-existing `materials-B-delivery` practice
fixture retains its established explicit synthetic goods-receipt behavior; changed
merchant delivery fixtures never use that path. Existing final-lock source guards
continue to refuse invoice ingestion. No shadow-table query, fee or settlement write
is added. No real provider, customer data, payment or deployment is part of this slice.
