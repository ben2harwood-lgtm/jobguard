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
