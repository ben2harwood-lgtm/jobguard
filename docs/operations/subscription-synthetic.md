# Synthetic subscription operations

Use only made-up MON-1B company/session/input fixtures. No real IdP, data, provider, spending, messages or charging are authorized. The internal application is not a public endpoint. Trial activation and entitlement enforcement belong to B and C after A merges.

An owner reviews monthly terms and their exact hash, then submits `accept`. Administrative reads use the same persisted company bridge, but admin cannot accept or approve simulated collection. Date/time and actor are server-derived. Annual and reanchoring requests fail closed. No first-period stub is guessed: issue requires all dates covered by accepted terms and the original monthly anchor.

Load immutable meter sources through existing migration-only MON-1B fixture infrastructure. `review` can persist the live supplied-source grace-crossing Decision before period issue; it requires the latest source revision and accepted plan. There is no lifecycle scheduler installed. `issue` recomputes source counts under accepted terms, allocates lines, disposes corrections and creates a hypothetical principal-only document atomically with its receipt and audit. Cached MON-1B totals never set the principal. An issued receiving period refuses further late corrections; investigate upstream timing rather than moving them to another period.

Alerts:

- `CORRECTION_EXCESS_UNCOLLECTED`: full positive correction exceeded receiving headroom. Inspect full/applied/excess and exact statement lines. Leave the excess uncollected; no automatic future charge or maximum override.
- `NEGATIVE_CORRECTION_POLICY_HOLD`: retain the negative source fact. Refund, negative balance and future credit need separate supplied policy. No simulated refund is created.
- Existing MON-1B `METER_CACHE_MISMATCH`: projection drift; inspect source and recompute through the existing meter tools. Preserve issued documents.
- Unknown simulation outcome: reconcile the exact existing work; do not execute again. Every result remains synthetic.

For simulation, the owner approves the exact immutable statement hash/amount. The executor first claims durable work in PostgreSQL, releases the transaction, calls the provider-neutral synthetic adapter, then persists its result through checked SQL. An adapter exception becomes `outcome_unknown`; a redirect is never settlement. If result persistence fails after adapter execution, the attempt remains and requires reconciliation. There is no live provider fallback. Revoked/expired owners or changed agreement revisions fail execution checks. Synthetic approval expiry uses the accepting session's persisted expiry; expired work requires a fresh permitted approval, never fabricated standing consent.

Current owner/admin reads survive plan changes. Shared-practice company summary remains forbidden. Support does not gain a new role or shadow-data access.

CI handoff must run PostgreSQL and populated upgrade tests with migration 0190 (dispatcher renumbers on merge), inspect exact LP-0 grants and tenancy catalogs, and execute the mandatory repository checks. The local sandbox cannot prove those database assertions. RED requires two independent Claude checks bound to the final dispatcher commit and separate acceptance. Founder retains commit/push/merge/release ownership.

Installation is one transaction and rolls back on failure. After installation retain all accepted history and issued facts; repair additively. No data backfill or deletion is part of this migration.

A durable claimed attempt with no result (process interruption or lost result persistence) is also reconciled without another execution. A completed redirect alone is not a settlement or an unknown-outcome retry permission.

## MON-2B dark provider adapter

`SubscriptionStripeSandboxAdapter` implements the existing `SubscriptionPaymentAdapter` port;
it is not installed in any HTTP route or live provider factory. Supply an exact MON-2A approved
work claim, tenant and synthetic D05 collection bound from trusted fixture setup, then use the
existing `SubscriptionExecutor`. Construction and every call refuse live environments and extra
fields. The adapter never recomputes prices. Provider proration, retries and emails are fixed off.
No migration, dependency, environment variable, provider key or network endpoint is added.

Fake submission returns `outcome_unknown`; a checkout event does not settle it. The fixture helper
`signSubscriptionSandboxEvent` produces HMAC envelopes using public, explicitly synthetic signing
material. This tests tamper detection and binding, **not Stripe protocol compatibility or real
provider sandbox integration**. Webhooks bind tenant, work, statement, exact amount, currency and
content hash. Identical deliveries and distinct event IDs for the same payment yield the same
result ID. The existing SQL receipt and work constraints own the durable business effects.

The fake's payment/event history is in memory. Keep the same fake instance during a sandbox journey;
recreating it cannot prove provider recovery after restart. Refunds and contradictory terminal
events produce `SANDBOX_REVERSAL_REQUIRES_REVIEW` regardless of arrival order. They cannot authorize
another charge or resurrect settlement. This slice does not compensate a previously recorded
settlement; a real reversal requires the separately approved refund/accounting path. No fee,
allocation, final-account lock or hidden-data interface is exposed.

Evidence is deterministic fake sandbox evidence only. G4-S, approved D05, D09 v4 and D02, live
M4-10/M4-13, durable real webhook ingestion, real provider protocol verification, approved VAT,
restart recovery and live reversal compensation remain required before production. CI must run
`test/subscription-stripe-sandbox.integration.test.ts` and existing subscription PostgreSQL suites;
the restricted builder sandbox cannot run PostgreSQL. One independent exact-head Claude RED
review and green required CI remain merge gates under the current simple loop.
