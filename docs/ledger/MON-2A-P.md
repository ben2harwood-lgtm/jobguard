# MON-2A-P assertion ledger

Sub-order A only. Dispatch base b881f90b; migration 0190. All persistence claims below describe implemented source and written tests, not PostgreSQL execution. PostgreSQL/browser suites are NOT RUN under the dispatcher restriction. The practice server/database row remains open pending CI and RED verdicts.

| Assertion | Evidence |
|---|---|
| 31st anchor returns after February; leap/DST dates; same-day revision; annual refusal | `subscription-persistence.test.ts` named tests; strict SQL terms/anchor checks |
| Stable place and representative source revision; canonical allowances/grace/pennies/hash | `subscription-allocation.test.ts`; SQL immutable place/source bindings and largest remainder |
| Nine figures: 34800, 82800, 8900, 7900, 16900, 4900, 4900, 6233, 6965 | `all nine card figures survive persisted issue` writes every period; PostgreSQL NOT RUN; earlier pure fixtures preserved |
| Owner-only acceptance; active SSO-aware company access; no shared company summary | `subscription-authority.integration.test.ts`, API per-call authority tests |
| Pending downgrade waits, current capacity/authority/revision recheck; retained reads | `pending downgrade waits and rechecks capacity`, immutable change outcome rows |
| Cached totals and fixture plan/trial/annual flags cannot price issue | `source replay defeats corrupted cached totals`; repository replays source through core before commit |
| Corrections apply once, share maximum, retain excess and negative facts | Replay/statements integration tests, correction disposition and alert constraints; receiving-closed regression |
| Immutable statement/line totals; no fee sources, VAT or journals | Statements and upgrade integration tests; preserved subscription architecture tests |
| Exact receipt retry, cross-family/payload/actor conflict, transaction rollback | `subscription-replay.integration.test.ts`; shared receipt namespace and audit-last lock order |
| Thirteen grace; fourteen review; sustained three periods; mandatory Decision + card; no track move | Statements integration tests, explicit pre-issue `review` command, issue-time review, existing pure detector tests |
| Onboarding recommendation only | Strict onboarding command and immutable recommendation row |
| Exact synthetic work/results; redirect, duplicate and unknown handling | Adapter unit tests and statements integration tests; no network provider |
| Migration alone on populated predecessors, successors/repeat, negative controls, exact grants | `subscription-upgrade.integration.test.ts`, bounded tenancy and LP-0 additions; PostgreSQL NOT RUN |
| Typed internal API and no client authority | Four named `subscription.application.test.ts` cases; strict command schemas |

B/C's persisted interfaces and row semantics are published in `docs/contracts/subscription-v1.md`. `SubscriptionRepository`, `SubscriptionMeterSource`, `PlatformSubscriptionStatementRepository`, `SubscriptionExecutor`, adapter schemas and `subscriptionTermsContentHash` are additive DB exports. The core exports separately versioned calendar, accepted-plan selector and allocation functions; old preview schemas remain unchanged.

Superseded holds: MON-1/1B are merged; 0184 supplies the company bridge and source identities; no dedicated meter role exists. The transitive shadow import is already repaired. This dispatch permits only necessary catalogue/inventory additions. Old migration reservations and no-meter/no-authority claims are withdrawn. No shared runner/register changes were made.

Item-specific STOPs retained: refunds/negative-balance settlement/future credit/excess collection/maximum override; unspecified first-period stubs/reanchoring/trial conversion; broader roles/historical access/standing consent/impersonation/shared-company visibility; Q9 legal notice/agreement/DPA/track execution; real provider/identity/card mandate/automatic conversion; real data/spend/deletion/outward actions and all listed live gates. Other authorized synthetic work proceeds. Negative correction facts remain visible with a hold alert rather than discarded.

Verification details and actual exits are in `docs/verdicts/MON-2A-P/BUILDER_RECEIPT.md`. Same-model source inspection is not an independent verdict. No builder self-acceptance, commit or push is performed.
